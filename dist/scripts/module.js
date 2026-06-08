/**
 * Journal CSS Module - Dynamic Theme Engine V3
 * Author: Rob Sammore
 */
/// <reference path="../../node_modules/@league-of-foundry-developers/foundry-vtt-types/src/index.d.mts" />
const MODULE_ID = "journal-css";
/**
 * Lê a licença do Storyteller Cinema do localStorage do Foundry e retorna os tiers ativos.
 * Funciona sem dependência direta do módulo core.
 */
class LicenseManager {
    static getActiveTiers() {
        try {
            // Lê tanto a chave local do journal-css quanto a chave compartilhada do storyteller-cinema
            const localRaw = game.settings.storage?.get("client")?.[`${MODULE_ID}.premiumKeys`];
            const stcRaw = game.settings.storage?.get("client")?.["storyteller-cinema.premiumKeys"];
            const localKeys = localRaw ? JSON.parse(localRaw) : [];
            const stcKeys = stcRaw ? JSON.parse(stcRaw) : [];
            const allKeys = [...localKeys, ...stcKeys];
            if (!allKeys || allKeys.length === 0)
                return ["free"];
            // Presença de qualquer chave válida ativa o tier "premium"
            return ["free", "premium"];
        }
        catch {
            return ["free"];
        }
    }
    static hasTier(tier) {
        if (!tier || tier === "free")
            return true;
        return LicenseManager.getActiveTiers().includes(tier);
    }
    static getLocalKeys() {
        try {
            const localRaw = game.settings.storage?.get("client")?.[`${MODULE_ID}.premiumKeys`];
            return localRaw ? JSON.parse(localRaw) : [];
        }
        catch {
            return [];
        }
    }
    static async addLocalKey(key) {
        const keys = this.getLocalKeys();
        if (keys.includes(key))
            return false;
        keys.push(key);
        // Salva nas configurações locais (client-scope) usando a API de settings do Foundry
        await game.settings.set(MODULE_ID, "premiumKeys", keys);
        return true;
    }
    static async removeLocalKey(key) {
        const keys = this.getLocalKeys();
        const filtered = keys.filter(k => k !== key);
        await game.settings.set(MODULE_ID, "premiumKeys", filtered);
        return true;
    }
}
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
    static _isApplyingLayout = false;
    static _isCreatingTheme = false;
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
        createTheme: async function (event) {
            if (ThemeSelector._isCreatingTheme)
                return;
            ThemeSelector._isCreatingTheme = true;
            try {
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
                        callback: (event, button, dialog) => {
                            const form = button.form;
                            return {
                                id: form.querySelector("#new-theme-id").value,
                                name: form.querySelector("#new-theme-name").value
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
            }
            finally {
                ThemeSelector._isCreatingTheme = false;
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
            if (ThemeSelector._isApplyingLayout)
                return;
            ThemeSelector._isApplyingLayout = true;
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
                ThemeSelector._isApplyingLayout = false;
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
        position: { width: 650, height: 780 },
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
        const activeTiers = LicenseManager.getActiveTiers();
        const isPremiumActive = activeTiers.includes("premium");
        const themes = ThemeRegistry.getThemeList().map(t => {
            const themeTier = t.tier || "free";
            const isLocked = !LicenseManager.hasTier(themeTier);
            return {
                ...t,
                name: game.i18n.localize(t.name),
                isActive: t.id === currentThemeId,
                hasTemplate: !!(t.contentTemplate || t.layoutPath),
                isLocked
            };
        });
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
            isGM: game.user.isGM,
            isPremiumActive
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
        // Must re-bind tabs on every render because _replaceHTML sets content.innerHTML
        for (const [group, config] of Object.entries(this.constructor.TABS)) {
            const tabConfig = config;
            new foundry.applications.ux.Tabs({
                ...tabConfig,
                initial: this.tabGroups[group] || tabConfig.initial,
                callback: (_event, _tabs, active) => {
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
    // Load Google Fonts via link tag instead of CSS @import to avoid CSS cascade issues
    // Register Handlebars Helpers
    Handlebars.registerHelper("eq", (a, b) => a === b);
    // Load Google Fonts via link tag if enabled
    Hooks.once("ready", () => {
        if (game.settings.get(MODULE_ID, "loadGoogleFonts")) {
            const fontLink = document.createElement("link");
            fontLink.rel = "stylesheet";
            fontLink.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono&family=Caveat:wght@500&family=Dancing+Script:wght@600&family=Playfair+Display:wght@400;900&family=Libre+Baskerville:wght@400;700&display=swap";
            document.head.appendChild(fontLink);
        }
    });
    // Register Settings
    game.settings.register(MODULE_ID, "userThemes", {
        name: "User Themes",
        scope: "world",
        config: false,
        type: Array,
        default: [],
        onChange: () => ThemeRegistry.initialize()
    });
    game.settings.register(MODULE_ID, "allowPlayerThemes", {
        name: "JOURNAL_CSS.Settings.AllowPlayerThemes.Name",
        hint: "JOURNAL_CSS.Settings.AllowPlayerThemes.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
    game.settings.register(MODULE_ID, "loadGoogleFonts", {
        name: "JOURNAL_CSS.Settings.LoadGoogleFonts.Name",
        hint: "JOURNAL_CSS.Settings.LoadGoogleFonts.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            // Recarrega a página ou reconstrói para aplicar a mudança de fonte se necessário
        }
    });
    game.settings.register(MODULE_ID, "premiumKeys", {
        name: "Premium Keys",
        scope: "client",
        config: false,
        type: Array,
        default: []
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
Hooks.once("ready", () => {
    // Registra templates no HUD do Storyteller Cinema se ele estiver ativo
    const activeTiers = LicenseManager.getActiveTiers();
    const allThemes = ThemeRegistry.getThemeList();
    const availableTemplates = allThemes
        .filter(t => LicenseManager.hasTier(t.tier || "free"))
        .map(t => ({
        id: t.id,
        name: t.name,
        moduleId: MODULE_ID,
        tier: t.tier || "free"
    }));
    Hooks.callAll("registerStorytellerCinemaTemplates", {
        moduleId: MODULE_ID,
        label: "Journal CSS",
        icon: "fas fa-book-open",
        templates: availableTemplates
    });
});
Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root)
        return;
    const stcGroup = root.querySelector('.tab[data-tab="journal-css"]') || root.querySelector('[data-category="journal-css"]');
    if (!stcGroup)
        return;
    if (stcGroup.querySelector('.journal-css-premium-banner'))
        return;
    const banner = document.createElement('div');
    banner.className = 'journal-css-premium-banner';
    Object.assign(banner.style, {
        background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
        borderRadius: '8px',
        padding: '20px 24px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        border: '1px solid rgba(180,120,255,0.3)'
    });
    const isPremium = LicenseManager.getActiveTiers().includes('premium');
    const statusLabel = isPremium
        ? `<span style="color:#b47fff;font-weight:bold"><i class="fas fa-crown"></i> Premium Ativo</span>`
        : `<span style="color:#888"><i class="fas fa-lock"></i> Versão Gratuita</span>`;
    banner.innerHTML = `
    <div style="flex:1">
      <p style="margin:0;color:#fff;font-size:16px;font-weight:bold"><i class="fas fa-book-open" style="color:#b47fff"></i> Journal CSS</p>
      <p style="margin:4px 0 0;color:#aaa;font-size:12px">Templates visuais premium para seus Diários no Foundry VTT</p>
      <p style="margin:8px 0 0;font-size:13px">${statusLabel}</p>
    </div>
    <button type="button" class="journal-css-premium-btn"
      style="background:#b47fff;color:#1a0a2e;border:none;padding:10px 20px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(180,120,255,0.4)">
      <i class="fas fa-key"></i> ${isPremium ? 'Gerenciar Licença' : 'Ativar Premium'}
    </button>
  `;
    banner.querySelector('.journal-css-premium-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const stcApi = window.StorytellerCinema;
        if (stcApi) {
            // @ts-ignore — caminho resolvido em runtime pelo Foundry, não pelo compilador TS
            import("/modules/storyteller-cinema/apps/key-manager.js")
                .then(({ KeyManager }) => new KeyManager().render(true, { focus: true }))
                .catch(() => {
                openLocalKeyManagerDialog();
            });
        }
        else {
            openLocalKeyManagerDialog();
        }
    });
    stcGroup.prepend(banner);
});
function openLocalKeyManagerDialog() {
    const localKeys = LicenseManager.getLocalKeys();
    const keysListHtml = localKeys.length > 0
        ? localKeys.map(k => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.1);padding:6px 10px;border-radius:4px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.05)">
          <code style="font-family:monospace;color:#b47fff">${k}</code>
          <button type="button" class="remove-key-btn" data-key="${k}" style="width:auto;flex:0 0 auto;background:#900;color:#fff;border:none;padding:2px 8px;border-radius:4px;cursor:pointer"><i class="fas fa-trash"></i></button>
        </div>
      `).join('')
        : `<p style="color:#888;font-style:italic;text-align:center;margin:12px 0">Nenhuma chave premium local cadastrada.</p>`;
    const content = `
    <div class="journal-css-key-dialog" style="padding:10px">
      <p style="margin-top:0">Insira sua chave premium do <strong>Journal CSS / Storyteller Cinema</strong> abaixo:</p>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input type="text" class="new-key-input" placeholder="Ex: SC-XXXX-XXXX-XXXX" style="flex:1" />
        <button type="button" class="add-key-btn" style="background:#b47fff;color:#1a0a2e;font-weight:bold;border:none;padding:0 16px;border-radius:4px;cursor:pointer">Ativar</button>
      </div>
      <p style="font-weight:bold;border-bottom:1px solid #555;padding-bottom:4px;margin-bottom:8px">Chaves Ativas neste Navegador:</p>
      <div class="keys-list-container">${keysListHtml}</div>
    </div>
  `;
    const d = new Dialog({
        title: "Journal CSS - Licença Premium Local",
        content: content,
        buttons: {
            close: {
                icon: '<i class="fas fa-times"></i>',
                label: "Fechar"
            }
        },
        default: "close",
        render: (html) => {
            const el = html[0] || html;
            const input = el.querySelector('.new-key-input');
            el.querySelector('.add-key-btn')?.addEventListener('click', async () => {
                const key = input.value.trim();
                if (!key)
                    return;
                const success = await LicenseManager.addLocalKey(key);
                if (success) {
                    ui.notifications?.info("Chave premium ativada localmente!");
                    d.close();
                    // Forçar re-render do settings se estiver aberto
                    if (ui.activeWindow)
                        ui.activeWindow.render();
                }
                else {
                    ui.notifications?.warn("Esta chave já está ativada.");
                }
            });
            el.querySelectorAll('.remove-key-btn').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const target = e.currentTarget;
                    const key = target.dataset.key;
                    if (key) {
                        await LicenseManager.removeLocalKey(key);
                        ui.notifications?.info("Chave premium removida.");
                        d.close();
                        if (ui.activeWindow)
                            ui.activeWindow.render();
                    }
                });
            });
        }
    }, { width: 450 });
    d.render(true);
}
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
    // Find the content container - never fall back to root element to avoid leaking theme classes
    const contentSelectors = ".journal-entry-page, .journal-entry-pages, .editor-container, .journal-page-content, .page-content, .editor-content, .prosemirror, .ProseMirror";
    let targetEl = element.querySelector(contentSelectors);
    if (!targetEl)
        targetEl = element.querySelector(".window-content");
    if (!targetEl)
        return; // no content container found, skip safely
    targetEl.classList.forEach((cls) => { if (cls.startsWith('journal-theme-'))
        targetEl.classList.remove(cls); });
    if (selectedTheme !== "none")
        targetEl.classList.add(`journal-theme-${selectedTheme}`);
    const parentVars = doc.parent?.getFlag(MODULE_ID, "themeVars") || {};
    const themeVars = varsOverride || doc.getFlag(MODULE_ID, "themeVars") || parentVars || {};
    ThemeRegistry.applyThemeVariables(targetEl, selectedTheme, themeVars);
    const contentEl = (targetEl.querySelector(".ProseMirror, .editor-content, .page-content, .journal-page-content") || targetEl);
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
    // Custom CSS - scoped inside the content container, not the root element
    const customCSS = doc.getFlag(MODULE_ID, "customCSS") || doc.parent?.getFlag(MODULE_ID, "customCSS");
    let styleTag = element.querySelector(`#${MODULE_ID}-custom-style`);
    if (customCSS) {
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = `${MODULE_ID}-custom-style`;
            targetEl.appendChild(styleTag);
        }
        styleTag.textContent = customCSS;
    }
    else if (styleTag)
        styleTag.remove();
    // Configura um MutationObserver no content container para quando o Foundry alternar para edição (ProseMirror)
    if (!targetEl._journalThemeObserver) {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    const addedEditor = Array.from(m.addedNodes).find(n => n.classList && (n.classList.contains("editor") || n.classList.contains("ProseMirror") || n.classList.contains("editor-container") || n.querySelector(".ProseMirror, .editor, .editor-container")));
                    if (addedEditor) {
                        const newTarget = (targetEl.querySelector(contentSelectors) || targetEl);
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
        observer.observe(targetEl, { childList: true, subtree: true });
        targetEl._journalThemeObserver = observer;
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
