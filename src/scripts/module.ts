/**
 * Journal CSS Module - Dynamic Theme Engine V3
 * Author: Rob Sammore
 */

/// <reference path="../../node_modules/@league-of-foundry-developers/foundry-vtt-types/src/index.d.mts" />

const MODULE_ID = "journal-css";

interface ThemeVariable {
  key: string;
  label: string;
  type: "color" | "range" | "select" | "text";
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
}

interface ThemeV3 {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  css?: string;
  layoutPath?: string;
  contentTemplate?: string;
  variables?: ThemeVariable[];
  isUserTheme?: boolean;
}

/**
 * Registry to handle theme definitions and loading from JSON
 */
class ThemeRegistry {
  static themes: ThemeV3[] = [];
  
  static async initialize() {
    try {
      // 1. Load Local Themes
      const localResponse = await fetch("/modules/journal-css/themes.json");
      if (!localResponse.ok) throw new Error(`HTTP Error ${localResponse.status}`);
      const localData: ThemeV3[] = await localResponse.json();
      console.log(`${MODULE_ID} | Loaded ${localData.length} local themes`);
      
      // 2. Load User Themes (from settings)
      const userThemes: ThemeV3[] = (game as any).settings.get(MODULE_ID, "userThemes") || [];
      userThemes.forEach(t => t.isUserTheme = true);

      // Merge all (avoiding duplicates from themes.json)
      const uniqueThemes = new Map<string, ThemeV3>();
      
      // Load local first, then overwrite with user themes if same ID
      localData.forEach(t => uniqueThemes.set(t.id, t));
      userThemes.forEach(t => uniqueThemes.set(t.id, t));
      
      this.themes = Array.from(uniqueThemes.values());

      this.injectGlobalStyles();

      // Preload layout templates
      const templatePaths = this.themes.map(t => t.layoutPath).filter(Boolean) as string[];
      if (templatePaths.length > 0) {
        try {
          await (foundry as any).applications.handlebars.loadTemplates(templatePaths);
          console.log(`${MODULE_ID} | Preloaded ${templatePaths.length} layout templates`);
        } catch (err) {
          console.error(`${MODULE_ID} | Failed to preload layout templates`, err);
        }
      }
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
    // Aggregate all embedded CSS from themes
    styleTag.textContent = this.themes
      .filter(t => t.css)
      .map(t => `/* Theme: ${t.id} */\n${t.css}`)
      .join("\n\n");
  }

  static getTheme(id: string): ThemeV3 | undefined {
    return this.themes.find(t => t.id === id);
  }

  static getThemeList() {
    return this.themes;
  }

  /**
   * Returns a base HTML template for specific themes
   */
  static async getThemeLayout(id: string): Promise<string | null> {
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
        return await (foundry as any).applications.handlebars.renderTemplate(theme.layoutPath, {});
      } catch (err) {
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
  static applyThemeVariables(element: HTMLElement, themeId: string, customValues: Record<string, any>) {
    const theme = this.getTheme(themeId);
    if (!theme || !theme.variables) return;

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
class ThemeSelector extends (foundry as any).applications.api.ApplicationV2 {
  public document: any;
  public tabGroups: Record<string, string> = { main: "gallery" };
  private _selectedThemeId: string | null = null;
  private _hasClickDelegation = false;
  private _tabsInitialized = false;
  public _isApplyingLayout = false;

  constructor(options: any = {}) {
    super(options);
    const doc = options.document;
    if (typeof doc === "string") this.document = (fromUuidSync as any)(doc);
    else this.document = doc;

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
    selectTheme: function(this: ThemeSelector, event: Event, target: HTMLElement) {
      event.preventDefault();
      const themeId = target.dataset.theme || "none";
      this._selectedThemeId = themeId;
      
      // Live Preview
      this.refreshJournalWindows();
      
      this.render(true);
    },
    deleteTheme: async function(this: ThemeSelector, event: Event, target: HTMLElement) {
      event.stopPropagation();
      const themeId = target.dataset.theme;
      if (!themeId) return;
      const confirm = await Dialog.confirm({
        title: (game as any).i18n.localize("JOURNAL_CSS.Dialog.DeleteTheme.Title"),
        content: (game as any).i18n.localize("JOURNAL_CSS.Dialog.DeleteTheme.Content"),
      });
      if (!confirm) return;
      const userThemes = (game as any).settings.get(MODULE_ID, "userThemes") || [];
      const filtered = userThemes.filter((t: any) => t.id !== themeId);
      await (game as any).settings.set(MODULE_ID, "userThemes", filtered);
      if (this._selectedThemeId === themeId) this._selectedThemeId = "none";
      this.render(true);
    },
    installTheme: async function(this: ThemeSelector) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event: any) => {
          try {
            const themeData = JSON.parse(event.target.result);
            const userThemes = (game as any).settings.get(MODULE_ID, "userThemes") || [];
            userThemes.push(themeData);
            await (game as any).settings.set(MODULE_ID, "userThemes", userThemes);
            this.render(true);
          } catch (err) { ui.notifications.error("Failed to parse theme file."); }
        };
        reader.readAsText(file);
      };
      input.click();
    },
    createTheme: async function(this: ThemeSelector) {
      if (!(game as any).user.isGM) return;
      // Simple prompt for now, could be a full form later
      const themeId = await (foundry.applications.api as any).DialogV2.prompt({
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
          callback: (event: any, button: any, html: HTMLElement) => {
            return {
              id: (html.querySelector("#new-theme-id") as HTMLInputElement).value,
              name: (html.querySelector("#new-theme-name") as HTMLInputElement).value
            };
          }
        }
      });

      if (themeId && themeId.id) {
        const newTheme: ThemeV3 = {
          id: themeId.id,
          name: themeId.name,
          icon: "fas fa-feather-alt",
          css: `.journal-theme-${themeId.id} { background: #fff; color: #000; }`,
          contentTemplate: `<h2>${themeId.name}</h2><p>Lorem ipsum dolor sit amet...</p>`,
          variables: []
        };
        const userThemes = (game as any).settings.get(MODULE_ID, "userThemes") || [];
        userThemes.push(newTheme);
        await (game as any).settings.set(MODULE_ID, "userThemes", userThemes);
        this.render(true);
      }
    },
    saveSettings: async function(this: ThemeSelector, event: any, form: HTMLFormElement, formData: any) {
      const data = formData.object;
      await this.document.setFlag(MODULE_ID, "theme", data.theme);
      await this.document.setFlag(MODULE_ID, "customCSS", data.customCSS);
      const themeVars: Record<string, any> = {};
      Object.keys(data).forEach(key => { if (key.startsWith("--")) themeVars[key] = data[key]; });
      await this.document.setFlag(MODULE_ID, "themeVars", themeVars);
      const tweaks = { fontSize: data.fontSize, fontFamily: data.fontFamily };
      await this.document.setFlag(MODULE_ID, "tweaks", tweaks);
      
      this._selectedThemeId = null;
      this.refreshJournalWindows();
      ui.notifications.info((game as any).i18n.localize("JOURNAL_CSS.Notifications.SettingsSaved"));
    },
    applyAtomicLayout: async function(this: ThemeSelector, event: Event, target: HTMLElement) {
      if (this._isApplyingLayout) return;
      this._isApplyingLayout = true;

      try {
        const themeId = target.getAttribute("data-theme");
        console.log(`${MODULE_ID} | Action: applyAtomicLayout | themeId:`, themeId);
        
        if (!themeId) {
          console.error(`${MODULE_ID} | Element clicked without data-theme attribute`, target);
          ui.notifications.warn("Nenhum ID de tema encontrado no elemento clicado.");
          return;
        }

        const confirm = await (foundry.applications.api as any).DialogV2.confirm({
          window: { title: "Aplicar Modelo?" },
          content: `<p>Isso criará uma nova página no diário usando o modelo base deste tema. Deseja continuar?</p>`,
          modal: true
        });
        if (!confirm) return;

        // Inject layout to create a new page
        await this._applyLayout(themeId);
      } finally {
        this._isApplyingLayout = false;
      }
    }
  };

