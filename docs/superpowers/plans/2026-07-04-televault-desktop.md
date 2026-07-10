# TeleVault Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `televault-desktop/` Electron app with full TeleVault feature parity; Flutter kept for mobile.

**Architecture:** React UI + Electron main process owning TDLib/SQLite; shared vault logic in `packages/televault-core` ported from Dart with matching Jest tests.

**Tech Stack:** Electron 34, React 19, Vite 8, Tailwind 4, `@supabase/supabase-js`, `tdl`, `better-sqlite3`, Jest, electron-builder.

**Spec:** `docs/superpowers/specs/2026-07-04-televault-desktop-design.md`

---

## Phase 1: Scaffold + Core + Auth Shell

### Task 1: Project scaffold

**Files:**
- Create: `televault-desktop/package.json`, `vite.config.js`, `index.html`, `.gitignore`, `jest.config.js`
- Create: `televault-desktop/electron/main.js`, `electron/preload.js`
- Create: `televault-desktop/src/main.jsx`, `src/App.jsx`, `src/index.css`

- [x] Step 1: Create package.json with electron-builder config (mac dmg + win nsis)
- [x] Step 2: Vite + React entry
- [x] Step 3: Minimal Electron window loading dev server or dist

Run: `cd televault-desktop && npm install && npm run test && npm run build`

### Task 2: televault-core package

**Files:**
- Create: `packages/televault-core/package.json`
- Create: `packages/televault-core/src/*.js`
- Create: `packages/televault-core/__tests__/*.test.js`

- [x] Port `captionCodec`, `vaultEntry`, `vaultTree`, `trash` from Flutter
- [x] Jest tests mirror `caption_codec_test.dart`, `vault_tree_test.dart`

Run: `npm test`

### Task 3: Supabase auth (main process)

**Files:**
- Create: `electron/lib/auth/googleAuthService.js` (adapt from crawler)
- Create: `electron/lib/auth/telegramApiCredentialsStore.js`
- Create: `electron/lib/ipc/sessionHandlers.js`

- [x] Localhost OAuth + `resolve-user-profile`
- [x] IPC: `session:getState`, `session:signInGoogle`, `session:signOut`, `session:saveTelegramApi`

### Task 4: React auth screens

**Files:**
- Create: `src/hooks/useSession.js`
- Create: `src/screens/SupabaseAuthScreen.jsx`, `TelegramApiSetupScreen.jsx`, `BootScreen.jsx`, `HomeShell.jsx`

- [x] Session phase routing matching Flutter
- [x] vi/en strings minimal set

---

## Phase 2: TDLib + Telegram auth

### Task 5: TDLib client wrapper

**Files:**
- Create: `electron/lib/telegram/tdClient.js`, `authService.js`, `channelService.js`
- Create: `electron/lib/telegram/bin/` + fetch script

- [x] Bundle tdjson via `prebuilt-tdlib` (+ Homebrew fallback)
- [x] Phone → OTP → 2FA flow
- [x] IPC handlers for auth state

### Task 6: Channel scan + IndexDb

**Files:**
- Create: `electron/lib/db/indexDb.js`
- Create: `electron/lib/vault/vaultService.js`, `vaultOps.js`

- [x] SQLite schema core (files, tags, kv, journal table)
- [x] Scan channel, decode captions via televault-core
- [x] Sync progress IPC (`session:changed`)

---

## Phase 3: Vault UI + operations

### Task 7: Browser UI

- [x] Sidebar nav (My Drive, Trash)
- [x] Folder tree panel (expand/collapse)
- [x] Breadcrumb navigation
- [x] List + grid view, sort by name/mtime/size
- [ ] Context menu: rename, move, trash, tags
- [ ] Drag-drop upload

### Task 8: Transfer queue

- [ ] Port `TransferQueue` from Dart
- [ ] Transfers screen with progress

---

## Phase 4: Tags, search, preview, settings

### Task 9: Remaining screens

- [ ] Tags screen, search, preview (image/PDF/video)
- [ ] Settings (parallel transfers, language, sign out)

---

## Phase 5: Release

### Task 10: Packaging

- [ ] `npm run electron:build:all` produces DMG + EXE
- [ ] README for televault-desktop
- [ ] Note Supabase redirect: allow `http://127.0.0.1:*` pattern or document dynamic port
