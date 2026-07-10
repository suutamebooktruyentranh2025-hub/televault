# TeleVault Desktop

TeleVault is a powerful Electron-based desktop application that transforms your Telegram account into an unlimited cloud storage drive. With a UI inspired by Google Drive, it provides a seamless file management experience powered entirely by Telegram's TDLib under the hood.

## Features

- **Unlimited Storage Vault**: Upload, organize, and download files using your private Telegram Vault channel.
- **Shared Vaults**: Access and download files from Telegram channels acting as shared file repositories ("Shared with me").
- **Virtual File System**: Fully supports folders, file transfers, nested folder uploads, and renaming.
- **Local Database**: Metadata, tags, and folder structure are indexed locally using `better-sqlite3` for blazing fast load times and offline search.
- **Transfers Queue**: Reliable async background uploads/downloads with progress tracking, auto-resume, and cancellation support.
- **Multi-Account**: Seamlessly log in and switch between multiple Telegram accounts.
- **Tags & Trash**: Organize your files with colorful tags and a dedicated Trash bin.
- **Google Drive Sync**: Two-way and upload-only sync with Google Drive integration.
- **Beautiful UI/UX**: Dark Mode/Light Mode, Vietnamese & English localization, and smooth responsive React interface.

## Tech Stack

- **Framework**: Electron + React 18 + Vite
- **Styling**: Tailwind CSS
- **Database**: `better-sqlite3`
- **Telegram Client**: `tdl` / TDLib (`prebuilt-tdlib`)
- **State Management**: React Context, custom Hooks, and LocalStorage for UI persistence

## Development Setup

### 1. Install Dependencies
```bash
git clone https://github.com/suutamebooktruyentranh2025-hub/televault.git
cd televault-desktop
npm install
```

**Note on Native Modules:** `npm install` automatically triggers `electron-rebuild` to ensure `better-sqlite3` matches Electron's ABI. If you encounter a `MODULE_VERSION` mismatch later, run:
```bash
npm run postinstall
# or manually
npx electron-rebuild -f -o better-sqlite3
```

### 2. Run the App in Dev Mode
```bash
npm run electron:dev
```
This boots Vite's HMR dev server and launches the Electron application.

## Building for Release

To package the application into a standalone installer:
```bash
npm run electron:build:mac    # Builds .dmg for macOS
npm run electron:build:win    # Builds .exe (NSIS) for Windows
npm run electron:build:all    # Builds for all target platforms (Requires Mac)
```

## Structure overview

- `electron/` — Main process code (IPC handlers, TDLib coordinators, Auth Service, Vault Managers, Transfer Queue).
- `src/` — Renderer process code (React UI, screens, components, Tailwind styles).
- `src/components/VaultShell.jsx` — The main UI shell handling the Vault Grid and Sidebar navigation.
- `src/hooks/` — Custom hooks managing state sync with Electron's IPC APIs.
- `src/i18n/` — Vietnamese (`vi`) and English (`en`) localization dictionary.
- `.agent/` — Contains Antigravity AI assistant guidelines and custom workflows for the codebase.

## Support & Contact

TeleVault Desktop is maintained by the admin of "Sưu tầm Ebook truyện tranh".
For bug reports or access requests, reach out via:
- **Email**: suutamebooktruyentranh@gmail.com
- **Telegram (Admin)**: [@alexdandan](https://t.me/alexdandan)
- **Telegram Channel**: [Sưu tầm Ebook truyện tranh](https://t.me/suutamebooktruyentranh)
