var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const MODULE_ID = "journal-css";
class LicenseManager {
  static getActiveTiers() {
    var _a;
    try {
      let localKeys = [];
      let stcKeys = [];
      try {
        localKeys = game.settings.get(MODULE_ID, "premiumKeys") || [];
      } catch {
      }
      try {
        stcKeys = game.settings.get("storyteller-cinema", "premiumKeys") || [];
      } catch {
      }
      const ignoreDev = ((_a = game.settings) == null ? void 0 : _a.get(MODULE_ID, "ignoreDevKeys")) ?? false;
      let allKeys = [...localKeys, ...stcKeys].filter(Boolean);
      if (ignoreDev) {
        allKeys = allKeys.filter((k) => !(k.startsWith("sammore-dev-") && k.endsWith("5633")));
      }
      if (allKeys.length === 0) return ["free"];
      const tiers = ["free", "premium"];
      if (allKeys.some((k) => k.startsWith("sammore-dev-") && k.endsWith("5633"))) {
        tiers.push("dev");
      }
      return tiers;
    } catch {
      return ["free"];
    }
  }
  static hasTier(tier) {
    if (!tier || tier === "free") return true;
    const activeTiers = LicenseManager.getActiveTiers();
    if (activeTiers.includes("dev")) return true;
    return activeTiers.includes(tier);
  }
  static getLocalKeys() {
    try {
      return game.settings.get(MODULE_ID, "premiumKeys") || [];
    } catch {
      return [];
    }
  }
  static async addLocalKey(key) {
    const keys = this.getLocalKeys();
    if (keys.includes(key)) return false;
    keys.push(key);
    await game.settings.set(MODULE_ID, "premiumKeys", keys);
    return true;
  }
  static async removeLocalKey(key) {
    const keys = this.getLocalKeys();
    const filtered = keys.filter((k) => k !== key);
    await game.settings.set(MODULE_ID, "premiumKeys", filtered);
    return true;
  }
}
class ThemeRegistry {
  static async loadHubTemplates() {
    var _a, _b, _c, _d, _e;
    const proxyUrl = "https://storyteller-cinema-proxy.robsammore.workers.dev";
    let serverKeys = [];
    try {
      const isCinemaActive = (_b = (_a = game.modules) == null ? void 0 : _a.get("storyteller-cinema")) == null ? void 0 : _b.active;
      const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
      let fileExists = false;
      if ((_c = game.user) == null ? void 0 : _c.isGM) {
        const FilePickerClass = ((_e = (_d = foundry.applications) == null ? void 0 : _d.apps) == null ? void 0 : _e.FilePicker) || FilePicker;
        try {
          const browse = await FilePickerClass.browse("data", targetFolder);
          fileExists = browse.files.some((f) => f.endsWith("keys.json"));
        } catch (err) {
        }
        if (!fileExists) {
          try {
            await FilePickerClass.createDirectory("data", targetFolder);
          } catch (_) {
          }
          const blob = new Blob(["[]"], { type: "application/json" });
          const file = new File([blob], "keys.json", { type: "application/json" });
          await FilePickerClass.upload("data", targetFolder, file);
          fileExists = true;
        }
      }
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) serverKeys = data;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | Não foi possível ler chaves do servidor:`, err);
    }
    let localKeys = [];
    let stcKeys = [];
    try {
      localKeys = game.settings.get(MODULE_ID, "premiumKeys") || [];
    } catch {
    }
    try {
      stcKeys = game.settings.get("storyteller-cinema", "premiumKeys") || [];
    } catch {
    }
    const keys = Array.from(/* @__PURE__ */ new Set(["classics", ...serverKeys, ...localKeys, ...stcKeys])).filter(Boolean);
    const loadedPacks = /* @__PURE__ */ new Set();
    const hubThemes = [];
    try {
      for (const key of keys) {
        const normalizedKey = key.toLowerCase();
        if (!normalizedKey) continue;
        const isDev = key.startsWith("sammore-dev-") && key.endsWith("5633");
        let allowedPacks = [];
        if (isDev) {
          allowedPacks = ["the-umbra", "cyberpunk-neon", "eldritch-abyss", "steampunk-gears"];
        } else if (normalizedKey === "classics") {
          allowedPacks = ["classics"];
        } else {
          try {
            const listUrl = `${proxyUrl}/packs?key=${encodeURIComponent(key)}`;
            const res = await fetch(listUrl);
            if (res.ok) {
              const data = await res.json();
              allowedPacks = data.packs || [];
            }
          } catch (err) {
            console.error("Journal CSS | Falha ao buscar pacotes autorizados:", err);
          }
        }
        for (const packId of allowedPacks) {
          if (loadedPacks.has(packId)) continue;
          loadedPacks.add(packId);
          try {
            const activeKey = packId === "classics" ? "classics" : key;
            const packUrl = `${proxyUrl}/fetch/packs/${packId}/pack.json?key=${encodeURIComponent(activeKey)}&v=${Date.now()}`;
            const packRes = await fetch(packUrl);
            if (!packRes.ok) continue;
            const packData = await packRes.json();
            const templates = packData.templates || [];
            for (const templateId of templates) {
              try {
                const templateUrl = `${proxyUrl}/fetch/packs/${packId}/templates/${templateId}/template.json?key=${encodeURIComponent(activeKey)}`;
                const templateRes = await fetch(templateUrl);
                if (!templateRes.ok) continue;
                const templateData = await templateRes.json();
                const baseAssetPath = `${proxyUrl}/fetch/packs/${packId}/templates/${templateId}`;
                const theme = {
                  id: templateData.id,
                  name: templateData.name,
                  description: templateData.description,
                  icon: templateData.icon || "fas fa-magic",
                  tier: packData.tier || "free",
                  variables: templateData.variables || []
                };
                if (templateData.cssPath) {
                  const relativeCss = templateData.cssPath.replace(/^.*templates\/[^\/]+\//, "");
                  const cssUrl = `${baseAssetPath}/${relativeCss}?key=${encodeURIComponent(activeKey)}`;
                  const cssRes = await fetch(cssUrl);
                  if (cssRes.ok) theme.css = await cssRes.text();
                }
                if (templateData.layoutPath) {
                  const relativeLayout = templateData.layoutPath.replace(/^.*templates\/[^\/]+\//, "");
                  const layoutUrl = `${baseAssetPath}/${relativeLayout}?key=${encodeURIComponent(activeKey)}`;
                  const layoutRes = await fetch(layoutUrl);
                  if (layoutRes.ok) theme.contentTemplate = await layoutRes.text();
                }
                hubThemes.push(theme);
              } catch (err) {
                console.error(`Journal CSS | Falha ao carregar template ${templateId} no pack ${packId}:`, err);
              }
            }
          } catch (err) {
            console.error(`Journal CSS | Falha ao carregar pack ${packId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("Journal CSS | Erro geral ao sincronizar hub templates:", err);
    }
    return hubThemes;
  }
  static async initialize() {
    try {
      const localResponse = await fetch("/modules/journal-css/themes.json");
      if (!localResponse.ok) throw new Error(`HTTP Error ${localResponse.status}`);
      const localData = await localResponse.json();
      console.log(`${MODULE_ID} | Loaded ${localData.length} local themes`);
      const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
      userThemes.forEach((t) => t.isUserTheme = true);
      let hubData = [];
      try {
        hubData = await this.loadHubTemplates();
        console.log(`${MODULE_ID} | Loaded ${hubData.length} hub templates`);
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to load hub templates:`, err);
      }
      const uniqueThemes = /* @__PURE__ */ new Map();
      localData.forEach((t) => uniqueThemes.set(t.id, t));
      userThemes.forEach((t) => uniqueThemes.set(t.id, t));
      hubData.forEach((t) => uniqueThemes.set(t.id, t));
      this.themes = Array.from(uniqueThemes.values());
      await this.preloadLayouts();
      this.injectGlobalStyles();
    } catch (e) {
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
    const themesCSS = this.themes.filter((t) => t.css).map((t) => `/* Theme: ${t.id} */
${t.css}`).join("\n\n");
    const imports = [];
    const restCSS = themesCSS.replace(/@import\s+url\([^)]+\);?/gi, (match) => {
      imports.push(match);
      return "";
    });
    styleTag.textContent = imports.join("\n") + "\n\n" + buttonCSS + "\n\n" + restCSS;
  }
  static getTheme(id) {
    return this.themes.find((t) => t.id === id);
  }
  static getThemeList() {
    return this.themes;
  }
  static async preloadLayouts() {
    for (const theme of this.themes) {
      if (theme.contentTemplate) {
        this.layoutCache[theme.id] = theme.contentTemplate;
      } else if (theme.layoutPath) {
        try {
          const res = await fetch(theme.layoutPath);
          if (res.ok) {
            theme.contentTemplate = await res.text();
            this.layoutCache[theme.id] = theme.contentTemplate;
          }
        } catch (err) {
          console.error(`${MODULE_ID} | Failed to preload layout for ${theme.id}:`, err);
        }
      }
    }
  }
  static getThemeLayoutSync(id) {
    if (this.layoutCache[id]) return this.layoutCache[id];
    const theme = this.getTheme(id);
    if (!theme) return null;
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
    if (theme.contentTemplate) {
      console.log(`${MODULE_ID} | Using embedded contentTemplate for: ${id}`);
      return theme.contentTemplate;
    }
    if (theme.layoutPath) {
      console.log(`${MODULE_ID} | Falling back to layoutPath for: ${id} (${theme.layoutPath})`);
      try {
        const res = await fetch(theme.layoutPath);
        if (res.ok) {
          theme.contentTemplate = await res.text();
          return theme.contentTemplate;
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to fetch layout template: ${theme.layoutPath}`, err);
      }
    }
    console.warn(`${MODULE_ID} | No template found for theme: ${id}. Using generic fallback.`);
    return `<h2>${theme.name}</h2><p>Modelo padrão injetado. Adicione conteúdo aqui.</p>`;
  }
  /**
   * Applies CSS variables to a specific element based on theme configuration
   */
  static applyThemeVariables(element, themeId, customValues) {
    const theme = this.getTheme(themeId);
    if (!theme || !theme.variables) return;
    theme.variables.forEach((v) => {
      const val = customValues[v.key] ?? v.default;
      const unit = v.type === "range" && v.key.includes("size") ? "px" : "";
      element.style.setProperty(v.key, `${val}${unit}`);
    });
  }
}
__publicField(ThemeRegistry, "themes", []);
__publicField(ThemeRegistry, "layoutCache", {});
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const _ThemeSelector = class _ThemeSelector extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    __publicField(this, "document");
    __publicField(this, "tabGroups", { main: "gallery" });
    __publicField(this, "_selectedThemeId", null);
    __publicField(this, "_hasClickDelegation", false);
    __publicField(this, "_tabsInitialized", false);
    const doc = options.document;
    if (typeof doc === "string") this.document = fromUuidSync(doc);
    else this.document = doc;
    if (!this.document) {
      console.error(`${MODULE_ID} | ThemeSelector initialized without a valid document context.`);
    }
  }
  async _applyLayout(themeId) {
    ui.notifications.info(`Iniciando aplicação do modelo: ${themeId}...`);
    const layoutHTML = await ThemeRegistry.getThemeLayout(themeId);
    if (!layoutHTML) {
      ui.notifications.error(`Falha: Modelo HTML não encontrado para "${themeId}".`);
      return;
    }
    const theme = ThemeRegistry.getTheme(themeId);
    const pageName = theme ? theme.name : "Nova Página";
    if (this.document && this.document.documentName === "JournalEntryPage") {
      console.log(`${MODULE_ID} | Atualizando página existente com modelo:`, this.document.id);
      try {
        const currentName = this.document.name;
        const isDefaultName = currentName === "Nova Página" || currentName === "New Page" || currentName.startsWith("Página") || currentName.startsWith("Page") || currentName === "Texto" || currentName === "Text";
        await this.document.update({
          name: isDefaultName ? pageName : currentName,
          "text.content": layoutHTML,
          "text.format": 1,
          // HTML/ProseMirror
          [`flags.${MODULE_ID}.theme`]: themeId
        });
        ui.notifications.info(`Modelo aplicado com sucesso à página "${this.document.name}".`);
        this.close();
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${MODULE_ID} | Erro ao atualizar a página existente:`, err);
        ui.notifications.error(`Erro ao aplicar modelo: ${message}`);
        return;
      }
    }
    let journal = this.document;
    if (journal && journal.documentName !== "JournalEntry") {
      if (journal.parent && journal.parent.documentName === "JournalEntry") {
        journal = journal.parent;
      } else if (journal.collectionName === "pages" && journal.parent) {
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
      const pageData = {
        name: `${pageName} - ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
        type: "text",
        text: {
          content: layoutHTML,
          format: 1
          // Format 1 = HTML/ProseMirror in Foundry V14
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
      } else {
        console.warn(`${MODULE_ID} | createEmbeddedDocuments retornou vazio.`);
        ui.notifications.warn("O diário não criou a página (resultado vazio). Verifique permissões.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${MODULE_ID} | Falha crítica na criação da página:`, err);
      ui.notifications.error(`Erro ao criar página: ${message}`);
    }
  }
  /** @override */
  async _prepareContext(options) {
    var _a;
    if (ThemeRegistry.getThemeList().length === 0) await ThemeRegistry.initialize();
    const currentThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
    const activeTiers = LicenseManager.getActiveTiers();
    const isPremiumActive = activeTiers.includes("premium");
    const themes = ThemeRegistry.getThemeList().map((t) => {
      const themeTier = t.tier || "free";
      const isLocked = t.isLocked ?? !LicenseManager.hasTier(themeTier);
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
    const variables = ((_a = selectedTheme == null ? void 0 : selectedTheme.variables) == null ? void 0 : _a.map((v) => ({ ...v, value: currentVars[v.key] ?? v.default }))) || [];
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
  _onRender(context, options) {
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
    const html = this.element;
    const accordions = html.querySelectorAll(".accordion-header");
    accordions.forEach((header) => {
      header.addEventListener("click", (e) => {
        e.preventDefault();
        const section = header.parentElement;
        if (!section) return;
        const isCurrentlyActive = section.classList.contains("active");
        const allSections = html.querySelectorAll(".accordion-section");
        Array.from(allSections).forEach((s) => s.classList.remove("active"));
        if (!isCurrentlyActive) {
          section.classList.add("active");
        }
      });
    });
    const themeCards = html.querySelectorAll(".tab[data-tab='gallery'] .theme-card");
    const previewWindow = html.querySelector(".tab[data-tab='gallery'] .journal-preview-window");
    const previewPage = html.querySelector(".tab[data-tab='gallery'] .journal-preview-page");
    const updatePreview = (themeId) => {
      if (previewWindow) {
        previewWindow.className = `journal-preview-window theme-${themeId}`;
      }
      if (previewPage) {
        previewPage.className = `journal-preview-page journal-theme-${themeId}`;
        ThemeRegistry.applyThemeVariables(previewPage, themeId, {});
      }
    };
    const initialThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
    updatePreview(initialThemeId);
    themeCards.forEach((card) => {
      const themeId = card.dataset.theme || "none";
      card.addEventListener("mouseenter", () => updatePreview(themeId));
      card.addEventListener("click", () => {
        this._selectedThemeId = themeId;
        updatePreview(themeId);
      });
    });
    const selectionArea = html.querySelector(".tab[data-tab='gallery'] .theme-selection-area");
    selectionArea == null ? void 0 : selectionArea.addEventListener("mouseleave", () => {
      const activeThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
      updatePreview(activeThemeId);
    });
    const templateCards = html.querySelectorAll(".tab[data-tab='templates'] .template-card");
    const templatePreviewWindow = html.querySelector(".template-preview-window");
    const templatePreviewPage = html.querySelector(".template-preview-page");
    const updateTemplatePreview = (themeId) => {
      if (templatePreviewWindow) {
        templatePreviewWindow.className = `journal-preview-window template-preview-window theme-${themeId}`;
      }
      if (templatePreviewPage) {
        templatePreviewPage.className = `journal-preview-page template-preview-page journal-theme-${themeId}`;
        ThemeRegistry.applyThemeVariables(templatePreviewPage, themeId, {});
        const layoutHTML = ThemeRegistry.getThemeLayoutSync(themeId) || `<p>Nenhum modelo de layout disponível para o tema ${themeId}.</p>`;
        templatePreviewPage.innerHTML = layoutHTML;
      }
    };
    updateTemplatePreview(initialThemeId);
    templateCards.forEach((card) => {
      const themeId = card.dataset.theme || "none";
      card.addEventListener("mouseenter", () => {
        updateTemplatePreview(themeId);
      });
    });
    const templateSelectionArea = html.querySelector(".tab[data-tab='templates'] .theme-selection-area");
    templateSelectionArea == null ? void 0 : templateSelectionArea.addEventListener("mouseleave", () => {
      const activeThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
      updateTemplatePreview(activeThemeId);
    });
  }
  refreshJournalWindows() {
    Object.values(ui.windows).forEach((app) => {
      var _a, _b, _c;
      if (((_a = app.document) == null ? void 0 : _a.uuid) === this.document.uuid || ((_c = (_b = app.document) == null ? void 0 : _b.parent) == null ? void 0 : _c.uuid) === this.document.uuid) {
        applyJournalTheme(app, this._selectedThemeId || void 0);
      }
    });
  }
};
__publicField(_ThemeSelector, "_isApplyingLayout", false);
__publicField(_ThemeSelector, "_isCreatingTheme", false);
/**
 * Configuration for application tabs.
 */
__publicField(_ThemeSelector, "TABS", {
  main: {
    navSelector: "nav.tabs",
    contentSelector: ".selector-content",
    initial: "gallery"
  }
});
/**
 * Interactivity handlers via static ACTIONS.
 */
/**
 * Interactivity handlers via static ACTIONS.
 */
__publicField(_ThemeSelector, "ACTIONS", {
  selectTheme: function(event, target) {
    event.preventDefault();
    const themeId = target.dataset.theme || "none";
    this._selectedThemeId = themeId;
    this.refreshJournalWindows();
    this.render(true);
  },
  deleteTheme: async function(event, target) {
    event.stopPropagation();
    const themeId = target.dataset.theme;
    if (!themeId) return;
    const confirm = await Dialog.confirm({
      title: game.i18n.localize("JOURNAL_CSS.Dialog.DeleteTheme.Title"),
      content: game.i18n.localize("JOURNAL_CSS.Dialog.DeleteTheme.Content")
    });
    if (!confirm) return;
    const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
    const filtered = userThemes.filter((t) => t.id !== themeId);
    await game.settings.set(MODULE_ID, "userThemes", filtered);
    if (this._selectedThemeId === themeId) this._selectedThemeId = "none";
    this.render(true);
  },
  installTheme: async function() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const themeData = JSON.parse(event.target.result);
          const userThemes = game.settings.get(MODULE_ID, "userThemes") || [];
          userThemes.push(themeData);
          await game.settings.set(MODULE_ID, "userThemes", userThemes);
          this.render(true);
        } catch (err) {
          ui.notifications.error("Failed to parse theme file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },
  createTheme: async function(event) {
    if (_ThemeSelector._isCreatingTheme) return;
    _ThemeSelector._isCreatingTheme = true;
    try {
      if (!game.user.isGM) return;
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
          callback: (event2, button, dialog) => {
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
    } finally {
      _ThemeSelector._isCreatingTheme = false;
    }
  },
  saveSettings: async function(event, form, formData) {
    const data = formData.object;
    const themeVars = {};
    Object.keys(data).forEach((key) => {
      if (key.startsWith("--")) themeVars[key] = data[key];
    });
    const tweaks = { fontSize: data.fontSize, fontFamily: data.fontFamily };
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
  applyAtomicLayout: async function(event, target) {
    if (_ThemeSelector._isApplyingLayout) return;
    _ThemeSelector._isApplyingLayout = true;
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
      if (!confirm) return;
      await this._applyLayout(themeId);
    } finally {
      _ThemeSelector._isApplyingLayout = false;
    }
  }
});
/** @override */
__publicField(_ThemeSelector, "DEFAULT_OPTIONS", {
  id: "journal-theme-selector",
  tag: "form",
  window: {
    title: "JOURNAL_CSS.Settings.Theme.Label",
    icon: "fas fa-palette",
    resizable: true,
    controls: []
  },
  position: { width: 750, height: 780 },
  form: {
    handler: _ThemeSelector.ACTIONS.saveSettings,
    submitOnChange: false,
    closeOnSubmit: true
  },
  actions: {
    selectTheme: _ThemeSelector.ACTIONS.selectTheme,
    installTheme: _ThemeSelector.ACTIONS.installTheme,
    deleteTheme: _ThemeSelector.ACTIONS.deleteTheme,
    createTheme: _ThemeSelector.ACTIONS.createTheme,
    applyAtomicLayout: _ThemeSelector.ACTIONS.applyAtomicLayout
  }
});
/**
 * Mandated template modularization via static PARTS.
 */
__publicField(_ThemeSelector, "PARTS", {
  selector: {
    template: "modules/journal-css/templates/theme-selector.hbs"
  }
});
let ThemeSelector = _ThemeSelector;
function getThemeSelectorClass() {
  return ThemeSelector;
}
Hooks.once("init", async () => {
  console.log(`${MODULE_ID} | Initializing Journal CSS V3`);
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Hooks.once("ready", () => {
    if (game.settings.get(MODULE_ID, "loadGoogleFonts")) {
      const fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono&family=Caveat:wght@500&family=Dancing+Script:wght@600&family=Playfair+Display:wght@400;900&family=Libre+Baskerville:wght@400;700&display=swap";
      document.head.appendChild(fontLink);
    }
  });
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
    }
  });
  game.settings.register(MODULE_ID, "premiumKeys", {
    name: "Premium Keys",
    scope: "client",
    config: false,
    type: Array,
    default: [],
    onChange: () => ThemeRegistry.initialize()
  });
  game.keybindings.register(MODULE_ID, "openSelector", {
    name: "Open Theme Selector",
    hint: "Open the visual theme selector for the current journal.",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    onDown: () => {
      const activeApp = Object.values(ui.windows).find(
        (app) => {
          var _a, _b;
          return app.rendered && ((_b = (_a = app.document) == null ? void 0 : _a.documentName) == null ? void 0 : _b.startsWith("JournalEntry"));
        }
      );
      if (activeApp) {
        const Cls = getThemeSelectorClass();
        new Cls({ document: activeApp.document }).render(true);
      }
    }
  });
});
Hooks.once("ready", async () => {
  var _a, _b;
  const isCinemaActive = (_b = (_a = game.modules) == null ? void 0 : _a.get("storyteller-cinema")) == null ? void 0 : _b.active;
  const runInit = async () => {
    await ThemeRegistry.initialize();
    const allThemes = ThemeRegistry.getThemeList();
    const availableTemplates = allThemes.filter((t) => LicenseManager.hasTier(t.tier || "free")).map((t) => ({
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
  };
  if (isCinemaActive) {
    Hooks.once("storyteller-cinema-keys-updated", async () => {
      await runInit();
    });
    setTimeout(async () => {
      if (ThemeRegistry.getThemeList().length === 0) {
        console.warn(`${MODULE_ID} | STC keys event timeout — initializing without premium keys.`);
        await runInit();
      }
    }, 5e3);
  } else {
    await runInit();
  }
});
Hooks.on("renderSettingsConfig", (_app, html) => {
  var _a;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;
  const stcGroup = root.querySelector('.tab[data-tab="journal-css"]') || root.querySelector('[data-category="journal-css"]');
  if (!stcGroup) return;
  if (stcGroup.querySelector(".journal-css-premium-banner")) return;
  const banner = document.createElement("div");
  banner.className = "journal-css-premium-banner";
  Object.assign(banner.style, {
    background: "linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)",
    borderRadius: "8px",
    padding: "20px 24px",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    border: "1px solid rgba(180,120,255,0.3)"
  });
  const isPremium = LicenseManager.getActiveTiers().includes("premium");
  const statusLabel = isPremium ? `<span style="color:#b47fff;font-weight:bold"><i class="fas fa-crown"></i> Premium Ativo</span>` : `<span style="color:#888"><i class="fas fa-lock"></i> Versão Gratuita</span>`;
  banner.innerHTML = `
    <div style="flex:1">
      <p style="margin:0;color:#fff;font-size:16px;font-weight:bold"><i class="fas fa-book-open" style="color:#b47fff"></i> Journal CSS</p>
      <p style="margin:4px 0 0;color:#aaa;font-size:12px">Templates visuais premium para seus Diários no Foundry VTT</p>
      <p style="margin:8px 0 0;font-size:13px">${statusLabel}</p>
    </div>
    <button type="button" class="journal-css-premium-btn"
      style="background:#b47fff;color:#1a0a2e;border:none;padding:10px 20px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(180,120,255,0.4)">
      <i class="fas fa-key"></i> ${isPremium ? "Gerenciar Licença" : "Ativar Premium"}
    </button>
  `;
  (_a = banner.querySelector(".journal-css-premium-btn")) == null ? void 0 : _a.addEventListener("click", (e) => {
    e.preventDefault();
    const stcApi = window.StorytellerCinema;
    if (stcApi) {
      import("/modules/storyteller-cinema/apps/key-manager.js").then(({ KeyManager: KeyManager2 }) => new KeyManager2().render(true, { focus: true })).catch(() => {
        openLocalKeyManagerDialog();
      });
    } else {
      openLocalKeyManagerDialog();
    }
  });
  stcGroup.prepend(banner);
});
async function savePremiumKeysToServer(keys) {
  var _a, _b, _c, _d, _e;
  if (!((_a = game.user) == null ? void 0 : _a.isGM)) return false;
  try {
    const isCinemaActive = (_c = (_b = game.modules) == null ? void 0 : _b.get("storyteller-cinema")) == null ? void 0 : _c.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
    const FilePickerClass = ((_e = (_d = foundry.applications) == null ? void 0 : _d.apps) == null ? void 0 : _e.FilePicker) || FilePicker;
    const source = "data";
    try {
      await FilePickerClass.browse(source, targetFolder);
    } catch {
      try {
        await FilePickerClass.createDirectory(source, targetFolder);
      } catch (err) {
        console.error("Journal CSS | Falha ao criar pasta de armazenamento das chaves:", err);
      }
    }
    const data = JSON.stringify(keys, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const file = new File([blob], "keys.json", { type: "application/json" });
    await FilePickerClass.upload(source, targetFolder, file);
    console.log(`Journal CSS | Chaves salvas com sucesso no servidor em ${targetFolder}/keys.json`);
    return true;
  } catch (err) {
    console.error("Journal CSS | Falha ao salvar chaves no servidor:", err);
    return false;
  }
}
class KeyManager extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    super(options);
    __publicField(this, "_hookId", null);
  }
  static get DEFAULT_OPTIONS() {
    return {
      tagName: "form",
      id: "journal-css-key-manager",
      window: {
        title: "Journal CSS - Premium Hub",
        icon: "fas fa-key",
        resizable: true,
        width: 650,
        height: 520
      },
      position: {
        width: 650,
        height: 520
      },
      form: {
        handler: KeyManager._onSubmit,
        submitOnChange: false,
        closeOnSubmit: false
      },
      actions: {
        addKey: KeyManager._onAddKey,
        removeKey: KeyManager._onRemoveKey,
        connectPatreon: KeyManager._onConnectPatreon,
        toggleIgnoreDev: KeyManager._onToggleIgnoreDev
      }
    };
  }
  static get PARTS() {
    return {
      form: {
        template: "modules/journal-css/templates/key-manager.hbs"
      }
    };
  }
  async _prepareContext(_options) {
    var _a, _b, _c, _d, _e, _f;
    const isCinemaActive = (_b = (_a = game.modules) == null ? void 0 : _a.get("storyteller-cinema")) == null ? void 0 : _b.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
    let keysArray = [];
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) keysArray = data;
      }
    } catch (_) {
    }
    const activeKeysList = [];
    const unlockedPacks = /* @__PURE__ */ new Set(["classics"]);
    const ignoreDevKeys = game.settings.get(MODULE_ID, "ignoreDevKeys") ?? false;
    const hasDevKey = keysArray.some((key) => key.startsWith("sammore-dev-") && key.endsWith("5633"));
    for (const key of keysArray) {
      const isDev = !ignoreDevKeys && key.startsWith("sammore-dev-") && key.endsWith("5633");
      let tier = "Avulsa/Promocional";
      let typeClass = "promo";
      if (isDev) {
        tier = "Desenvolvedor";
        typeClass = "dev";
        unlockedPacks.add("the-umbra");
        unlockedPacks.add("cyberpunk-neon");
        unlockedPacks.add("eldritch-abyss");
        unlockedPacks.add("steampunk-gears");
      } else if (key.toLowerCase() === "classics") {
        tier = "Gratuito";
        typeClass = "free";
      } else {
        try {
          const res = await fetch(`https://storyteller-cinema-proxy.robsammore.workers.dev/packs?key=${encodeURIComponent(key)}`);
          if (res.ok) {
            const data = await res.json();
            (data.packs || []).forEach((p) => unlockedPacks.add(p));
            if ((_c = data.packs) == null ? void 0 : _c.includes("cyberpunk-neon")) {
              tier = "Patreon Silver";
              typeClass = "patreon";
            } else if (((_d = data.packs) == null ? void 0 : _d.includes("the-umbra")) && ((_e = data.packs) == null ? void 0 : _e.length) > 2) {
              tier = "Patreon Gold";
              typeClass = "patreon";
            } else if ((_f = data.packs) == null ? void 0 : _f.includes("the-umbra")) {
              tier = "Patreon Bronze";
              typeClass = "patreon";
            }
          }
        } catch (_) {
          tier = "Patreon/Avulsa";
          typeClass = "patreon";
        }
      }
      activeKeysList.push({
        key,
        tier,
        typeClass
      });
    }
    const packsShowcase = [
      {
        id: "the-umbra",
        title: "Bronze Suporter (The Umbra Pack)",
        description: "Estética sombria e misteriosa perfeita para crônicas góticas e mistérios arcanos.",
        banner: "modules/storyteller-cinema/assets/premium-banner/premium-banner.png",
        link: "https://www.patreon.com/c/storyteller_cinema",
        unlocked: unlockedPacks.has("the-umbra")
      },
      {
        id: "cyberpunk-neon",
        title: "Silver Suporter (Cyberpunk Neon Pack)",
        description: "Visuais futuristas vibrantes, luzes de neon e telas de dados de alta tecnologia.",
        banner: "modules/storyteller-cinema/assets/premium-banner/premium-banner.png",
        link: "https://www.patreon.com/c/storyteller_cinema",
        unlocked: unlockedPacks.has("cyberpunk-neon")
      },
      {
        id: "gold-pack",
        title: "Gold Suporter (Arsenal Cinemático Completo)",
        description: "Desbloqueia absolutamente todas as skins do acervo, incluindo Steampunk Gears e Eldritch Abyss.",
        banner: "modules/storyteller-cinema/assets/premium-banner/premium-banner.png",
        link: "https://www.patreon.com/c/storyteller_cinema",
        unlocked: unlockedPacks.has("eldritch-abyss") || unlockedPacks.has("steampunk-gears")
      }
    ];
    return {
      activeKeys: activeKeysList,
      packs: packsShowcase,
      ignoreDevKeys,
      hasDevKey
    };
  }
  _onRender(_context, _options) {
    super._onRender(_context, _options);
    if (!this._hookId) {
      this._hookId = Hooks.on("storyteller-cinema-skins-updated", () => {
        if (this.rendered) this.render();
      });
    }
  }
  static async _onSubmit(_event, _form, _formData) {
  }
  static async _onAddKey(event, _target) {
    var _a, _b, _c, _d, _e, _f;
    event.preventDefault();
    const container = this.element;
    const input = container.querySelector(".new-key-field");
    const newKey = (_a = input == null ? void 0 : input.value) == null ? void 0 : _a.trim();
    if (!newKey) {
      (_b = ui.notifications) == null ? void 0 : _b.warn("Journal CSS | Digite uma chave premium para adicionar.");
      return;
    }
    const isCinemaActive = (_d = (_c = game.modules) == null ? void 0 : _c.get("storyteller-cinema")) == null ? void 0 : _d.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
    let keysList = [];
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) keysList = data;
      }
    } catch (_) {
    }
    if (keysList.includes(newKey)) {
      (_e = ui.notifications) == null ? void 0 : _e.info("Journal CSS | Esta chave já está cadastrada.");
      return;
    }
    keysList.push(newKey);
    await savePremiumKeysToServer(keysList);
    if (game.settings.get("storyteller-cinema", "premiumKeys")) {
      await game.settings.set("storyteller-cinema", "premiumKeys", keysList);
    }
    await game.settings.set(MODULE_ID, "premiumKeys", keysList);
    (_f = ui.notifications) == null ? void 0 : _f.info("Journal CSS | Chave adicionada com sucesso!");
    input.value = "";
    this.render();
  }
  static async _onRemoveKey(event, _target) {
    var _a, _b, _c, _d, _e, _f;
    event.preventDefault();
    const keyToRemove = ((_b = (_a = event.currentTarget) == null ? void 0 : _a.dataset) == null ? void 0 : _b.key) || ((_c = _target == null ? void 0 : _target.dataset) == null ? void 0 : _c.key);
    if (!keyToRemove) return;
    const isCinemaActive = (_e = (_d = game.modules) == null ? void 0 : _d.get("storyteller-cinema")) == null ? void 0 : _e.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
    let keysList = [];
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) keysList = data;
      }
    } catch (_) {
    }
    const filteredKeys = keysList.filter((k) => k !== keyToRemove);
    await savePremiumKeysToServer(filteredKeys);
    if (game.settings.get("storyteller-cinema", "premiumKeys")) {
      await game.settings.set("storyteller-cinema", "premiumKeys", filteredKeys);
    }
    await game.settings.set(MODULE_ID, "premiumKeys", filteredKeys);
    (_f = ui.notifications) == null ? void 0 : _f.info("Journal CSS | Chave removida.");
    this.render();
  }
  static _onConnectPatreon(event, _target) {
    event.preventDefault();
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "https://storyteller-cinema-proxy.robsammore.workers.dev/oauth/login",
      "PatreonLogin",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );
    if (popup) {
      const messageListener = async (e) => {
        var _a, _b, _c, _d, _e;
        if (e.origin !== "https://storyteller-cinema-proxy.robsammore.workers.dev") return;
        if (((_a = e.data) == null ? void 0 : _a.type) === "PATREON_KEY_ACTIVATED" && ((_b = e.data) == null ? void 0 : _b.key)) {
          const newKey = e.data.key;
          const isCinemaActive = (_d = (_c = game.modules) == null ? void 0 : _c.get("storyteller-cinema")) == null ? void 0 : _d.active;
          const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
          let keysList = [];
          try {
            const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) keysList = data;
            }
          } catch (_) {
          }
          if (!keysList.includes(newKey)) {
            keysList.push(newKey);
            await savePremiumKeysToServer(keysList);
            if (game.settings.get("storyteller-cinema", "premiumKeys")) {
              await game.settings.set("storyteller-cinema", "premiumKeys", keysList);
            }
            await game.settings.set(MODULE_ID, "premiumKeys", keysList);
            (_e = ui.notifications) == null ? void 0 : _e.info("Journal CSS | Patreon conectado e chave premium ativada!");
            this.render();
          }
          window.removeEventListener("message", messageListener);
        }
      };
      window.addEventListener("message", messageListener);
    }
  }
  static async _onToggleIgnoreDev(event, _target) {
    var _a;
    event.preventDefault();
    const currentVal = game.settings.get(MODULE_ID, "ignoreDevKeys") || false;
    await game.settings.set(MODULE_ID, "ignoreDevKeys", !currentVal);
    (_a = ui.notifications) == null ? void 0 : _a.info(`Journal CSS | Modo de teste ${!currentVal ? "ativado" : "desativado"}.`);
    this.render();
  }
}
function openLocalKeyManagerDialog() {
  new KeyManager().render(true, { focus: true });
}
function injectThemeButton(appEl, appObj) {
  var _a, _b, _c, _d;
  const isEditable = appObj.isEditable || ((_a = appObj.options) == null ? void 0 : _a.editable);
  if (!isEditable) return;
  let header = ((_b = appObj == null ? void 0 : appObj.window) == null ? void 0 : _b.header) || appEl.querySelector("header, .window-header");
  if (!header && appEl.parentElement) {
    header = (_c = appEl.closest(".window-app")) == null ? void 0 : _c.querySelector(".window-header");
  }
  if (!header) {
    requestAnimationFrame(() => {
      const retryEl = appObj.element || appEl;
      if (retryEl) injectThemeButton(retryEl, appObj);
    });
    return;
  }
  if (header.querySelector(".journal-css-selector")) return;
  const isPage = ((_d = appObj.document) == null ? void 0 : _d.documentName) === "JournalEntryPage";
  if (!isPage) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("header-control", "journal-css-selector");
  btn.innerHTML = '<i class="fas fa-swatchbook"></i>';
  btn.title = "Modelos de Página";
  btn.onclick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    let doc = appObj == null ? void 0 : appObj.document;
    if (!doc && appEl.dataset.uuid) doc = fromUuidSync(appEl.dataset.uuid);
    if (doc) {
      const existingApp = Object.values(ui.windows).find((app) => app.id === "journal-theme-selector");
      if (existingApp) {
        existingApp.render(true);
        existingApp.bringToFront();
      } else {
        const Cls = getThemeSelectorClass();
        new Cls({ document: doc }).render(true);
      }
    }
  };
  const closeBtn = header.querySelector(".header-control.close, [data-action='close'], .close");
  if (closeBtn) closeBtn.before(btn);
  else header.appendChild(btn);
}
function injectTemplateSelectIntoCreateDialog(app, html) {
  var _a, _b;
  const element = html[0] || html;
  const title = ((_a = app.data) == null ? void 0 : _a.title) || app.title || ((_b = app.options) == null ? void 0 : _b.title) || "";
  if (!title.toLowerCase().includes("página") && !title.toLowerCase().includes("page")) return;
  if (element.querySelector(`.${MODULE_ID}-template-select`)) return;
  const typeSelect = element.querySelector("select[name='type']");
  if (!typeSelect) return;
  const typeFormGroup = typeSelect.closest(".form-group") || typeSelect.closest(".form-field");
  if (!typeFormGroup) return;
  const formGroup = document.createElement("div");
  formGroup.classList.add("form-group");
  formGroup.innerHTML = `
    <label><i class="fas fa-swatchbook"></i> Modelo</label>
    <div class="form-fields">
      <select name="journal-css-template" class="${MODULE_ID}-template-select">
        <option value="none">Padrão do Foundry (Em Branco)</option>
        ${ThemeRegistry.getThemeList().map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}
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
  updatePending();
  typeFormGroup.after(formGroup);
}
Hooks.on("renderDialog", injectTemplateSelectIntoCreateDialog);
Hooks.on("renderJournalEntryPageConfig", injectTemplateSelectIntoCreateDialog);
Hooks.on("preCreateJournalEntryPage", (doc, data, options, userId) => {
  const pending = game._pendingJournalCSSTemplate;
  if (!pending) return;
  if (Date.now() - pending.time > 3e4) return;
  if (pending.template !== "none") {
    const themeId = pending.template;
    console.log(`${MODULE_ID} | Interceptando preCreateJournalEntryPage para aplicar modelo:`, themeId);
    const layoutHTML = ThemeRegistry.getThemeLayoutSync(themeId);
    if (layoutHTML) {
      doc.updateSource({
        "text.content": layoutHTML,
        "text.format": 1,
        // HTML/ProseMirror
        [`flags.${MODULE_ID}.theme`]: themeId
      });
    }
    delete game._pendingJournalCSSTemplate;
  }
});
async function applyJournalTheme(sheet, themeOverride, varsOverride) {
  var _a, _b, _c, _d;
  const element = sheet.element;
  if (!element) return;
  const doc = sheet.document;
  if (!doc) return;
  const parentTheme = (_a = doc.parent) == null ? void 0 : _a.getFlag(MODULE_ID, "theme");
  const selectedTheme = themeOverride || doc.getFlag(MODULE_ID, "theme") || parentTheme || "none";
  const contentSelectors = ".journal-entry-page, .journal-entry-pages, .editor-container, .journal-page-content, .page-content, .editor-content, .prosemirror, .ProseMirror";
  let targetEl = element.querySelector(contentSelectors);
  if (!targetEl) targetEl = element.querySelector(".window-content");
  if (!targetEl) return;
  targetEl.classList.forEach((cls) => {
    if (cls.startsWith("journal-theme-")) targetEl.classList.remove(cls);
  });
  if (selectedTheme !== "none") targetEl.classList.add(`journal-theme-${selectedTheme}`);
  const parentVars = ((_b = doc.parent) == null ? void 0 : _b.getFlag(MODULE_ID, "themeVars")) || {};
  const themeVars = doc.getFlag(MODULE_ID, "themeVars") || parentVars || {};
  ThemeRegistry.applyThemeVariables(targetEl, selectedTheme, themeVars);
  const contentEl = targetEl.querySelector(".ProseMirror, .editor-content, .page-content, .journal-page-content") || targetEl;
  const tweaks = doc.getFlag(MODULE_ID, "tweaks") || ((_c = doc.parent) == null ? void 0 : _c.getFlag(MODULE_ID, "tweaks")) || {};
  if (tweaks.fontSize) contentEl.style.fontSize = `${tweaks.fontSize}px`;
  if (tweaks.lineHeight) contentEl.style.lineHeight = tweaks.lineHeight;
  if (tweaks.textAlign) contentEl.style.textAlign = tweaks.textAlign;
  if (tweaks.fontFamily) contentEl.style.fontFamily = tweaks.fontFamily;
  const customCSS = doc.getFlag(MODULE_ID, "customCSS") || ((_d = doc.parent) == null ? void 0 : _d.getFlag(MODULE_ID, "customCSS"));
  let styleTag = element.querySelector(`#${MODULE_ID}-custom-style`);
  if (customCSS) {
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = `${MODULE_ID}-custom-style`;
      targetEl.appendChild(styleTag);
    }
    styleTag.textContent = customCSS;
  } else if (styleTag) styleTag.remove();
  if (!targetEl._journalThemeObserver) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          const addedEditor = Array.from(m.addedNodes).find((n) => n.classList && (n.classList.contains("editor") || n.classList.contains("ProseMirror") || n.classList.contains("editor-container") || n.querySelector(".ProseMirror, .editor, .editor-container")));
          if (addedEditor) {
            const newTarget = targetEl.querySelector(contentSelectors) || targetEl;
            newTarget.classList.forEach((cls) => {
              if (cls.startsWith("journal-theme-")) newTarget.classList.remove(cls);
            });
            if (selectedTheme !== "none") newTarget.classList.add(`journal-theme-${selectedTheme}`);
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
  var _a, _b;
  const isEditable = appObj.isEditable || ((_a = appObj.options) == null ? void 0 : _a.editable);
  if (!isEditable) return;
  const isJournal = ((_b = appObj.document) == null ? void 0 : _b.documentName) === "JournalEntry";
  if (!isJournal) return;
  const sidebar = appEl.querySelector(".directory-sidebar, .journal-sidebar, .sidebar, .window-content .directory");
  if (!sidebar) return;
  if (appEl.querySelector(".journal-css-create-template-btn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("journal-css-create-template-btn");
  btn.innerHTML = '<i class="fas fa-swatchbook"></i> Criar por Modelo';
  btn.title = "Criar nova página a partir de um modelo pré-formatado";
  btn.onclick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    let doc = appObj == null ? void 0 : appObj.document;
    if (!doc && appEl.dataset.uuid) doc = fromUuidSync(appEl.dataset.uuid);
    if (doc) {
      const existingApp = Object.values(ui.windows).find((app) => app.id === "journal-theme-selector");
      if (existingApp) {
        existingApp.render(true);
        existingApp.bringToFront();
      } else {
        const Cls = getThemeSelectorClass();
        new Cls({ document: doc }).render(true);
      }
    }
  };
  const createPageBtn = sidebar.querySelector(".create-page, .new-page, [data-action='createPage']");
  const footer = sidebar.querySelector(".directory-footer, .sidebar-footer");
  const header = sidebar.querySelector(".directory-header, .sidebar-header");
  if (createPageBtn) {
    createPageBtn.after(btn);
  } else if (footer) {
    footer.appendChild(btn);
  } else if (header) {
    header.appendChild(btn);
  } else {
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
      var _a, _b;
      if ((_b = (_a = app.document) == null ? void 0 : _a.documentName) == null ? void 0 : _b.startsWith("JournalEntry")) {
        applyJournalTheme(app);
      }
    });
  }, 50);
});
Hooks.on("updateJournalEntryPage", (doc, change, options, userId) => {
  var _a;
  if ((_a = change.flags) == null ? void 0 : _a[MODULE_ID]) {
    setTimeout(() => {
      Object.values(ui.windows).forEach((app) => {
        var _a2, _b, _c, _d, _e;
        if (app.document === doc || ((_c = (_b = (_a2 = app.document) == null ? void 0 : _a2.pages) == null ? void 0 : _b.get) == null ? void 0 : _c.call(_b, doc.id)) || ((_d = app.document) == null ? void 0 : _d.id) === ((_e = doc.parent) == null ? void 0 : _e.id)) {
          applyJournalTheme(app);
        }
      });
    }, 50);
  }
});
Hooks.on("updateJournalEntry", (doc, change, options, userId) => {
  var _a;
  if ((_a = change.flags) == null ? void 0 : _a[MODULE_ID]) {
    setTimeout(() => {
      Object.values(ui.windows).forEach((app) => {
        var _a2, _b;
        if (app.document === doc || ((_b = (_a2 = app.document) == null ? void 0 : _a2.parent) == null ? void 0 : _b.id) === doc.id) {
          applyJournalTheme(app);
        }
      });
    }, 50);
  }
});
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "premiumKeys", {
    scope: "client",
    config: false,
    type: Array,
    default: []
  });
  game.settings.register(MODULE_ID, "ignoreDevKeys", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });
});
Hooks.on("ready", async () => {
  var _a, _b, _c, _d, _e;
  const isCinemaActive = (_b = (_a = game.modules) == null ? void 0 : _a.get("storyteller-cinema")) == null ? void 0 : _b.active;
  const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
  let serverKeys = [];
  const clientKeys = game.settings.get(MODULE_ID, "premiumKeys") || [];
  const stcKeys = game.settings.get("storyteller-cinema", "premiumKeys") || [];
  serverKeys = Array.from(/* @__PURE__ */ new Set([...clientKeys, ...stcKeys]));
  if ((_c = game.user) == null ? void 0 : _c.isGM) {
    try {
      const FilePickerClass = ((_e = (_d = foundry.applications) == null ? void 0 : _d.apps) == null ? void 0 : _e.FilePicker) || FilePicker;
      let fileExists = false;
      try {
        const browse = await FilePickerClass.browse("data", targetFolder);
        fileExists = browse.files.some((f) => f.endsWith("keys.json"));
      } catch (_) {
      }
      if (serverKeys.length > 0) {
        if (!fileExists) {
          try {
            await FilePickerClass.createDirectory("data", targetFolder);
          } catch (_) {
          }
        }
        const blob = new Blob([JSON.stringify(serverKeys, null, 2)], { type: "application/json" });
        const file = new File([blob], "keys.json", { type: "application/json" });
        await FilePickerClass.upload("data", targetFolder, file);
      } else if (!fileExists && serverKeys.length === 0) {
        try {
          await FilePickerClass.createDirectory("data", targetFolder);
        } catch (_) {
        }
        const blob = new Blob([JSON.stringify([], null, 2)], { type: "application/json" });
        const file = new File([blob], "keys.json", { type: "application/json" });
        await FilePickerClass.upload("data", targetFolder, file);
      }
    } catch (err) {
      console.warn("Journal CSS | Erro ao inicializar/migrar arquivo de chaves no ready:", err);
    }
  } else {
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const parsed = await res.json();
        if (Array.isArray(parsed)) serverKeys = parsed;
      }
    } catch (_) {
    }
  }
  if (serverKeys.length > 0) {
    await game.settings.set(MODULE_ID, "premiumKeys", serverKeys);
    console.log("Journal CSS | Chaves premium sincronizadas com sucesso.");
  }
  await ThemeRegistry.initialize();
  await ThemeRegistry.preloadLayouts();
  Object.values(ui.windows).forEach((app) => {
    var _a2, _b2;
    if ((_b2 = (_a2 = app.document) == null ? void 0 : _a2.documentName) == null ? void 0 : _b2.startsWith("JournalEntry")) {
      applyJournalTheme(app);
      if (app.element) {
        injectThemeButton(app.element, app);
        injectCreateByTemplateButton(app.element, app);
      }
    }
  });
});
Hooks.on("storyteller-cinema-keys-updated", async (keys) => {
  if (Array.isArray(keys) && keys.length > 0) {
    await game.settings.set(MODULE_ID, "premiumKeys", keys);
    await ThemeRegistry.initialize();
    await ThemeRegistry.preloadLayouts();
    Object.values(ui.windows).forEach((app) => {
      var _a, _b;
      if ((_b = (_a = app.document) == null ? void 0 : _a.documentName) == null ? void 0 : _b.startsWith("JournalEntry")) {
        applyJournalTheme(app);
      }
    });
  }
});
export {
  KeyManager,
  savePremiumKeysToServer
};
//# sourceMappingURL=module.js.map
