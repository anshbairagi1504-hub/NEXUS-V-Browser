# NEXUS V Browser

## Setup
1. Install Node.js LTS.
2. Open this folder in VS Code.
3. Open Terminal in this folder.
4. Run:
   npm install
   npm start

## Build Windows installer
Run:
   npm run build

The installer is generated in `dist`.

## Features
- Multiple tabs, homepage, search/address bar, back/forward/reload/home
- Bookmarks and browsing history
- Download progress list
- Dark/light theme
- Wallpaper selection
- Basic domain-based ad/tracker blocking toggle
- Update check/download/install UI

## Important limitations
- The ad blocker is a small domain blocklist, not a full browser-grade ad blocker.
- Auto-update requires publishing releases and configuring a provider (for example GitHub) in electron-builder's `build.publish` configuration. Update buttons won't fetch updates in an unpublished development build.
- The project has not been tested on your particular PC. If an error appears, share its full text/screenshot.
- This is an Electron-based browser shell, not a Chromium fork.
