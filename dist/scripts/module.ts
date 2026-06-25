// @ts-nocheck
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
  tier?: string; // "free" | "premium" | tier id do Patreon
}

/**
 * Lê a licença do Storyteller Cinema do localStorage do Foundry e retorna os tiers ativos.
 * Funciona sem dependência direta do módulo core.
 */
class LicenseManager {
  static getActiveTiers(): string[] {
    try {
      let localKeys: string[] = [];
      let stcKeys: string[] = [];
      try { localKeys = (game as any).settings.get(MODULE_ID, "premiumKeys") || []; } catch {}
      try { stcKeys = (game as any).settings.get("storyteller-cinema", "premiumKeys") || []; } catch {}
      
      const ignoreDev = (game as any).settings?.get(MODULE_ID, "ignoreDevKeys") ?? false;
      let allKeys = [...localKeys, ...stcKeys].filter(Boolean);

      // Se ignoreDevKeys estiver ativo, filtra a chave de desenvolvimento
      if (ignoreDev) {
        allKeys = allKeys.filter(k => !(k.startsWith('sammore-dev-') && k.endsWith('5633')));
      }
      
      if (allKeys.length === 0) return ["free"];
      
      const tiers = ["free", "premium"];

      // Se ainda tiver chave dev (ignoreDev desligado), libera todos os tiers
      if (allKeys.some(k => k.startsWith('sammore-dev-') && k.endsWith('5633'))) {
        tiers.push('dev');
      }
      
      return tiers;
    } catch {
      return ["free"];
    }
  }

  static hasTier(tier: string): boolean {
    if (!tier || tier === "free") return true;
    const activeTiers = LicenseManager.getActiveTiers();
    if (activeTiers.includes('dev')) return true;
    return activeTiers.includes(tier);
  }

  static getLocalKeys(): string[] {
    try {
      return (game as any).settings.get(MODULE_ID, "premiumKeys") || [];
    } catch {
      return [];
    }
  }

  static async addLocalKey(key: string): Promise<boolean> {
    const keys = this.getLocalKeys();
    if (keys.includes(key)) return false;
    keys.push(key);
    await (game as any).settings.set(MODULE_ID, "premiumKeys", keys);
    return true;
  }

  static async removeLocalKey(key: string): Promise<boolean> {
    const keys = this.getLocalKeys();
    const filtered = keys.filter(k => k !== key);
    await (game as any).settings.set(MODULE_ID, "premiumKeys", filtered);
    return true;
  }
}

/**
 * Registry to handle theme definitions and loading from JSON
 */
class ThemeRegistry {
  static themes: ThemeV3[] = [];
  
