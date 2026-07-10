# TeleVault Desktop (Electron) — Design Spec

**Date:** 2026-07-04  
**Status:** Approved  
**Related:** `televault/` (Flutter mobile), `docs/superpowers/specs/2026-07-03-televault-design.md`

## 1. Purpose

Separate Electron desktop app (`televault-desktop/`) for **macOS + Windows** with DMG/EXE packaging from Mac via `electron-builder`. Flutter project (`televault/`) remains for **iOS + Android** only.

Full feature parity with current Flutter desktop: auth, vault browser, tags, search, preview, transfer queue, settings.

## 2. Decisions

| Decision | Choice |
|---|---|
| Desktop stack | Electron + React + Vite + Tailwind (mirror crawler) |
| Mobile stack | Flutter (`televault/`) unchanged |
| Vault protocol | Same as Flutter: caption JSON v1, channel `#televault-v1`, trash `/Rác/` |
| TDLib | Native `tdjson` in Electron **main process** via `tdl` npm |
| Business logic | Main process + `packages/televault-core` (ported from Dart, Jest tests mirror Flutter) |
| UI | React renderer via IPC (`contextBridge`) |
| Supabase | Same project `eurlodsgnskbqjpxtcsh`, Edge Function `resolve-user-profile` |
| OAuth (desktop) | Localhost callback server (crawler pattern), not custom URL scheme |
| SQLite | `better-sqlite3` in main process (IndexDb port) |
| Release | `electron-builder`: mac `dmg`, win `nsis`; `electron:build:all` from Mac |

## 3. Architecture

```
televault-desktop/
├── packages/televault-core/   # Pure logic: caption, tree, trash, search helpers
├── electron/
│   ├── main.js
│   ├── preload.js
│   └── lib/
│       ├── auth/              # Supabase OAuth, session file, TG api credentials
│       ├── telegram/          # TDLib client, auth, channel scan
│       ├── vault/             # VaultService, VaultOps
│       ├── transfer/          # TransferQueue
│       ├── db/                # IndexDb
│       └── ipc/               # IPC registration
└── src/                       # React UI
```

**Runtime flow:**

```
React UI  ←IPC→  Electron Main  →  TDLib (tdjson)  →  Telegram
                      ↓
                 SQLite + file cache (userData)
```

**Session phases** (match Flutter `SessionProvider`):

1. `booting` → hydrate Supabase session from disk  
2. `supabaseAuth` → Google login  
3. `telegramApiSetup` → per-user api_id/api_hash  
4. `telegramBooting` → TDLib init  
5. `auth` → phone / OTP / 2FA  
6. `syncing` → channel scan  
7. `ready` → vault UI  

## 4. Interop with Flutter mobile

- **Must not change** caption codec v1 or path conventions.
- `televault-core` tests use same vectors as Flutter `test/caption_codec_test.dart` and `test/vault_tree_test.dart`.
- Same Supabase user can use mobile + desktop; Telegram vault is shared via same Telegram account.

## 5. Packaging

Scripts (mirror crawler):

- `npm run electron:dev` — Vite + Electron  
- `npm run electron:build:mac` — DMG  
- `npm run electron:build:win` — NSIS (from Mac with win deps)  
- `npm run electron:build:all` — DMG + EXE  

TDLib binaries bundled per platform under `electron/lib/telegram/bin/` (from `televault/tool/fetch_tdlib.sh` sources).

## 6. Out of scope (v1 desktop)

- Linux installer  
- macOS notarization / App Store  
- Flutter macOS/Windows builds (frozen, not removed yet)

## 7. Testing

- Jest: `packages/televault-core`, auth helpers, caption/tree  
- Manual: OAuth, Telegram login, upload/download smoke on macOS + Windows  

## 8. Implementation phases

1. **Scaffold** — project, core package, auth UI, electron-builder  
2. **TDLib + auth** — phone login, channel discovery  
3. **Vault + IndexDb** — scan, browser, CRUD  
4. **Transfers** — queue, progress, resume  
5. **Tags, search, preview, settings** — parity screens  
6. **Release polish** — TDLib bundle scripts, README  
