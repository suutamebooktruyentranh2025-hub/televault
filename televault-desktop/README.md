# TeleVault Desktop

Electron app cho macOS + Windows. Flutter `televault/` giữ cho mobile.

## Dev

```bash
cd televault-desktop
npm install          # postinstall tự rebuild better-sqlite3 cho Electron
npm test
npm run electron:dev
```

**Lưu ý native module:** `npm install` chạy `electron-rebuild` vì `better-sqlite3` phải khớp ABI của Electron (Node 20 / MODULE 132), không phải Node hệ thống (ví dụ Node 25 / MODULE 141). Nếu gặp lỗi MODULE_VERSION, chạy:

```bash
npx electron-rebuild -f -o better-sqlite3
```

## Build release

```bash
npm run electron:build:mac    # DMG
npm run electron:build:win    # NSIS (Windows)
npm run electron:build:all    # DMG + EXE từ Mac
```

## Auth flow

1. Google qua Supabase (localhost OAuth callback — giống crawler desktop)
2. `resolve-televault-access` Edge Function (TeleVault billing — crawler unchanged)
3. Nhập api_id / api_hash (lưu theo Supabase user)
4. Telegram login qua TDLib (`tdl` + `prebuilt-tdlib`)
5. Quét kênh vault → SQLite index → màn home (số mục)

**Supabase Dashboard:** thêm redirect `http://127.0.0.1:<port>/oauth2callback` (port động mỗi lần login).

**TDLib fallback macOS:** nếu `prebuilt-tdlib` lỗi, cài Homebrew `tdlib` hoặc set `TELEVAULT_TDJSON=/path/to/libtdjson.dylib`.

## Cấu trúc

- `packages/televault-core/` — logic vault port từ Dart (caption, tree, trash)
- `electron/` — main process, auth, TDLib (sắp tới)
- `src/` — React UI