  static async loadHubTemplates(): Promise<ThemeV3[]> {
    const proxyUrl = "https://storyteller-cinema-proxy.robsammore.workers.dev";
    
    // Get all premium keys from server shared file
    let serverKeys: string[] = [];
    try {
      const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
      const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";
      
      let fileExists = false;
      if ((game as any).user?.isGM) {
        // @ts-ignore
        const FilePickerClass = foundry.applications?.apps?.FilePicker || FilePicker;
        try {
          const browse = await FilePickerClass.browse('data', targetFolder);
          fileExists = browse.files.some((f: string) => f.endsWith("keys.json"));
        } catch (err) {
          // Pasta não existe
        }

        if (!fileExists) {
          // Garante a existência do arquivo criando-o vazio para evitar 404 nos clientes
          try {
            await FilePickerClass.createDirectory('data', targetFolder);
          } catch (_) {}
          const blob = new Blob(["[]"], { type: 'application/json' });
          const file = new File([blob], "keys.json", { type: 'application/json' });
          await FilePickerClass.upload('data', targetFolder, file);
          fileExists = true;
        }
      }

      // Faz o fetch normal do arquivo correspondente
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) serverKeys = data;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | Não foi possível ler chaves do servidor:`, err);
    }

    // Fallback para chaves locais do settings (usando API oficial, que funciona em V14)
    let localKeys: string[] = [];
    let stcKeys: string[] = [];
    try { localKeys = (game as any).settings.get(MODULE_ID, "premiumKeys") || []; } catch {}
    try { stcKeys = (game as any).settings.get("storyteller-cinema", "premiumKeys") || []; } catch {}
    
    const keys = Array.from(new Set<string>(["classics", ...serverKeys, ...localKeys, ...stcKeys])).filter(Boolean);
    const loadedPacks = new Set<string>();
    const hubThemes: ThemeV3[] = [];

    try {
      for (const key of keys) {
        const normalizedKey = key.toLowerCase();
        if (!normalizedKey) continue;

        const isDev = key.startsWith('sammore-dev-') && key.endsWith('5633');
        let allowedPacks: string[] = [];

        if (isDev) {
          allowedPacks = ['the-umbra', 'cyberpunk-neon', 'eldritch-abyss', 'steampunk-gears'];
        } else if (normalizedKey === 'classics') {
          allowedPacks = ['classics'];
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

        // Carrega cada pacote autorizado
        for (const packId of allowedPacks) {
          if (loadedPacks.has(packId)) continue;
          loadedPacks.add(packId);

          try {
            const activeKey = packId === 'classics' ? 'classics' : key;
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

                const theme: ThemeV3 = {
                  id: templateData.id,
                  name: templateData.name,
                  description: templateData.description,
                  icon: templateData.icon || "fas fa-magic",
                  tier: packData.tier || "free",
                  variables: templateData.variables || []
                };

                if (templateData.cssPath) {
                  const relativeCss = templateData.cssPath.replace(/^.*templates\/[^\/]+\//, '');
                  const cssUrl = `${baseAssetPath}/${relativeCss}?key=${encodeURIComponent(activeKey)}`;
                  const cssRes = await fetch(cssUrl);
                  if (cssRes.ok) theme.css = await cssRes.text();
                }

                if (templateData.layoutPath) {
                  const relativeLayout = templateData.layoutPath.replace(/^.*templates\/[^\/]+\//, '');
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
      // 1. Load Local Themes
      const localResponse = await fetch("/modules/journal-css/themes.json");
      if (!localResponse.ok) throw new Error(`HTTP Error ${localResponse.status}`);
      const localData: ThemeV3[] = await localResponse.json();
      console.log(`${MODULE_ID} | Loaded ${localData.length} local themes`);
      
      // 2. Load User Themes (from settings)
      const userThemes: ThemeV3[] = (game as any).settings.get(MODULE_ID, "userThemes") || [];
      userThemes.forEach(t => t.isUserTheme = true);

      // 3. Load Hub Premium Templates
      let hubData: ThemeV3[] = [];
      try {
        hubData = await this.loadHubTemplates();
        console.log(`${MODULE_ID} | Loaded ${hubData.length} hub templates`);
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to load hub templates:`, err);
      }

      // Merge all (avoiding duplicates from themes.json)
      const uniqueThemes = new Map<string, ThemeV3>();
      
      // Load local first, then overwrite with user themes, and then add hub templates
      localData.forEach(t => uniqueThemes.set(t.id, t));
      userThemes.forEach(t => uniqueThemes.set(t.id, t));
      hubData.forEach(t => uniqueThemes.set(t.id, t));
      
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
    // Aggregate all theme CSS
    const themesCSS = this.themes
      .filter(t => t.css)
      .map(t => `/* Theme: ${t.id} */\n${t.css}`)
      .join("\n\n");

    // Extract all @import statements to put them at the very top (browser ignores them if not at the start)
    const imports: string[] = [];
    const restCSS = themesCSS.replace(/@import\s+url\([^)]+\);?/gi, (match) => {
      imports.push(match);
      return "";
    });

    styleTag.textContent = imports.join("\n") + "\n\n" + buttonCSS + "\n\n" + restCSS;
  }

  static getTheme(id: string): ThemeV3 | undefined {
    return this.themes.find(t => t.id === id);
  }

  static getThemeList() {
    return this.themes;
  }

  static layoutCache: Record<string, string> = {};

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

  static getThemeLayoutSync(id: string): string | null {
    if (this.layoutCache[id]) return this.layoutCache[id];
    const theme = this.getTheme(id);
    if (!theme) return null;
    return theme.contentTemplate || `<h2>${theme.name}</h2><p>Modelo padrão injetado. Adicione conteúdo aqui.</p>`;
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

    // 2. Fallback to layoutPath (HBS) - carregado diretamente via fetch local
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

const { ApplicationV2, HandlebarsApplicationMixin } = (foundry as any).applications.api;

/**
 * Theme Selector Application (ApplicationV2)
 */
class ThemeSelector extends (HandlebarsApplicationMixin(ApplicationV2) as any) {
  public document: any;
  public tabGroups: Record<string, string> = { main: "gallery" };
  private _selectedThemeId: string | null = null;
  private _hasClickDelegation = false;
  private _tabsInitialized = false;
  public static _isApplyingLayout = false;
  public static _isCreatingTheme = false;

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
    createTheme: async function(this: ThemeSelector, event: Event) {
      if (ThemeSelector._isCreatingTheme) return;
      ThemeSelector._isCreatingTheme = true;
      try {
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
          callback: (event: any, button: any, dialog: any) => {
            const form = button.form;
            return {
              id: (form.querySelector("#new-theme-id") as HTMLInputElement).value,
              name: (form.querySelector("#new-theme-name") as HTMLInputElement).value
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
      } finally {
        ThemeSelector._isCreatingTheme = false;
      }
    },
    saveSettings: async function(this: ThemeSelector, event: any, form: HTMLFormElement, formData: any) {
      const data = formData.object;
      const themeVars: Record<string, any> = {};
      Object.keys(data).forEach(key => { if (key.startsWith("--")) themeVars[key] = data[key]; });
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
      ui.notifications.info((game as any).i18n.localize("JOURNAL_CSS.Notifications.SettingsSaved"));
    },
    applyAtomicLayout: async function(this: ThemeSelector, event: Event, target: HTMLElement) {
      if (ThemeSelector._isApplyingLayout) return;
      ThemeSelector._isApplyingLayout = true;

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
        ThemeSelector._isApplyingLayout = false;
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${MODULE_ID} | Erro ao atualizar a página existente:`, err);
        ui.notifications.error(`Erro ao aplicar modelo: ${message}`);
        return;
      }
    }

    // 2. Caso contrário (se foi aberto pela janela principal do diário), identifica o JournalEntry pai e cria uma página nova
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
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${MODULE_ID} | Falha crítica na criação da página:`, err);
      ui.notifications.error(`Erro ao criar página: ${message}`);
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
    position: { width: 750, height: 780 },
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
    const activeTiers = LicenseManager.getActiveTiers();
    const isPremiumActive = activeTiers.includes("premium");
    
    const themes = ThemeRegistry.getThemeList().map(t => {
      const themeTier = t.tier || "free";
      const isLocked = (t as any).isLocked ?? !LicenseManager.hasTier(themeTier);
      return {
        ...t,
        name: (game as any).i18n.localize(t.name),
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
      isGM: (game as any).user.isGM,
      isPremiumActive
    };
  }



  /** @override */
  _onRender(context: any, options: any) {
    // Must re-bind tabs on every render because _replaceHTML sets content.innerHTML
    for (const [group, config] of Object.entries((this.constructor as any).TABS)) {
      const tabConfig = config as any;
      new (foundry.applications.ux as any).Tabs({
        ...tabConfig,
        initial: this.tabGroups[group] || tabConfig.initial,
        callback: (_event: any, _tabs: any, active: string) => {
          this.tabGroups[group] = active;
        }
      }).bind(this.element);
    }

    const html = this.element;

    // 1. Accordion Interactivity
    const accordions = html.querySelectorAll(".accordion-header");
    accordions.forEach((header: HTMLElement) => {
      header.addEventListener("click", (e) => {
        e.preventDefault();
        const section = header.parentElement;
        if (!section) return;

        const isCurrentlyActive = section.classList.contains("active");

        // Close all sections first
        const allSections = html.querySelectorAll(".accordion-section");
        (Array.from(allSections) as Element[]).forEach((s: Element) => s.classList.remove("active"));

        // Toggle active on clicked section
        if (!isCurrentlyActive) {
          section.classList.add("active");
        }
      });
    });

    // 2. Live Preview Interaction on Hover/Click (Gallery Tab)
    const themeCards = html.querySelectorAll(".tab[data-tab='gallery'] .theme-card");
    const previewWindow = html.querySelector(".tab[data-tab='gallery'] .journal-preview-window");
    const previewPage = html.querySelector(".tab[data-tab='gallery'] .journal-preview-page");

    const updatePreview = (themeId: string) => {
      if (previewWindow) {
        previewWindow.className = `journal-preview-window theme-${themeId}`;
      }
      if (previewPage) {
        previewPage.className = `journal-preview-page journal-theme-${themeId}`;
        ThemeRegistry.applyThemeVariables(previewPage, themeId, {});
      }
    };

    // Initialize with current selected theme class
    const initialThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
    updatePreview(initialThemeId);

    themeCards.forEach((card: HTMLElement) => {
      const themeId = card.dataset.theme || "none";

      // Hover to preview
      card.addEventListener("mouseenter", () => updatePreview(themeId));

      // Click to lock/select
      card.addEventListener("click", () => {
        this._selectedThemeId = themeId;
        updatePreview(themeId);
      });
    });

    // Restore preview back to actual selected theme when leaving the grid area
    const selectionArea = html.querySelector(".tab[data-tab='gallery'] .theme-selection-area");
    selectionArea?.addEventListener("mouseleave", () => {
      const activeThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
      updatePreview(activeThemeId);
    });

    // 3. Live Preview Interaction for Templates Tab
    const templateCards = html.querySelectorAll(".tab[data-tab='templates'] .template-card");
    const templatePreviewWindow = html.querySelector(".template-preview-window");
    const templatePreviewPage = html.querySelector(".template-preview-page");

    const updateTemplatePreview = (themeId: string) => {
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

    // Initialize template preview with current active theme
    updateTemplatePreview(initialThemeId);

    templateCards.forEach((card: HTMLElement) => {
      const themeId = card.dataset.theme || "none";

      card.addEventListener("mouseenter", () => {
        updateTemplatePreview(themeId);
      });
    });

    // Restore template preview when mouse leaves the selection area
    const templateSelectionArea = html.querySelector(".tab[data-tab='templates'] .theme-selection-area");
    templateSelectionArea?.addEventListener("mouseleave", () => {
      const activeThemeId = this._selectedThemeId ?? (this.document.getFlag(MODULE_ID, "theme") || "none");
      updateTemplatePreview(activeThemeId);
    });
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

  // Load Google Fonts via link tag instead of CSS @import to avoid CSS cascade issues
  // Register Handlebars Helpers
  Handlebars.registerHelper("eq", (a, b) => a === b);

  // Load Google Fonts via link tag if enabled
  Hooks.once("ready", () => {
    if ((game as any).settings.get(MODULE_ID, "loadGoogleFonts")) {
      const fontLink = document.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono&family=Caveat:wght@500&family=Dancing+Script:wght@600&family=Playfair+Display:wght@400;900&family=Libre+Baskerville:wght@400;700&display=swap";
      document.head.appendChild(fontLink);
    }
  });

  // Register Settings
  (game as any).settings.register(MODULE_ID, "userThemes", {
    name: "User Themes",
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => ThemeRegistry.initialize()
  });

  (game as any).settings.register(MODULE_ID, "allowPlayerThemes", {
    name: "JOURNAL_CSS.Settings.AllowPlayerThemes.Name",
    hint: "JOURNAL_CSS.Settings.AllowPlayerThemes.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  (game as any).settings.register(MODULE_ID, "loadGoogleFonts", {
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

  (game as any).settings.register(MODULE_ID, "premiumKeys", {
    name: "Premium Keys",
    scope: "client",
    config: false,
    type: Array,
    default: [],
    onChange: () => ThemeRegistry.initialize()
  });

  // ThemeRegistry.initialize() é diferido para o hook 'ready' para garantir que
  // game.settings, game.modules e as chaves do STC já estejam disponíveis.

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

Hooks.once("ready", async () => {
  const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;

  const runInit = async () => {
    await ThemeRegistry.initialize();

    // Registra templates no HUD do Storyteller Cinema se ele estiver ativo
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
  };

  if (isCinemaActive) {
    // Aguarda o STC terminar de sincronizar chaves do servidor antes de buscar templates do hub
    Hooks.once("storyteller-cinema-keys-updated", async () => {
      await runInit();
    });
    // Fallback: se o evento não disparar em 5s (ex: STC sem chaves), inicializa mesmo assim
    setTimeout(async () => {
      if (ThemeRegistry.getThemeList().length === 0) {
        console.warn(`${MODULE_ID} | STC keys event timeout — initializing without premium keys.`);
        await runInit();
      }
    }, 5000);
  } else {
    // STC não está ativo: inicializa diretamente
    await runInit();
  }
});

Hooks.on("renderSettingsConfig", (_app: any, html: any) => {
  const root: HTMLElement = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const stcGroup = root.querySelector('.tab[data-tab="journal-css"]') || root.querySelector('[data-category="journal-css"]');
  if (!stcGroup) return;

  if (stcGroup.querySelector('.journal-css-premium-banner')) return;

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
    const stcApi = (window as any).StorytellerCinema;
    if (stcApi) {
      // @ts-ignore — caminho resolvido em runtime pelo Foundry, não pelo compilador TS
      import("/modules/storyteller-cinema/apps/key-manager.js")
        .then(({ KeyManager }: any) => new KeyManager().render(true, { focus: true }))
        .catch(() => {
          openLocalKeyManagerDialog();
        });
    } else {
      openLocalKeyManagerDialog();
    }
  });

  stcGroup.prepend(banner);
});

// Função utilitária para salvar chaves no servidor do Foundry
export async function savePremiumKeysToServer(keys: string[]): Promise<boolean> {
  if (!(game as any).user?.isGM) return false;
  try {
    const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";

    // @ts-ignore
    const FilePickerClass = foundry.applications?.apps?.FilePicker || FilePicker;
    const source = 'data';
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
    const blob = new Blob([data], { type: 'application/json' });
    const file = new File([blob], "keys.json", { type: 'application/json' });

    // @ts-ignore
    await FilePickerClass.upload(source, targetFolder, file);
    console.log(`Journal CSS | Chaves salvas com sucesso no servidor em ${targetFolder}/keys.json`);
    return true;
  } catch (err) {
    console.error("Journal CSS | Falha ao salvar chaves no servidor:", err);
    return false;
  }
}

// Nova Classe KeyManager (ApplicationV2) para gerenciar chaves no journal-css de forma idêntica
export class KeyManager extends (foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) as any) {
  private _hookId: number | null = null;

  constructor(options = {}) {
    super(options);
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

  async _prepareContext(_options: any): Promise<any> {
    const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";

    // Puxar chaves do arquivo local no servidor
    let keysArray: string[] = [];
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) keysArray = data;
      }
    } catch (_) {}

    const activeKeysList = [];
    const unlockedPacks = new Set<string>(['classics']);
    const ignoreDevKeys = (game as any).settings.get(MODULE_ID, "ignoreDevKeys") ?? false;
    const hasDevKey = keysArray.some(key => key.startsWith('sammore-dev-') && key.endsWith('5633'));
    
    for (const key of keysArray) {
      const isDev = !ignoreDevKeys && key.startsWith('sammore-dev-') && key.endsWith('5633');
      let tier = "Avulsa/Promocional";
      let typeClass = "promo";

      if (isDev) {
        tier = "Desenvolvedor";
        typeClass = "dev";
        unlockedPacks.add('the-umbra');
        unlockedPacks.add('cyberpunk-neon');
        unlockedPacks.add('eldritch-abyss');
        unlockedPacks.add('steampunk-gears');
      } else if (key.toLowerCase() === 'classics') {
        tier = "Gratuito";
        typeClass = "free";
      } else {
        try {
          const res = await fetch(`https://storyteller-cinema-proxy.robsammore.workers.dev/packs?key=${encodeURIComponent(key)}`);
          if (res.ok) {
            const data = await res.json();
            (data.packs || []).forEach((p: string) => unlockedPacks.add(p));
            
            if (data.packs?.includes('cyberpunk-neon')) {
              tier = "Patreon Silver";
              typeClass = "patreon";
            } else if (data.packs?.includes('the-umbra') && data.packs?.length > 2) {
              tier = "Patreon Gold";
              typeClass = "patreon";
            } else if (data.packs?.includes('the-umbra')) {
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
        id: 'the-umbra',
        title: 'Bronze Suporter (The Umbra Pack)',
        description: 'Estética sombria e misteriosa perfeita para crônicas góticas e mistérios arcanos.',
        banner: 'modules/storyteller-cinema/assets/premium-banner/premium-banner.png',
        link: 'https://www.patreon.com/c/storyteller_cinema',
        unlocked: unlockedPacks.has('the-umbra')
      },
      {
        id: 'cyberpunk-neon',
        title: 'Silver Suporter (Cyberpunk Neon Pack)',
        description: 'Visuais futuristas vibrantes, luzes de neon e telas de dados de alta tecnologia.',
        banner: 'modules/storyteller-cinema/assets/premium-banner/premium-banner.png',
        link: 'https://www.patreon.com/c/storyteller_cinema',
        unlocked: unlockedPacks.has('cyberpunk-neon')
      },
      {
        id: 'gold-pack',
        title: 'Gold Suporter (Arsenal Cinemático Completo)',
        description: 'Desbloqueia absolutamente todas as skins do acervo, incluindo Steampunk Gears e Eldritch Abyss.',
        banner: 'modules/storyteller-cinema/assets/premium-banner/premium-banner.png',
        link: 'https://www.patreon.com/c/storyteller_cinema',
        unlocked: unlockedPacks.has('eldritch-abyss') || unlockedPacks.has('steampunk-gears')
      }
    ];

    return {
      activeKeys: activeKeysList,
      packs: packsShowcase,
      ignoreDevKeys,
      hasDevKey
    };
  }

  _onRender(_context: any, _options: any): void {
    super._onRender(_context, _options);
    if (!this._hookId) {
      this._hookId = Hooks.on('storyteller-cinema-skins-updated', () => {
        if (this.rendered) this.render();
      });
    }
  }

  static async _onSubmit(_event: any, _form: any, _formData: any) {}

  static async _onAddKey(this: KeyManager, event: Event, _target: HTMLElement) {
    event.preventDefault();
    const container = this.element;
    const input = container.querySelector('.new-key-field') as HTMLInputElement;
    const newKey = input?.value?.trim();

    if (!newKey) {
      ui.notifications?.warn("Journal CSS | Digite uma chave premium para adicionar.");
      return;
    }

    const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";

    let keysList: string[] = [];
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) keysList = data;
      }
    } catch (_) {}

    if (keysList.includes(newKey)) {
      ui.notifications?.info("Journal CSS | Esta chave já está cadastrada.");
      return;
    }

    keysList.push(newKey);
    await savePremiumKeysToServer(keysList);
    
    // Forçar recarga em memória
    if ((game as any).settings.get("storyteller-cinema", "premiumKeys")) {
      await (game as any).settings.set("storyteller-cinema", "premiumKeys", keysList);
    }
    await (game as any).settings.set(MODULE_ID, "premiumKeys", keysList);

    ui.notifications?.info("Journal CSS | Chave adicionada com sucesso!");
    input.value = "";
    this.render();
  }

  static async _onRemoveKey(this: KeyManager, event: Event, _target: HTMLElement) {
    event.preventDefault();
    // @ts-ignore
    const keyToRemove = event.currentTarget?.dataset?.key || _target?.dataset?.key;
    if (!keyToRemove) return;

    const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
    const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";

    let keysList: string[] = [];
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) keysList = data;
      }
    } catch (_) {}

    const filteredKeys = keysList.filter(k => k !== keyToRemove);
    await savePremiumKeysToServer(filteredKeys);

    if ((game as any).settings.get("storyteller-cinema", "premiumKeys")) {
      await (game as any).settings.set("storyteller-cinema", "premiumKeys", filteredKeys);
    }
    await (game as any).settings.set(MODULE_ID, "premiumKeys", filteredKeys);

    ui.notifications?.info("Journal CSS | Chave removida.");
    this.render();
  }

  static _onConnectPatreon(this: KeyManager, event: Event, _target: HTMLElement) {
    event.preventDefault();
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      'https://storyteller-cinema-proxy.robsammore.workers.dev/oauth/login',
      'PatreonLogin',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );

    if (popup) {
      const messageListener = async (e: MessageEvent) => {
        if (e.origin !== 'https://storyteller-cinema-proxy.robsammore.workers.dev') return;
        
        if (e.data?.type === 'PATREON_KEY_ACTIVATED' && e.data?.key) {
          const newKey = e.data.key;
          const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
          const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";

          let keysList: string[] = [];
          try {
            const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) keysList = data;
            }
          } catch (_) {}

          if (!keysList.includes(newKey)) {
            keysList.push(newKey);
            await savePremiumKeysToServer(keysList);

            if ((game as any).settings.get("storyteller-cinema", "premiumKeys")) {
              await (game as any).settings.set("storyteller-cinema", "premiumKeys", keysList);
            }
            await (game as any).settings.set(MODULE_ID, "premiumKeys", keysList);

            ui.notifications?.info("Journal CSS | Patreon conectado e chave premium ativada!");
            this.render();
          }
          window.removeEventListener('message', messageListener);
        }
      };
      window.addEventListener('message', messageListener);
    }
  }

  static async _onToggleIgnoreDev(this: KeyManager, event: Event, _target: HTMLElement) {
    event.preventDefault();
    const currentVal = (game as any).settings.get(MODULE_ID, "ignoreDevKeys") || false;
    await (game as any).settings.set(MODULE_ID, "ignoreDevKeys", !currentVal);
    ui.notifications?.info(`Journal CSS | Modo de teste ${!currentVal ? 'ativado' : 'desativado'}.`);
    this.render();
  }
}

