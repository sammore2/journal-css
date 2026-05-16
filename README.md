# Journal CSS (Themed Journals)

Dynamic theme engine for Foundry VTT V14. Custom-style your journal entries with high-fidelity editorial themes.

## Features
- **Dynamic Theme Engine**: Load themes locally or from remote JSON sources.
- **ApplicationV2 UI**: Modern, glassmorphic theme selector interface.
- **Persistent Styling**: Theme choices are saved directly into Journal Entry flags.
- **Custom CSS Support**: Add your own CSS tweaks per-journal without editing module files.

## Remote Content Support
This module allows you to sync with external theme collections. You can provide a URL to a `themes.json` file in the module settings to expand your library with community-made themes.

### JSON Schema for External Collections:
```json
[
  {
    "id": "theme-id",
    "name": "Theme Name",
    "description": "Short description of the theme.",
    "icon": "fas fa-star",
    "color": "#ffcc00",
    "css": ".journal-theme-theme-id .window-content { ... }"
  }
]
```

## Credits
Author: Rob Sammore
License: MIT
