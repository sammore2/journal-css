/**
 * Journal CSS Module - Dynamic Theme Engine V3
 * Author: Rob Sammore
 */
/// <reference path="../../node_modules/@league-of-foundry-developers/foundry-vtt-types/src/index.d.mts" />
const MODULE_ID = "journal-css";
/**
 * Registry to handle theme definitions and loading from JSON
 */
class ThemeRegistry {
    static themes = [];
    static async initialize() {
        try {
            // 1. Load Local Themes
            const localResponse = await fetch("/modules/journal-css/themes.json");
            if (!localResponse.ok)
                throw new Error(`HTTP Error ${localResponse.status}`);
            const localData = await localResponse.json();
            console.log(`${MODULE_ID} | Loaded ${localData.length} local themes`);
            // 2. Load User Themes (from settings)
            const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
            userThemes.forEach(t => t.isUserTheme = true);
            // Merge all (avoiding duplicates from themes.json)
            const uniqueThemes = new Map();
            // Load local first, then overwrite with user themes if same ID
            localData.forEach(t => uniqueThemes.set(t.id, t));
            userThemes.forEach(t => uniqueThemes.set(t.id, t));
            this.themes = Array.from(uniqueThemes.values());
            this.injectGlobalStyles();
            // Preload layout templates
            const templatePaths = this.themes.map(t => t.layoutPath).filter(Boolean);
            if (templatePaths.length > 0) {
                try {
                    await foundry.applications.handlebars.loadTemplates(templatePaths);
                    console.log(`${MODULE_ID} | Preloaded ${templatePaths.length} layout templates`);
                }
                catch (err) {
                    console.error(`${MODULE_ID} | Failed to preload layout templates`, err);
                }
            }
        }
        catch (e) {
            console.error(`${MODULE_ID} | Failed to initialize theme engine`, e);
        }
    }
    static injectGlobalStyles() {
        let styleTag = document.getElementById(`${MODULE_ID}-dynamic-themes`);
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = `${MODULE_ID}-dynamic-themes`;
            document.head.appendChild(styleTag);
        }
        const buttonCSS = `
.journal-css-create-template-btn {
  width: 100%;
  margin-top: 5px;
  background: rgba(0, 0, 0, 0.1);
  border: 1px solid var(--color-border-light-2, #c9c7b8);
  border-radius: 3px;
  padding: 5px 10px;
  color: var(--color-text-light-highlight, #f0f0e0);
  font-family: var(--font-primary, 'SignikaNegative');
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}
.journal-css-create-template-btn:hover {
  background: rgba(0, 0, 0, 0.2);
  color: var(--color-shadow-primary, #ff6400);
  border-color: var(--color-shadow-primary, #ff6400);
  box-shadow: 0 0 5px var(--color-shadow-primary, #ff6400);
}
`;
        // Aggregate all embedded CSS from themes
        styleTag.textContent = buttonCSS + "\n\n" + this.themes
            .filter(t => t.css)
            .map(t => `/* Theme: ${t.id} */\n${t.css}`)
            .join("\n\n");
    }
    static getTheme(id) {
        return this.themes.find(t => t.id === id);
    }
    static getThemeList() {
        return this.themes;
    }
    static layoutCache = {};
    static async preloadLayouts() {
        for (const theme of this.themes) {
            if (theme.contentTemplate) {
                this.layoutCache[theme.id] = theme.contentTemplate;
            }
            else if (theme.layoutPath) {
                try {
                    this.layoutCache[theme.id] = await foundry.applications.handlebars.renderTemplate(theme.layoutPath, {});
                }
                catch (err) {
                    console.error(`${MODULE_ID} | Failed to preload layout for ${theme.id}:`, err);
                }
            }
        }
    }
    static getThemeLayoutSync(id) {
        if (this.layoutCache[id])
            return this.layoutCache[id];
        const theme = this.getTheme(id);
        if (!theme)
            return null;
        return theme.contentTemplate || `<h2>${theme.name}</h2><p>Modelo padrão injetado. Adicione conteúdo aqui.</p>`;
    }
    /**
     * Returns a base HTML template for specific themes
     */
    static async getThemeLayout(id) {
        const theme = this.getTheme(id);
        if (!theme) {
            console.warn(`${MODULE_ID} | Theme not found for layout: ${id}`);
            return null;
        }
        // 1. Prefer contentTemplate (string)
        if (theme.contentTemplate) {
            console.log(`${MODULE_ID} | Using embedded contentTemplate for: ${id}`);
            return theme.contentTemplate;
        }
        // 2. Fallback to layoutPath (HBS)
        if (theme.layoutPath) {
            console.log(`${MODULE_ID} | Falling back to layoutPath for: ${id} (${theme.layoutPath})`);
            try {
                return await foundry.applications.handlebars.renderTemplate(theme.layoutPath, {});
            }
            catch (err) {
                console.error(`${MODULE_ID} | Failed to render layout template: ${theme.layoutPath}`, err);
            }
        }
        // 3. Absolute Fallback
        console.warn(`${MODULE_ID} | No template found for theme: ${id}. Using generic fallback.`);
        return `<h2>${theme.name}</h2><p>Modelo padrão injetado. Adicione conteúdo aqui.</p>`;
    }
    /**
     * Applies CSS variables to a specific element based on theme configuration
     */
    static applyThemeVariables(element, themeId, customValues) {
        const theme = this.getTheme(themeId);
        if (!theme || !theme.variables)
            return;
        theme.variables.forEach(v => {
            const val = customValues[v.key] ?? v.default;
            const unit = v.type === "range" && v.key.includes("size") ? "px" : "";
            element.style.setProperty(v.key, `${val}${unit}`);
        });
    }
}
/**
 * Theme Selector Application (ApplicationV2)
 */
