# <p align="center">ModNinja
</p>

<p align="center">
   <img src="https://github.com/skillerious/ModNinja/blob/main/assets/modninjalogo1.png" alt="ModNinjaLogo" width="200"/>
</p>

**ModNinja** is a lightweight, read-only Vortex mod browser for Windows. It lets you quickly explore, manage, and export details of your game mods without launching Vortex itself.
</div>

<p align="center">
   <img src="https://github.com/skillerious/ModNinja/blob/main/assets/Screenshot%202025-04-29%20141054.png" alt="ss1" width="200"/>
</p>

---

## 📋 Table of Contents
1. [Features](#-features)  
2. [Installation](#-installation)  
3. [Usage](#-usage)  
   - [Launching](#launching)  
   - [Browsing Games & Mods](#browsing-games--mods)  
   - [List & Grid View](#list--grid-view)  
   - [Context Menus](#context-menus)  
   - [Export & Ordering](#export--ordering)  
   - [Readme & Screenshot Preview](#readme--screenshot-preview)  
4. [Configuration & Settings](#-configuration--settings)  
5. [Troubleshooting](#-troubleshooting)  
6. [Roadmap](#-roadmap)  
7. [Contributing](#-contributing)  
8. [License](#-license)  
9. [Credits](#-credits)  

---

## 🎯 Features

- **Automatic Vortex Detection**  
  Scans all drives (A–Z) for Vortex installations and discovers mod folders automatically.

- **Cover Art Retrieval & Caching**  
  Searches IGDB for game cover art, caches locally in `%APPDATA%/ModNinja/covers`, and falls back gracefully if not found.

- **Dual View Modes**  
  - **Grid (Card) View**: Display cover art in a responsive 2‑column card layout.  
  - **List View**: Compact list with thumbnails, sortable and searchable.

- **Contextual Menus**  
  Right‑click on games or mods to:
  - Open mod folder  
  - Open Vortex game folder  
  - Copy file path to clipboard  
  - Delete all mods for a game  
  - Refresh lists

- **Mod Details Panel**  
  View file counts, size, creation/modification dates, and directory structure breakdown.

- **Readme & Screenshot Preview**  
  Inline Markdown rendering of `README.md` (and other supported files) and a carousel of mod screenshots.

- **Drag‑and‑Drop Ordering**  
  Manually reorder mods; save & load custom order per game.

- **Export Functionality**  
  Export your mod list as `.txt`, `.json`, or `.csv` with a single click.

- **Theme Toggle**  
  Switch between dark/light modes on the fly.

- **Global Search**  
  Filter games and mods via search bar with live results and shortcut keys.

- **Robust Error Handling**  
  Gracefully handles missing folders, network failures, and displays custom dialogs.

---

## 🛠️ Installation

1. **Download** the latest [ModNinja release](https://github.com/yourusername/ModNinja/releases).  
2. **Unzip** the archive to your preferred location.  
3. **Run** `ModNinja.exe` (no installation required).

> **Note:** Ensure you have an internet connection for IGDB cover retrieval on first run.

---

## 🚀 Usage

### Launching
Double‑click `ModNinja.exe` to open the main window.

### Browsing Games & Mods
- **Games Pane** (left): Lists detected games.  
- **Mods Pane** (right): Lists mods for the selected game.  
- **Details Pane** (bottom): Shows detailed stats and README/screenshot preview.

### List & Grid View
- **Card/Grid View**: Default for quick visual browsing.  
- **List View**: Click the view toggle icon to switch to a compact list.

### Context Menus
Right‑click items to see context actions (open folder, copy path, delete, refresh).

### Export & Ordering
- Drag mods up/down to rearrange.  
- Click **Save Order** to persist your custom sort.  
- Click **Export** and choose format to save your list.

### Readme & Screenshot Preview
Click a mod to view its `README.md` (or `.txt`) rendered in Markdown and see screenshots (if available).

---

## ⚙️ Configuration & Settings

Access via the **Settings** gear icon:

- **General**:  
  - Auto‑refresh on startup  
  - Show hidden mods  

- **Appearance**:  
  - Dark/Light theme  
  - Compact list mode  

- **API**:  
  - Customize IGDB Client ID & Secret  

- **Notifications**:  
  - Enable or disable status notifications  

- **Custom Vortex Folder**:  
  - Manually select a Vortex install location if not auto‑detected.  
  - Click **Browse**, then **Scan & Apply** to register the folder.

Settings are saved to `%APPDATA%/ModNinja/config.json`.

---

## 🛠️ Troubleshooting

- **No games detected**:  
  - Ensure Vortex is installed.  
  - Use the manual **Browse** button in Settings.

- **Cover art missing**:  
  - Check your IGDB API credentials in Settings.  
  - Verify internet connectivity.

- **Mod list not loading**:  
  - Make sure your mod folders contain subfolders.  
  - Check folder permissions.

- **Application crashes**:  
  - Run from a folder path without special characters or excessive length.  
  - Consult the developer console (View → Toggle DevTools).

---

## 📈 Roadmap

- [x] Cross‑drive Vortex detection  
- [x] IGDB cover caching  
- [x] Drag‑and‑drop ordering  
- [x] Context menus  
- [ ] Batch mod operations (enable/disable)  
- [ ] Plugin support for other mod managers  
- [ ] Internationalization  

---

## 🤝 Contributing

1. **Fork** the repository  
2. **Create** a feature branch  
3. **Commit** your changes with clear messages  
4. **Open** a pull request and describe your feature  

Please adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## 🏆 Credits

- **Robin Doak** — Lead Developer  
- **Electron** — Desktop UI framework  
- **IGDB** — Game data API  
- **Inspiration**: Vortex mod manager by Nexus Mods  