function openLocalKeyManagerDialog() {
  new KeyManager().render(true, { focus: true });
}

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

  const isPage = appObj.document?.documentName === "JournalEntryPage";
  if (!isPage) return; // Injeta o botão apenas na janela de edição/página solta, mantendo o Registro principal limpo

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("header-control", "journal-css-selector");
  btn.innerHTML = '<i class="fas fa-swatchbook"></i>';
  btn.title = "Modelos de Página";
  
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

function injectTemplateSelectIntoCreateDialog(app: any, html: any) {
  const element = html[0] || html;

  // Verifica se é a janela/diálogo nativo de criar página de diário
  const title = app.data?.title || app.title || app.options?.title || "";
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
        ${ThemeRegistry.getThemeList().map(t => `<option value="${t.id}">${t.name}</option>`).join("")}
      </select>
    </div>
  `;

  const select = formGroup.querySelector("select") as HTMLSelectElement;
  const updatePending = () => {
    (game as any)._pendingJournalCSSTemplate = { 
      template: select.value, 
      time: Date.now()
    };
    console.log(`${MODULE_ID} | Modelo agendado para criação:`, (game as any)._pendingJournalCSSTemplate);
  };

  select.addEventListener("change", updatePending);
  updatePending(); // Inicializa com 'none'

  typeFormGroup.after(formGroup);
}

Hooks.on("renderDialog", injectTemplateSelectIntoCreateDialog);
Hooks.on("renderJournalEntryPageConfig", injectTemplateSelectIntoCreateDialog);

Hooks.on("preCreateJournalEntryPage", (doc: any, data: any, options: any, userId: any) => {
  const pending = (game as any)._pendingJournalCSSTemplate;
  if (!pending) return;

  if (Date.now() - pending.time > 30000) return;

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
    delete (game as any)._pendingJournalCSSTemplate;
  }
});

async function applyJournalTheme(sheet: any, themeOverride?: string, varsOverride?: Record<string, any>) {
  // Target the specific container for the page/content, not the whole window
  const element = sheet.element;
  if (!element) return;
  
  const doc = sheet.document;
  if (!doc) return;

  // Inherit theme from parent if this is a page
  const parentTheme = doc.parent?.getFlag(MODULE_ID, "theme");
  const selectedTheme = themeOverride || doc.getFlag(MODULE_ID, "theme") || parentTheme || "none";
  
  // Find the content container - never fall back to root element to avoid leaking theme classes
  const contentSelectors = ".journal-entry-page, .journal-entry-pages, .editor-container, .journal-page-content, .page-content, .editor-content, .prosemirror, .ProseMirror";
  let targetEl = element.querySelector(contentSelectors) as HTMLElement;
  if (!targetEl) targetEl = element.querySelector(".window-content") as HTMLElement;
  if (!targetEl) return; // no content container found, skip safely

  targetEl.classList.forEach((cls: string) => { if (cls.startsWith('journal-theme-')) targetEl.classList.remove(cls); });
  if (selectedTheme !== "none") targetEl.classList.add(`journal-theme-${selectedTheme}`);

  const parentVars = doc.parent?.getFlag(MODULE_ID, "themeVars") || {};
  const themeVars = varsOverride || doc.getFlag(MODULE_ID, "themeVars") || parentVars || {};
  
  ThemeRegistry.applyThemeVariables(targetEl, selectedTheme, themeVars);

  const contentEl = (targetEl.querySelector(".ProseMirror, .editor-content, .page-content, .journal-page-content") || targetEl) as HTMLElement;

  // Legacy Tweaks (Compat)
  const tweaks = doc.getFlag(MODULE_ID, "tweaks") || doc.parent?.getFlag(MODULE_ID, "tweaks") || {};
  if (tweaks.fontSize) contentEl.style.fontSize = `${tweaks.fontSize}px`;
  if (tweaks.lineHeight) contentEl.style.lineHeight = tweaks.lineHeight;
  if (tweaks.textAlign) contentEl.style.textAlign = tweaks.textAlign;
  if (tweaks.fontFamily) contentEl.style.fontFamily = tweaks.fontFamily;

  // Custom CSS - scoped inside the content container, not the root element
  const customCSS = doc.getFlag(MODULE_ID, "customCSS") || doc.parent?.getFlag(MODULE_ID, "customCSS");
  let styleTag = element.querySelector(`#${MODULE_ID}-custom-style`) as HTMLStyleElement;
  if (customCSS) {
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = `${MODULE_ID}-custom-style`;
      targetEl.appendChild(styleTag);
    }
    styleTag.textContent = customCSS;
  } else if (styleTag) styleTag.remove();

  // Configura um MutationObserver no content container para quando o Foundry alternar para edição (ProseMirror)
  if (!(targetEl as any)._journalThemeObserver) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          const addedEditor = Array.from(m.addedNodes).find(n => (n as HTMLElement).classList && ((n as HTMLElement).classList.contains("editor") || (n as HTMLElement).classList.contains("ProseMirror") || (n as HTMLElement).classList.contains("editor-container") || (n as HTMLElement).querySelector(".ProseMirror, .editor, .editor-container")));
          if (addedEditor) {
            const newTarget = (targetEl.querySelector(contentSelectors) || targetEl) as HTMLElement;
            newTarget.classList.forEach((cls: string) => { if (cls.startsWith('journal-theme-')) newTarget.classList.remove(cls); });
            if (selectedTheme !== "none") newTarget.classList.add(`journal-theme-${selectedTheme}`);
            ThemeRegistry.applyThemeVariables(newTarget, selectedTheme, themeVars);
            break;
          }
        }
      }
    });
    observer.observe(targetEl, { childList: true, subtree: true });
    (targetEl as any)._journalThemeObserver = observer;
  }
}

