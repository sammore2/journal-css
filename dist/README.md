# Journal CSS (Themed Journals)

Dynamic theme engine for Foundry VTT V14. Custom-style your journal entries with high-fidelity editorial themes.

## Features
- **Dynamic Theme Engine**: Load themes locally or from remote JSON sources.
- **ApplicationV2 UI**: Modern, glassmorphic theme selector interface.
- **Persistent Styling**: Theme choices are saved directly into Journal Entry flags.
- **Custom CSS Support**: Add your own CSS tweaks per-journal without editing module files.

## Remote Content & Custom Themes
This module supports loading modular theme collections from local or remote JSON sources. You can provide a URL to a `themes.json` file in the module settings to expand your library with community-made themes.

### JSON Schema for Theme Collections:
```json
[
  {
    "id": "theme-id",
    "name": "Theme Name",
    "description": "Short description of the theme.",
    "cssPath": "modules/journal-css/styles/themes/theme-id.css",
    "layoutPath": "modules/journal-css/templates/layouts/theme-id.hbs",
    "customizable": true,
    "variables": [
      {
        "label": "Background Color",
        "key": "--theme-bg",
        "type": "color",
        "default": "#ffffff"
      },
      {
        "label": "Ink Color",
        "key": "--theme-ink",
        "type": "color",
        "default": "#000000"
      }
    ]
  }
]
```

### Creating Custom Themes
To bundle your own theme into the module, create the following 3 files in the `src/` directory:
1. **JSON Definition**: `src/themes/<theme-id>.json` (following the schema above).
2. **CSS Styles**: `src/styles/themes/<theme-id>.css` (scoped to `.journal-theme-<theme-id>`).
3. **Handlebars Layout**: `src/templates/layouts/<theme-id>.hbs` (using `{{{content}}}` where journal text should be injected).

## Credits
Author: Rob Sammore
License: MIT