  private async _applyLayout(themeId: string) {
    ui.notifications.info(`Iniciando aplicação do modelo: ${themeId}...`);
    
    const layoutHTML = await ThemeRegistry.getThemeLayout(themeId);
    if (!layoutHTML) {
      ui.notifications.error(`Falha: Modelo HTML não encontrado para "${themeId}".`);
      return;
    }

    const theme = ThemeRegistry.getTheme(themeId);
    const pageName = theme ? theme.name : "Nova Página";

    // 1. Identify the parent JournalEntry (The Codex / Foundry V14 Standard)
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
        if ((journal as any).sheet) {
          (journal as any).sheet.render(true, { pageId: newPage.id });
        }
        this.close();
      } else {
        console.warn(`${MODULE_ID} | createEmbeddedDocuments retornou vazio.`);
        ui.notifications.warn("O diário não criou a página (resultado vazio). Verifique permissões.");
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Falha crítica na criação da página:`, err);
      ui.notifications.error(`Erro ao criar página: ${err.message}`);
    }
  }

  /** @override */
  static DEFAULT_OPTIONS: any = {
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
  static PARTS: Record<string, { template: string }> = {
    selector: {
      template: "modules/journal-css/templates/theme-selector.hbs"
    }
  };

  /** @override */
  async _prepareContext(options: any): Promise<any> {
    if (ThemeRegistry.getThemeList().length === 0) await ThemeRegistry.initialize();
    
    const currentThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
    
    const themes = ThemeRegistry.getThemeList().map(t => ({
      ...t,
      name: (game as any).i18n.localize(t.name),
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
      isGM: (game as any).user.isGM
    };
  }

  /** @override */
  async _renderHTML(context: any, options: any): Promise<string> {
    const parts = options.parts ?? Object.keys(ThemeSelector.PARTS);
    const rendered = await Promise.all(parts.map(async (partId: string) => {
      const part = ThemeSelector.PARTS[partId];
      return (foundry as any).applications.handlebars.renderTemplate(part.template, context);
    }));
    return rendered.join("");
  }

  /** @override */
  _replaceHTML(result: string, content: HTMLElement, options: any) {
    content.innerHTML = result;
  }

  /** @override */
  _onRender(context: any, options: any) {
    // 1. Action Delegation (More robust than individual listeners)
    if (!this._hasClickDelegation) {
      this.element.addEventListener("click", ev => {
        const target = (ev.target as HTMLElement).closest("[data-action]");
        if (!target) return;
        
        const action = (target as HTMLElement).dataset.action;
        const handler = (this.constructor as any).ACTIONS[action];
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
    for (const [group, config] of Object.entries((this.constructor as any).TABS)) {
      const tabConfig = config as any;
      new (foundry.applications.ux as any).Tabs({
        ...tabConfig,
        initial: this.tabGroups[group] || tabConfig.initial,
        callback: (event: any, tabs: any, active: string) => {
          this.tabGroups[group] = active;
        }
      }).bind(this.element);
    }
  }

  refreshJournalWindows() {
    Object.values(ui.windows).forEach((app: any) => {
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
  (game as any).settings.register(MODULE_ID, "userThemes", {
    name: "User Themes",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => ThemeRegistry.initialize()
  });

  await ThemeRegistry.initialize();

  // Register Keybinding
  (game as any).keybindings.register(MODULE_ID, "openSelector", {
    name: "Open Theme Selector",
    hint: "Open the visual theme selector for the current journal.",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    onDown: () => {
      const activeApp = Object.values(ui.windows).find((app: any) => 
        app.rendered && app.document?.documentName?.startsWith("JournalEntry")
      );
      if (activeApp) {
        const Cls = getThemeSelectorClass();
        new Cls({ document: (activeApp as any).document }).render(true);
      }
    }
  });
});

function injectThemeButton(appEl: HTMLElement, appObj: any) {
  // ONLY inject if the sheet is editable
  const isEditable = appObj.isEditable || appObj.options?.editable;
  if (!isEditable) return;

  // Enhanced header detection for V14 JournalPageSheet
  let header = appObj?.window?.header || appEl.querySelector("header, .window-header");
  
  // Fallback: search parents if nested
  if (!header && appEl.parentElement) {
    header = appEl.closest(".window-app")?.querySelector(".window-header");
  }
  
  if (!header) {
    requestAnimationFrame(() => {
      const retryEl = appObj.element || appEl;
      if (retryEl) injectThemeButton(retryEl, appObj);
    });
    return;
  }

  if (header.querySelector(".journal-css-selector")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("header-control", "journal-css-selector");
  btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
  
  const isPage = appObj.document?.documentName === "JournalEntryPage";
  btn.title = isPage ? "Modelos de Página" : (game as any).i18n.localize("JOURNAL_CSS.ButtonTitle");
  
  btn.onclick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    
    let doc = appObj?.document;
    if (!doc && appEl.dataset.uuid) doc = (fromUuidSync as any)(appEl.dataset.uuid);

    if (doc) {
      const existingApp = Object.values(ui.windows).find((app: any) => app.id === "journal-theme-selector");
      if (existingApp) {
        (existingApp as any).render(true);
        (existingApp as any).bringToFront();
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

async function applyJournalTheme(sheet: any, themeOverride?: string, varsOverride?: Record<string, any>) {
  // Target the specific container for the page/content, not the whole window
  const element = sheet.element;
  if (!element) return;
  
  const doc = sheet.document;
  if (!doc) return;

  // Inherit theme from parent if this is a page
  const parentTheme = doc.parent?.getFlag(MODULE_ID, "theme");
  const selectedTheme = themeOverride || doc.getFlag(MODULE_ID, "theme") || parentTheme || "none";
  
  // Find the content container (the actual "sheet" or "page")
  const targetEl = element.querySelector(".journal-page-content, .editor-content, .prosemirror") as HTMLElement || element;

  targetEl.classList.forEach((cls: string) => { if (cls.startsWith('journal-theme-')) targetEl.classList.remove(cls); });
  if (selectedTheme !== "none") targetEl.classList.add(`journal-theme-${selectedTheme}`);

  const parentVars = doc.parent?.getFlag(MODULE_ID, "themeVars") || {};
  const themeVars = varsOverride || doc.getFlag(MODULE_ID, "themeVars") || parentVars || {};
  
  ThemeRegistry.applyThemeVariables(targetEl, selectedTheme, themeVars);

  const contentEl = element.querySelector(".ProseMirror, .editor-content, .page-content") as HTMLElement | null;
  if (!contentEl) return;

  // Legacy Tweaks (Compat)
  const tweaks = doc.getFlag(MODULE_ID, "tweaks") || doc.parent?.getFlag(MODULE_ID, "tweaks") || {};
  if (tweaks.fontSize) contentEl.style.fontSize = `${tweaks.fontSize}px`;
  if (tweaks.lineHeight) contentEl.style.lineHeight = tweaks.lineHeight;
  if (tweaks.textAlign) contentEl.style.textAlign = tweaks.textAlign;
  if (tweaks.fontFamily) contentEl.style.fontFamily = tweaks.fontFamily;

  // Custom CSS
  const customCSS = doc.getFlag(MODULE_ID, "customCSS") || doc.parent?.getFlag(MODULE_ID, "customCSS");
  let styleTag = element.querySelector(`#${MODULE_ID}-custom-style`) as HTMLStyleElement;
  if (customCSS) {
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = `${MODULE_ID}-custom-style`;
      element.appendChild(styleTag);
    }
    styleTag.textContent = customCSS;
  } else if (styleTag) styleTag.remove();
}

Hooks.on("renderJournalSheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
});

Hooks.on("renderJournalEntrySheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
});

Hooks.on("renderJournalPageSheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
});

Hooks.on("ready", () => {
  // Re-apply to all open journals
  Object.values(ui.windows).forEach((app: any) => {
    if (app.document?.documentName?.startsWith("JournalEntry")) {
      applyJournalTheme(app);
      if (app.element) injectThemeButton(app.element, app);
    }
  });
});