function injectCreateByTemplateButton(appEl: HTMLElement, appObj: any) {
  // Apenas injeta se a sheet for editável/GM tiver permissão
  const isEditable = appObj.isEditable || appObj.options?.editable;
  if (!isEditable) return;

  // Verifica se é a janela principal de um JournalEntry (e não uma página solta)
  const isJournal = appObj.document?.documentName === "JournalEntry";
  if (!isJournal) return;

  // Procura a barra lateral de páginas no DOM (V14 e V13 compat)
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

  // Tenta encontrar o botão nativo de criar página ou o footer/header da sidebar
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

Hooks.on("renderJournalSheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
  injectCreateByTemplateButton(element, app);
});

Hooks.on("renderJournalEntrySheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
  injectCreateByTemplateButton(element, app);
});

Hooks.on("renderJournalPageSheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
});

Hooks.on("renderJournalEntryPageProseMirrorSheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
});

Hooks.on("renderJournalEntryPageTextSheet", (app: any, html: any) => {
  const element = html[0] || html;
  applyJournalTheme(app);
  injectThemeButton(element, app);
});

Hooks.on("createProseMirrorEditor", (uuid: any, plugins: any, options: any) => {
  setTimeout(() => {
    Object.values(ui.windows).forEach((app: any) => {
      if (app.document?.documentName?.startsWith("JournalEntry")) {
        applyJournalTheme(app);
      }
    });
  }, 50);
});

