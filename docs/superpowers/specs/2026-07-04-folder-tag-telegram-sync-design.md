# Folder Tag Telegram Sync — Design Spec

**Date:** 2026-07-04  
**Status:** Approved  
**Scope:** Flutter (`televault`) + Electron (`televault-desktop`)

## Problem

Folder tags are stored locally in SQLite (`folder_tags`) but only sync to Telegram when a **folder marker message** exists (text message with JSON `{"v":1,"dir":"...","tags":[...]}`). Uploading a folder creates file messages only — no markers — so tags edited after upload stay local and do not appear on other devices.

File document captions intentionally omit tags; files inherit effective tags from ancestor folders.

## Goals

1. **Multiple tags per folder** — preserve and enforce (array in marker caption + `folder_tags` rows).
2. **Cross-device sync** — phone (Flutter) and PC (Electron) read/write the same Telegram vault channel.
3. **Lazy marker creation** — create a folder marker on Telegram only when the user actively edits tags (or uses New folder, which already sends a marker).
4. **No automatic backfill** — existing local-only tags are not pushed until the user edits tags on that folder again.

## Non-Goals

- Tags on individual file captions (schema unchanged).
- Markers for every folder at upload time.
- Automatic migration of all historical local tags.
- Desktop multi-tag UI redesign (comma prompt is acceptable for v1; Flutter chip editor unchanged).

## Architecture

### Source of truth

| Layer | Role |
|-------|------|
| Telegram folder marker caption | Authoritative tag list for sync across devices |
| SQLite `folder_tags` | Local cache for search/filter; rebuilt from markers on scan |
| File captions | Path/size/sha256/mtime only — no tags |

### Marker caption format (unchanged)

```json
{"v":1,"dir":"/My Folder/","tags":["manga","cbz","đã đọc"]}
```

Omit `tags` key when empty. Multiple tags are an ordered unique list (normalized before write).

### Core flow: `setFolderTags(folderPath, tags[])`

1. Normalize tags (trim, dedupe, max 50 chars, no commas).
2. Write full tag list to `folder_tags` locally.
3. If folder marker exists in DB → `editMessageText` with updated caption → upsert marker entry.
4. If no marker:
   - If `tags` is empty → stop (nothing to sync; no new marker).
   - If `tags` non-empty → `sendMessage` text with `encodeCaption(dirMarker({ path, tags }))` (single message includes all tags).
5. On send failure → journal retry step; local tags remain; user sees error.

### Lazy marker policy

| Action | Marker absent | Marker present |
|--------|---------------|----------------|
| Set tags `['a','b']` | Send new marker with both tags | Edit caption |
| Set tags `[]` | Local only; no Telegram call | Edit caption to remove tags |
| New folder | Send marker (existing behavior) | N/A |

### Tag rename / delete (Tags screen)

- **renameTag / deleteTag:** Update all folder markers that carry the tag (existing journaled caption edits). Folders with local tags only and no marker are updated in `folder_tags` only until the user next edits tags on that folder (per no-backfill policy).

### Cross-device updates

- **Initial sync:** `scanHistory` decodes marker captions → upserts `folder_tags`.
- **Live sync:** Listen for `updateMessageContent` (Flutter already; Desktop must add) and `updateNewMessage` for new markers.
- **Send id rekey:** `updateMessageSendSucceeded` maps temp id → permanent id (existing).

### Validation

Shared rules (core or duplicated per platform convention):

- Tag length ≤ 50 characters
- No comma in tag string
- Trim whitespace; drop empty strings
- Dedupe case-sensitive (preserve first occurrence order)

## Components to change

### Shared / core

- Optional: `normalizeFolderTags(tags: string[]): string[]` in `@televault/core` with unit tests.

### Electron (`televault-desktop`)

- `electron/lib/vault/vaultService.js` — `ensureFolderMarker` + update `setFolderTags`
- `electron/lib/telegram/channelService.js` — handle `updateMessageContent`
- Tests: `televault/test`-equivalent in `packages/televault-core` + vault service tests if added

### Flutter (`televault`)

- `lib/services/vault_service.dart` — same `ensureFolderMarker` / `setFolderTags` behavior
- `test/vault_service_test.dart` — update `setFolderTags without marker` expectation

## Error handling

- Network/TDLib errors during send/edit → journal entry, toast/snackbar, local tags unchanged on rollback if send never succeeded.
- Duplicate marker race (two devices tag same folder simultaneously) → scan reconciliation; prefer existing marker path match; out of scope for automatic merge in v1.

## Testing

1. `setFolderTags` without marker + multiple tags → one `sendMessage` with full `tags` array in caption.
2. `setFolderTags` with existing marker → `editMessageText` only, no second send.
3. `setFolderTags` clear all tags on folder with marker → caption without tags.
4. `decodeCaption` roundtrip preserves multiple tags.
5. Desktop `updateMessageContent` updates local `folder_tags` when another client edits marker.
6. Flutter test updated for lazy marker send path.

## Success criteria

- User uploads folder on PC, tags folder with `manga, cbz` → Telegram channel shows text marker with both tags.
- User opens same account on phone after sync → folder shows both tags in search/filter/UI.
- User edits tags on phone → PC receives update via Telegram listener.
- Folders never tagged do not get extra marker messages.