class ThemeSelector extends foundry.applications.api.ApplicationV2 {
    document;
    tabGroups = { main: "gallery" };
    _selectedThemeId = null;
    _hasClickDelegation = false;
    _tabsInitialized = false;
    _isApplyingLayout = false;
    constructor(options = {}) {
        super(options);
        const doc = options.document;
        if (typeof doc === "string")
            this.document = fromUuidSync(doc);
        else
            this.document = doc;
        if (!this.document) {
            console.error(`${MODULE_ID} | ThemeSelector initialized without a valid document context.`);
        }
    }
    /**
     * Configuration for application tabs.
     */
    static TABS = {
        main: {
            navSelector: "nav.tabs",
            contentSelector: ".selector-content",
            initial: "gallery"
        }
    };
    /**
     * Interactivity handlers via static ACTIONS.
     */
    /**
     * Interactivity handlers via static ACTIONS.
     */
    static ACTIONS = {
        selectTheme: function (event, target) {
            event.preventDefault();
            const themeId = target.dataset.theme || "none";
            this._selectedThemeId = themeId;
            // Live Preview
            this.refreshJournalWindows();
            this.render(true);
        },
        deleteTheme: async function (event, target) {
            event.stopPropagation();
            const themeId = target.dataset.theme;
            if (!themeId)
                return;
            const confirm = await Dialog.confirm({
                title: game.i18n.localize("JOURNAL_CSS.Dialog.DeleteTheme.Title"),
                content: game.i18n.localize("JOURNAL_CSS.Dialog.DeleteTheme.Content"),
            });
            if (!confirm)
                return;
            const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
            const filtered = userThemes.filter((t) => t.id !== themeId);
            await game.settings.set(MODULE_ID, "userThemes", filtered);
            if (this._selectedThemeId === themeId)
                this._selectedThemeId = "none";
            this.render(true);
        },
        installTheme: async function () {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file)
                    return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const themeData = JSON.parse(event.target.result);
                        const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
                        userThemes.push(themeData);
                        await game.settings.set(MODULE_ID, "userThemes", userThemes);
                        this.render(true);
                    }
                    catch (err) {
                        ui.notifications.error("Failed to parse theme file.");
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        },
        createTheme: async function () {
            if (!game.user.isGM)
                return;
            // Simple prompt for now, could be a full form later
            const themeId = await foundry.applications.api.DialogV2.prompt({
                window: { title: "Novo Tema" },
                content: `
          <div class="form-group">
            <label>ID do Tema (unico, sem espaços)</label>
            <input type="text" id="new-theme-id" placeholder="meu-tema-fantasia">
          </div>
          <div class="form-group">
            <label>Nome Visível</label>
            <input type="text" id="new-theme-name" placeholder="Manuscrito Real">
          </div>
        `,
                ok: {
                    label: "Criar Estrutura",
                    callback: (event, button, html) => {
                        return {
                            id: html.querySelector("#new-theme-id").value,
                            name: html.querySelector("#new-theme-name").value
                        };
                    }
                }
            });
            if (themeId && themeId.id) {
                const newTheme = {
                    id: themeId.id,
                    name: themeId.name,
                    icon: "fas fa-feather-alt",
                    css: `.journal-theme-${themeId.id} { background: #fff; color: #000; }`,
                    contentTemplate: `<h2>${themeId.name}</h2><p>Lorem ipsum dolor sit amet...</p>`,
                    variables: []
                };
                const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
                userThemes.push(newTheme);
                await game.settings.set(MODULE_ID, "userThemes", userThemes);
                this.render(true);
            }
        },
        saveSettings: async function (event, form, formData) {
            const data = formData.object;
            const themeVars = {};
            Object.keys(data).forEach(key => { if (key.startsWith("--"))
                themeVars[key] = data[key]; });
            const tweaks = { fontSize: data.fontSize, fontFamily: data.fontFamily };
            // Executa um update atômico único para evitar colisões de concorrência na re-renderização nativa do Foundry V14
            const updateData = {
                [`flags.${MODULE_ID}.theme`]: data.theme,
                [`flags.${MODULE_ID}.customCSS`]: data.customCSS,
                [`flags.${MODULE_ID}.themeVars`]: themeVars,
                [`flags.${MODULE_ID}.tweaks`]: tweaks
            };
            await this.document.update(updateData);
            this._selectedThemeId = null;
            this.refreshJournalWindows();
            ui.notifications.info(game.i18n.localize("JOURNAL_CSS.Notifications.SettingsSaved"));
        },
        applyAtomicLayout: async function (event, target) {
            if (this._isApplyingLayout)
                return;
            this._isApplyingLayout = true;
            try {
                const themeId = target.getAttribute("data-theme");
                console.log(`${MODULE_ID} | Action: applyAtomicLayout | themeId:`, themeId);
                if (!themeId) {
                    console.error(`${MODULE_ID} | Element clicked without data-theme attribute`, target);
                    ui.notifications.warn("Nenhum ID de tema encontrado no elemento clicado.");
                    return;
                }
                const confirm = await foundry.applications.api.DialogV2.confirm({
                    window: { title: "Aplicar Modelo?" },
                    content: `<p>Isso criará uma nova página no diário usando o modelo base deste tema. Deseja continuar?</p>`,
                    modal: true
                });
                if (!confirm)
                    return;
                // Inject layout to create a new page
                await this._applyLayout(themeId);
            }
            finally {
                this._isApplyingLayout = false;
            }
        }
    };
    async _applyLayout(themeId) {
        ui.notifications.info(`Iniciando aplicação do modelo: ${themeId}...`);
        const layoutHTML = await ThemeRegistry.getThemeLayout(themeId);
        if (!layoutHTML) {
            ui.notifications.error(`Falha: Modelo HTML não encontrado para "${themeId}".`);
            return;
        }
        const theme = ThemeRegistry.getTheme(themeId);
        const pageName = theme ? theme.name : "Nova Página";
        // 1. Se o seletor foi aberto de dentro de uma página existente (JournalEntryPage), atualiza a página atual em vez de duplicar!
        if (this.document && this.document.documentName === "JournalEntryPage") {
            console.log(`${MODULE_ID} | Atualizando página existente com modelo:`, this.document.id);
            try {
                const currentName = this.document.name;
                const isDefaultName = currentName === "Nova Página" || currentName === "New Page" || currentName.startsWith("Página") || currentName.startsWith("Page") || currentName === "Texto" || currentName === "Text";
                await this.document.update({
                    name: isDefaultName ? pageName : currentName,
                    "text.content": layoutHTML,
                    "text.format": 1, // HTML/ProseMirror
                    [`flags.${MODULE_ID}.theme`]: themeId
                });
                ui.notifications.info(`Modelo aplicado com sucesso à página "${this.document.name}".`);
                this.close();
                return;
            }
            catch (err) {
                console.error(`${MODULE_ID} | Erro ao atualizar a página existente:`, err);
                ui.notifications.error(`Erro ao aplicar modelo: ${err.message}`);
                return;
            }
        }
        // 2. Caso contrário (se foi aberto pela janela principal do diário), identifica o JournalEntry pai e cria uma página nova
        let journal = this.document;
        if (journal && journal.documentName !== "JournalEntry") {
            if (journal.parent && journal.parent.documentName === "JournalEntry") {
                journal = journal.parent;
            }
            else if (journal.collectionName === "pages" && journal.parent) {
                journal = journal.parent;
            }
        }
        if (!journal || journal.documentName !== "JournalEntry") {
            console.error(`${MODULE_ID} | Contexto inválido para criação de página:`, this.document);
            ui.notifications.error("Erro: Não foi possível localizar o Diário pai para criar a página.");
            return;
        }
        console.log(`${MODULE_ID} | Criando página em: ${journal.name} (${journal.uuid})`);
        try {
            // 2. Create the new page
            const pageData = {
                name: `${pageName} - ${new Date().toLocaleTimeString()}`,
                type: "text",
                text: {
                    content: layoutHTML,
                    format: 1 // Format 1 = HTML/ProseMirror in Foundry V14
                },
                flags: {
                    [MODULE_ID]: {
                        theme: themeId
                    }
                }
            };
            console.log(`${MODULE_ID} | Criando embedded com dados:`, pageData);
            const created = await journal.createEmbeddedDocuments("JournalEntryPage", [pageData]);
            if (created && created.length > 0) {
                const newPage = created[0];
                console.log(`${MODULE_ID} | Página criada com sucesso:`, newPage.id);
                if (journal.sheet) {
                    journal.sheet.render(true, { pageId: newPage.id });
                }
                this.close();
            }
            else {
                console.warn(`${MODULE_ID} | createEmbeddedDocuments retornou vazio.`);
                ui.notifications.warn("O diário não criou a página (resultado vazio). Verifique permissões.");
            }
        }
        catch (err) {
            console.error(`${MODULE_ID} | Falha crítica na criação da página:`, err);
            ui.notifications.error(`Erro ao criar página: ${err.message}`);
        }
    }
    /** @override */
    static DEFAULT_OPTIONS = {
        id: "journal-theme-selector",
        tag: "form",
        window: {
            title: "JOURNAL_CSS.Settings.Theme.Label",
            icon: "fas fa-palette",
            resizable: true,
            controls: []
        },
        position: { width: 550, height: 750 },
        form: {
            handler: ThemeSelector.ACTIONS.saveSettings,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            selectTheme: ThemeSelector.ACTIONS.selectTheme,
            installTheme: ThemeSelector.ACTIONS.installTheme,
            deleteTheme: ThemeSelector.ACTIONS.deleteTheme,
            createTheme: ThemeSelector.ACTIONS.createTheme,
            applyAtomicLayout: ThemeSelector.ACTIONS.applyAtomicLayout
        }
    };
    /**
     * Mandated template modularization via static PARTS.
     */
    static PARTS = {
        selector: {
            template: "modules/journal-css/templates/theme-selector.hbs"
        }
    };
    /** @override */
    async _prepareContext(options) {
        if (ThemeRegistry.getThemeList().length === 0)
            await ThemeRegistry.initialize();
        const currentThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
        const themes = ThemeRegistry.getThemeList().map(t => ({
            ...t,
            name: game.i18n.localize(t.name),
            isActive: t.id === currentThemeId,
            hasTemplate: !!(t.contentTemplate || t.layoutPath)
        }));
        const selectedTheme = ThemeRegistry.getTheme(currentThemeId);
        const currentVars = this.document.getFlag(MODULE_ID, "themeVars") || {};
        const variables = selectedTheme?.variables?.map(v => ({ ...v, value: currentVars[v.key] ?? v.default })) || [];
        const tweaks = this.document.getFlag(MODULE_ID, "tweaks") || { fontSize: 16, fontFamily: "" };
        return {
            currentTheme: currentThemeId,
            customCSS: this.document.getFlag(MODULE_ID, "customCSS") || "",
            tweaks,
            themes,
            variables,
            hasVariables: variables.length > 0,
            isGM: game.user.isGM
        };
    }
    /** @override */
    async _renderHTML(context, options) {
        const parts = options.parts ?? Object.keys(ThemeSelector.PARTS);
        const rendered = await Promise.all(parts.map(async (partId) => {
            const part = ThemeSelector.PARTS[partId];
            return foundry.applications.handlebars.renderTemplate(part.template, context);
        }));
        return rendered.join("");
    }
    /** @override */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
    }
    /** @override */
    _onRender(context, options) {
        // 1. Action Delegation (More robust than individual listeners)
        if (!this._hasClickDelegation) {
            this.element.addEventListener("click", ev => {
                const target = ev.target.closest("[data-action]");
                if (!target)
                    return;
                const action = target.dataset.action;
                const handler = this.constructor.ACTIONS[action];
                if (handler) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    console.log(`${MODULE_ID} | Triggering action: ${action}`);
                    handler.call(this, ev, target);
                }
            });
            this._hasClickDelegation = true;
        }
        // 2. Initialize Tabs (Must re-bind on every render because innerHTML is replaced)
        for (const [group, config] of Object.entries(this.constructor.TABS)) {
            const tabConfig = config;
            new foundry.applications.ux.Tabs({
                ...tabConfig,
                initial: this.tabGroups[group] || tabConfig.initial,
                callback: (event, tabs, active) => {
                    this.tabGroups[group] = active;
                }
            }).bind(this.element);
        }
    }
    refreshJournalWindows() {
        Object.values(ui.windows).forEach((app) => {
            if (app.document?.uuid === this.document.uuid || app.document?.parent?.uuid === this.document.uuid) {
                // Pass temporary selection to the apply function
                // Note: we'd need to gather current editor vars too if we wanted full live edit preview
                // but for now let's focus on theme selection
                applyJournalTheme(app, this._selectedThemeId || undefined);
            }
        });
    }
}
function getThemeSelectorClass() {
    return ThemeSelector;
}
Hooks.once("init", async () => {
    console.log(`${MODULE_ID} | Initializing Journal CSS V3`);
    // Register Handlebars Helpers
    Handlebars.registerHelper("eq", (a, b) => a === b);
    // Register Settings
    game.settings.register(MODULE_ID, "userThemes", {
        name: "User Themes",
        scope: "world",
        config: false,
        type: Array,
        default: [],
        onChange: () => ThemeRegistry.initialize()
    });
    await ThemeRegistry.initialize();
    // Register Keybinding
    game.keybindings.register(MODULE_ID, "openSelector", {
        name: "Open Theme Selector",
        hint: "Open the visual theme selector for the current journal.",
        editable: [{ key: "KeyT", modifiers: ["Alt"] }],
        onDown: () => {
            const activeApp = Object.values(ui.windows).find((app) => app.rendered && app.document?.documentName?.startsWith("JournalEntry"));
            if (activeApp) {
                const Cls = getThemeSelectorClass();
                new Cls({ document: activeApp.document }).render(true);
            }
        }
    });
});
function injectThemeButton(appEl, appObj) {
    // ONLY inject if the sheet is editable
    const isEditable = appObj.isEditable || appObj.options?.editable;
    if (!isEditable)
        return;
    // Enhanced header detection for V14 JournalPageSheet
    let header = appObj?.window?.header || appEl.querySelector("header, .window-header");
    // Fallback: search parents if nested
    if (!header && appEl.parentElement) {
        header = appEl.closest(".window-app")?.querySelector(".window-header");
    }
    if (!header) {
        requestAnimationFrame(() => {
            const retryEl = appObj.element || appEl;
            if (retryEl)
                injectThemeButton(retryEl, appObj);
        });
        return;
    }
    if (header.querySelector(".journal-css-selector"))
        return;
    const isPage = appObj.document?.documentName === "JournalEntryPage";
    if (!isPage)
        return; // Injeta o botão apenas na janela de edição/página solta, mantendo o Registro principal limpo
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("header-control", "journal-css-selector");
    btn.innerHTML = '<i class="fas fa-swatchbook"></i>';
    btn.title = "Modelos de Página";
    btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        let doc = appObj?.document;
        if (!doc && appEl.dataset.uuid)
            doc = fromUuidSync(appEl.dataset.uuid);
        if (doc) {
            const existingApp = Object.values(ui.windows).find((app) => app.id === "journal-theme-selector");
            if (existingApp) {
                existingApp.render(true);
                existingApp.bringToFront();
            }
            else {
                const Cls = getThemeSelectorClass();
                new Cls({ document: doc }).render(true);
            }
        }
    };
    const closeBtn = header.querySelector(".header-control.close, [data-action='close'], .close");
    if (closeBtn)
        closeBtn.before(btn);
    else
        header.appendChild(btn);
}
function injectTemplateSelectIntoCreateDialog(app, html) {
    const element = html[0] || html;
    // Verifica se é a janela/diálogo nativo de criar página de diário
    const title = app.data?.title || app.title || app.options?.title || "";
    if (!title.toLowerCase().includes("página") && !title.toLowerCase().includes("page"))
        return;
    if (element.querySelector(`.${MODULE_ID}-template-select`))
        return;
    const typeSelect = element.querySelector("select[name='type']");
    if (!typeSelect)
        return;
    const typeFormGroup = typeSelect.closest(".form-group") || typeSelect.closest(".form-field");
    if (!typeFormGroup)
        return;
    const formGroup = document.createElement("div");
    formGroup.classList.add("form-group");
    formGroup.innerHTML = `
    <label><i class="fas fa-swatchbook"></i> Modelo</label>
    <div class="form-fields">
      <select name="journal-css-template" class="${MODULE_ID}-template-select">
        <option value="none">Padrão do Foundry (Em Branco)</option>
        ${ThemeRegistry.getThemeList().map(t => `<option value="${t.id}">${t.name}</option>`).join("")}
      </select>
    </div>
  `;
    const select = formGroup.querySelector("select");
    const updatePending = () => {
        game._pendingJournalCSSTemplate = {
            template: select.value,
            time: Date.now()
        };
        console.log(`${MODULE_ID} | Modelo agendado para criação:`, game._pendingJournalCSSTemplate);
    };
    select.addEventListener("change", updatePending);
    updatePending(); // Inicializa com 'none'
    typeFormGroup.after(formGroup);
}
Hooks.on("renderDialog", injectTemplateSelectIntoCreateDialog);
Hooks.on("renderJournalEntryPageConfig", injectTemplateSelectIntoCreateDialog);
Hooks.on("preCreateJournalEntryPage", (doc, data, options, userId) => {
    const pending = game._pendingJournalCSSTemplate;
    if (!pending)
        return;
    if (Date.now() - pending.time > 30000)
        return;
    if (pending.template !== "none") {
        const themeId = pending.template;
        console.log(`${MODULE_ID} | Interceptando preCreateJournalEntryPage para aplicar modelo:`, themeId);
        const layoutHTML = ThemeRegistry.getThemeLayoutSync(themeId);
        if (layoutHTML) {
            doc.updateSource({
                "text.content": layoutHTML,
                "text.format": 1, // HTML/ProseMirror
                [`flags.${MODULE_ID}.theme`]: themeId
            });
        }
        delete game._pendingJournalCSSTemplate;
    }
});
async function applyJournalTheme(sheet, themeOverride, varsOverride) {
    // Target the specific container for the page/content, not the whole window
    const element = sheet.element;
    if (!element)
        return;
    const doc = sheet.document;
    if (!doc)
        return;
    // Inherit theme from parent if this is a page
    const parentTheme = doc.parent?.getFlag(MODULE_ID, "theme");
    const selectedTheme = themeOverride || doc.getFlag(MODULE_ID, "theme") || parentTheme || "none";
    // Find the content container (the actual "sheet" or "page")
    const targetEl = element.querySelector(".journal-entry-page, .journal-entry-pages, .editor-container, .journal-page-content, .page-content, .editor-content, .prosemirror, .ProseMirror") || element;
    targetEl.classList.forEach((cls) => { if (cls.startsWith('journal-theme-'))
        targetEl.classList.remove(cls); });
    if (selectedTheme !== "none")
        targetEl.classList.add(`journal-theme-${selectedTheme}`);
    const parentVars = doc.parent?.getFlag(MODULE_ID, "themeVars") || {};
    const themeVars = varsOverride || doc.getFlag(MODULE_ID, "themeVars") || parentVars || {};
    ThemeRegistry.applyThemeVariables(targetEl, selectedTheme, themeVars);
    const contentEl = element.querySelector(".ProseMirror, .editor-content, .page-content, .journal-page-content");
    if (!contentEl)
        return;
    // Legacy Tweaks (Compat)
    const tweaks = doc.getFlag(MODULE_ID, "tweaks") || doc.parent?.getFlag(MODULE_ID, "tweaks") || {};
    if (tweaks.fontSize)
        contentEl.style.fontSize = `${tweaks.fontSize}px`;
    if (tweaks.lineHeight)
        contentEl.style.lineHeight = tweaks.lineHeight;
    if (tweaks.textAlign)
        contentEl.style.textAlign = tweaks.textAlign;
    if (tweaks.fontFamily)
        contentEl.style.fontFamily = tweaks.fontFamily;
    // Custom CSS
    const customCSS = doc.getFlag(MODULE_ID, "customCSS") || doc.parent?.getFlag(MODULE_ID, "customCSS");
    let styleTag = element.querySelector(`#${MODULE_ID}-custom-style`);
    if (customCSS) {
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = `${MODULE_ID}-custom-style`;
            element.appendChild(styleTag);
        }
        styleTag.textContent = customCSS;
    }
    else if (styleTag)
        styleTag.remove();
    // Configura um MutationObserver ultraleve no element para interceptar quando o Foundry V14 alterna dinamicamente para o modo de edição (ProseMirror)
    if (!element._journalThemeObserver) {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    // Se algum nó adicionado for o editor ProseMirror ou contiver o editor, re-aplica a classe do tema
                    const addedEditor = Array.from(m.addedNodes).find(n => n.classList && (n.classList.contains("editor") || n.classList.contains("ProseMirror") || n.classList.contains("editor-container") || n.querySelector(".ProseMirror, .editor, .editor-container")));
                    if (addedEditor) {
                        // Re-aplica as classes e variáveis no novo elemento do editor
                        const newTarget = element.querySelector(".journal-entry-page, .journal-entry-pages, .editor-container, .journal-page-content, .page-content, .editor-content, .prosemirror, .ProseMirror") || element;
                        newTarget.classList.forEach((cls) => { if (cls.startsWith('journal-theme-'))
                            newTarget.classList.remove(cls); });
                        if (selectedTheme !== "none")
                            newTarget.classList.add(`journal-theme-${selectedTheme}`);
                        ThemeRegistry.applyThemeVariables(newTarget, selectedTheme, themeVars);
                        break;
                    }
                }
            }
        });
        observer.observe(element, { childList: true, subtree: true });
        element._journalThemeObserver = observer;
    }
}
function injectCreateByTemplateButton(appEl, appObj) {
    // Apenas injeta se a sheet for editável/GM tiver permissão
    const isEditable = appObj.isEditable || appObj.options?.editable;
    if (!isEditable)
        return;
    // Verifica se é a janela principal de um JournalEntry (e não uma página solta)
    const isJournal = appObj.document?.documentName === "JournalEntry";
    if (!isJournal)
        return;
    // Procura a barra lateral de páginas no DOM (V14 e V13 compat)
    const sidebar = appEl.querySelector(".directory-sidebar, .journal-sidebar, .sidebar, .window-content .directory");
    if (!sidebar)
        return;
    if (appEl.querySelector(".journal-css-create-template-btn"))
        return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("journal-css-create-template-btn");
    btn.innerHTML = '<i class="fas fa-swatchbook"></i> Criar por Modelo';
    btn.title = "Criar nova página a partir de um modelo pré-formatado";
    btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        let doc = appObj?.document;
        if (!doc && appEl.dataset.uuid)
            doc = fromUuidSync(appEl.dataset.uuid);
        if (doc) {
            const existingApp = Object.values(ui.windows).find((app) => app.id === "journal-theme-selector");
            if (existingApp) {
                existingApp.render(true);
                existingApp.bringToFront();
            }
            else {
                const Cls = getThemeSelectorClass();
                new Cls({ document: doc }).render(true);
            }
        }
    };
    // Tenta encontrar o botão nativo de criar página ou o footer/header da sidebar
    const createPageBtn = sidebar.querySelector(".create-page, .new-page, [data-action='createPage']");
    const footer = sidebar.querySelector(".directory-footer, .sidebar-footer");
    const header = sidebar.querySelector(".directory-header, .sidebar-header");
    if (createPageBtn) {
        createPageBtn.after(btn);
    }
    else if (footer) {
        footer.appendChild(btn);
    }
    else if (header) {
        header.appendChild(btn);
    }
    else {
        sidebar.appendChild(btn);
    }
}
Hooks.on("renderJournalSheet", (app, html) => {
    const element = html[0] || html;
    applyJournalTheme(app);
    injectThemeButton(element, app);
    injectCreateByTemplateButton(element, app);
});
Hooks.on("renderJournalEntrySheet", (app, html) => {
    const element = html[0] || html;
    applyJournalTheme(app);
    injectThemeButton(element, app);
    injectCreateByTemplateButton(element, app);
});
Hooks.on("renderJournalPageSheet", (app, html) => {
    const element = html[0] || html;
    applyJournalTheme(app);
    injectThemeButton(element, app);
});
Hooks.on("renderJournalEntryPageProseMirrorSheet", (app, html) => {
    const element = html[0] || html;
    applyJournalTheme(app);
    injectThemeButton(element, app);
});
Hooks.on("renderJournalEntryPageTextSheet", (app, html) => {
    const element = html[0] || html;
    applyJournalTheme(app);
    injectThemeButton(element, app);
});
Hooks.on("createProseMirrorEditor", (uuid, plugins, options) => {
    setTimeout(() => {
        Object.values(ui.windows).forEach((app) => {
            if (app.document?.documentName?.startsWith("JournalEntry")) {
                applyJournalTheme(app);
            }
        });
    }, 50);
});
Hooks.on("updateJournalEntryPage", (doc, change, options, userId) => {
    if (change.flags?.[MODULE_ID]) {
        setTimeout(() => {
            Object.values(ui.windows).forEach((app) => {
                if (app.document === doc || app.document?.pages?.get?.(doc.id) || app.document?.id === doc.parent?.id) {
                    applyJournalTheme(app);
                }
            });
        }, 50);
    }
});
Hooks.on("updateJournalEntry", (doc, change, options, userId) => {
    if (change.flags?.[MODULE_ID]) {
        setTimeout(() => {
            Object.values(ui.windows).forEach((app) => {
                if (app.document === doc || app.document?.parent?.id === doc.id) {
                    applyJournalTheme(app);
                }
            });
        }, 50);
    }
});
Hooks.on("ready", async () => {
    await ThemeRegistry.preloadLayouts();
    // Re-apply to all open journals
    Object.values(ui.windows).forEach((app) => {
        if (app.document?.documentName?.startsWith("JournalEntry")) {
            applyJournalTheme(app);
            if (app.element) {
                injectThemeButton(app.element, app);
                injectCreateByTemplateButton(app.element, app);
            }
        }
    });
});