Hooks.on("updateJournalEntryPage", (doc: any, change: any, options: any, userId: any) => {
  if (change.flags?.[MODULE_ID]) {
    setTimeout(() => {
      Object.values(ui.windows).forEach((app: any) => {
        if (app.document === doc || app.document?.pages?.get?.(doc.id) || app.document?.id === doc.parent?.id) {
          applyJournalTheme(app);
        }
      });
    }, 50);
  }
});

Hooks.on("updateJournalEntry", (doc: any, change: any, options: any, userId: any) => {
  if (change.flags?.[MODULE_ID]) {
    setTimeout(() => {
      Object.values(ui.windows).forEach((app: any) => {
        if (app.document === doc || app.document?.parent?.id === doc.id) {
          applyJournalTheme(app);
        }
      });
    }, 50);
  }
});

Hooks.once("init", () => {
  (game as any).settings.register(MODULE_ID, "premiumKeys", {
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  (game as any).settings.register(MODULE_ID, "ignoreDevKeys", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });
});

Hooks.on("ready", async () => {
  const isCinemaActive = (game as any).modules?.get("storyteller-cinema")?.active;
  const targetFolder = isCinemaActive ? "storyteller-cinema" : "journal-css";

  // 1. GM valida e garante a criação preventiva do arquivo e migração de chaves
  let serverKeys: string[] = [];
  const clientKeys = (game as any).settings.get(MODULE_ID, "premiumKeys") || [];
  const stcKeys = (game as any).settings.get("storyteller-cinema", "premiumKeys") || [];
  serverKeys = Array.from(new Set([...clientKeys, ...stcKeys]));

  if ((game as any).user?.isGM) {
    try {
      // @ts-ignore
      const FilePickerClass = foundry.applications?.apps?.FilePicker || FilePicker;
      let fileExists = false;
      try {
        const browse = await FilePickerClass.browse('data', targetFolder);
        fileExists = browse.files.some((f: string) => f.endsWith("keys.json"));
      } catch (_) {}

      if (serverKeys.length > 0) {
        if (!fileExists) {
          try {
            await FilePickerClass.createDirectory('data', targetFolder);
          } catch (_) {}
        }
        const blob = new Blob([JSON.stringify(serverKeys, null, 2)], { type: 'application/json' });
        const file = new File([blob], "keys.json", { type: 'application/json' });
        await FilePickerClass.upload('data', targetFolder, file);
      } else if (!fileExists && serverKeys.length === 0) {
        try {
          await FilePickerClass.createDirectory('data', targetFolder);
        } catch (_) {}
        const blob = new Blob([JSON.stringify([], null, 2)], { type: 'application/json' });
        const file = new File([blob], "keys.json", { type: 'application/json' });
        await FilePickerClass.upload('data', targetFolder, file);
      }
    } catch (err) {
      console.warn("Journal CSS | Erro ao inicializar/migrar arquivo de chaves no ready:", err);
    }
  } else {
    // Jogador comum faz o fetch das chaves do servidor
    try {
      const res = await fetch(`/${targetFolder}/keys.json?v=` + Date.now());
      if (res.ok) {
        const parsed = await res.json();
        if (Array.isArray(parsed)) serverKeys = parsed;
      }
    } catch (_) {}
  }

  // 2. Sincronizar chaves na setting local
  if (serverKeys.length > 0) {
    await (game as any).settings.set(MODULE_ID, "premiumKeys", serverKeys);
    console.log("Journal CSS | Chaves premium sincronizadas com sucesso.");
  }

  // 3. Força a recarga e pre-carregamento dos templates com as chaves sincronizadas
  await ThemeRegistry.initialize();
  await ThemeRegistry.preloadLayouts();

  // Re-apply to all open journals
  Object.values(ui.windows).forEach((app: any) => {
    if (app.document?.documentName?.startsWith("JournalEntry")) {
      applyJournalTheme(app);
      if (app.element) {
        injectThemeButton(app.element, app);
        injectCreateByTemplateButton(app.element, app);
      }
    }
  });
});

Hooks.on('storyteller-cinema-keys-updated', async (keys: string[]) => {
  if (Array.isArray(keys) && keys.length > 0) {
    await (game as any).settings.set(MODULE_ID, "premiumKeys", keys);
    await ThemeRegistry.initialize();
    await ThemeRegistry.preloadLayouts();
    
    // Re-apply a todos os diários abertos com os novos templates em cache
    Object.values(ui.windows).forEach((app: any) => {
      if (app.document?.documentName?.startsWith("JournalEntry")) {
        applyJournalTheme(app);
      }
    });
  }
});
