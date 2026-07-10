# Folder Tag Telegram Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync multiple folder tags to Telegram via lazy folder markers so tags replicate between Flutter (phone) and Electron (PC).

**Architecture:** Keep tags on folder marker text messages (`dir` + `tags[]` JSON). Extend `setFolderTags` to send a marker when missing and tags are non-empty. Add `updateMessageContent` listener on Desktop. Share tag normalization in `@televault/core`.

**Tech Stack:** Node.js (Electron, `@televault/core`), Dart/Flutter (TDLib), SQLite `folder_tags`, TDLib send/edit message APIs.

**Spec:** `docs/superpowers/specs/2026-07-04-folder-tag-telegram-sync-design.md`

---

## File map

| File | Change |
|------|--------|
| `packages/televault-core/src/folderTags.js` | Add `normalizeFolderTags` |
| `packages/televault-core/__tests__/folderTags.test.js` | New tests |
| `packages/televault-core/src/index.js` | Export helper |
| `electron/lib/vault/vaultService.js` | `ensureFolderMarker`, update `setFolderTags` |
| `electron/lib/telegram/channelService.js` | `updateMessageContent` handler |
| `televault/lib/services/vault_service.dart` | Mirror `ensureFolderMarker` / `setFolderTags` |
| `televault/lib/utils/folder_tags.dart` | Add `normalizeFolderTags` (Dart mirror) |
| `televault/test/folder_tags_test.dart` | Normalization tests |
| `televault/test/vault_service_test.dart` | Update lazy-marker test |
| `packages/televault-core` or new desktop test | Vault setFolderTags lazy send (if mock harness exists) |

---

### Task 1: Tag normalization in core

**Files:**
- Modify: `packages/televault-core/src/folderTags.js`
- Create: `packages/televault-core/__tests__/folderTags.test.js`
- Modify: `packages/televault-core/src/index.js`

- [ ] **Step 1: Write failing tests**

```javascript
// packages/televault-core/__tests__/folderTags.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFolderTags } = require('../src/folderTags');

describe('normalizeFolderTags', () => {
  it('trims, dedupes, drops empty', () => {
    assert.deepEqual(normalizeFolderTags([' manga ', 'manga', '', 'cbz']), ['manga', 'cbz']);
  });
  it('rejects comma in tag', () => {
    assert.throws(() => normalizeFolderTags(['a,b']));
  });
  it('rejects tag over 50 chars', () => {
    assert.throws(() => normalizeFolderTags(['x'.repeat(51)]));
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd televault-desktop && npm test --workspace=@televault/core -- --test-name-pattern=normalizeFolderTags`  
Expected: FAIL — `normalizeFolderTags is not a function`

- [ ] **Step 3: Implement**

```javascript
// packages/televault-core/src/folderTags.js
const MAX_TAG_LEN = 50;

function normalizeFolderTags(tags) {
  const out = [];
  const seen = new Set();
  for (const raw of tags || []) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!t) continue;
    if (t.includes(',')) throw new Error('Tag cannot contain comma');
    if (t.length > MAX_TAG_LEN) throw new Error('Tag too long');
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
module.exports = { /* existing exports */, normalizeFolderTags, MAX_TAG_LEN };
```

Export from `index.js`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test --workspace=@televault/core`  
Expected: all pass

---

### Task 2: Desktop — lazy marker in `setFolderTags`

**Files:**
- Modify: `televault-desktop/electron/lib/vault/vaultService.js`

- [ ] **Step 1: Add `ensureFolderMarker(folderPath, tags)`**

Logic:
- Find dir entry in `this.db.getAll()` where `path === folderPath`.
- If found → return entry.
- If not found and `tags.length === 0` → return `null`.
- Else send text message:

```javascript
const { dirMarker, encodeCaption, normalizeFolderTags } = require('@televault/core');

async ensureFolderMarker(folderPath, tags) {
  const existing = this.db.getAll().find((e) => isDir(e) && e.path === folderPath);
  if (existing) return existing;
  const normalized = normalizeFolderTags(tags);
  if (normalized.length === 0) return null;
  const marker = dirMarker({ messageId: 0, path: folderPath, tags: normalized });
  await this.client.invoke({
    _: 'sendMessage',
    chat_id: this.chatId,
    input_message_content: {
      _: 'inputMessageText',
      text: { _: 'formattedText', text: encodeCaption(marker) },
    },
  });
  // Marker indexed by ChannelService updateNewMessage / scan — no second edit needed.
  return null;
}
```

- [ ] **Step 2: Update `setFolderTags`**

```javascript
async setFolderTags(folderPath, tags) {
  const normalized = normalizeFolderTags(tags);
  this.db.setFolderTags(folderPath, normalized);
  const marker = this.db.getAll().find((e) => isDir(e) && e.path === folderPath);
  if (marker) {
    const updated = copyEntry(marker, { tags: normalized });
    await this._syncEntryMetadata(updated);
    this.db.upsert(updated);
  } else if (normalized.length > 0) {
    await this.ensureFolderMarker(folderPath, normalized);
  }
  this.onChange();
}
```

- [ ] **Step 3: IPC error propagation**

Ensure `vaultHandlers.js` `setFolderTags` returns `{ ok: false, error }` when normalization throws.

- [ ] **Step 4: Manual verify**

1. Upload folder (no New folder).
2. Edit tags `manga, cbz` on folder.
3. Check Telegram channel for text message: `{"v":1,"dir":"/.../","tags":["manga","cbz"]}`.

---

### Task 3: Desktop — live sync for edited markers

**Files:**
- Modify: `televault-desktop/electron/lib/telegram/channelService.js`

- [ ] **Step 1: Handle `updateMessageContent`**

Mirror Flutter `channel_service.dart`:

```javascript
case 'updateMessageContent': {
  if (u.chat_id !== chatId) return;
  const entry = this.entryFromMessage({
    id: u.message_id,
    content: u.new_content,
  });
  if (entry) {
    this.db.upsert(entry);
    this._emitChange();
  }
  break;
}
```

- [ ] **Step 2: Manual verify**

Edit tag on phone → PC UI updates without full rescan.

---

### Task 4: Flutter — lazy marker + normalization

**Files:**
- Modify: `televault/lib/utils/folder_tags.dart`
- Modify: `televault/lib/services/vault_service.dart`
- Modify: `televault/test/folder_tags_test.dart`
- Modify: `televault/test/vault_service_test.dart`

- [ ] **Step 1: Add `normalizeFolderTags` in Dart** (same rules as core)

- [ ] **Step 2: Add `ensureFolderMarker` in `vault_service.dart`**

Same logic as desktop: if no marker and tags non-empty → `createFolder`-style send with tags in caption via `encodeCaption(VaultEntry.dirMarker(..., tags: normalized))`.

- [ ] **Step 3: Update `setFolderTags`**

```dart
Future<void> setFolderTags(String folderPath, List<String> tags) async {
  assert(folderPath.endsWith('/'));
  final normalized = normalizeFolderTags(tags);
  await db.setFolderTags(folderPath, normalized);
  final marker = (await db.getAll()).where((e) => e.isDir && e.path == folderPath).firstOrNull;
  if (marker != null) {
    final updated = marker.copyWith(tags: normalized);
    await _syncEntryMetadata(updated);
    await db.upsert(updated);
  } else if (normalized.isNotEmpty) {
    await ensureFolderMarker(folderPath, normalized);
  }
}
```

- [ ] **Step 4: Update test `setFolderTags without marker only updates folder_tags table`**

Rename to `setFolderTags without marker sends marker with tags` and expect `sendMessage` with `"tags"` in text and both tags in caption when passing `['series', 'cbz']`.

- [ ] **Step 5: Run Flutter tests**

Run: `cd televault && flutter test test/vault_service_test.dart test/folder_tags_test.dart`  
Expected: PASS

---

### Task 5: End-to-end verification

- [ ] **Step 1: Core tests**

Run: `cd televault-desktop && npm test --workspace=@televault/core`

- [ ] **Step 2: Desktop build**

Run: `npm run build`

- [ ] **Step 3: Cross-device checklist**

| Step | Device A | Device B | Expected |
|------|----------|----------|----------|
| 1 | Upload folder, tag `a, b` | — | Marker on Telegram |
| 2 | — | Open vault / wait sync | Tags visible on folder/files |
| 3 | — | Add tag `c` | Marker updated |
| 4 | Refresh | — | Tag `c` visible |

- [ ] **Step 4: No-backfill check**

Folder tagged before this feature (local only) → no Telegram marker until user re-edits tags on that folder.

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Multiple tags per folder | Task 1 normalization; caption `tags[]` unchanged |
| Lazy marker on tag edit | Task 2, Task 4 |
| No backfill | No migration task; documented in Task 5 |
| Both Flutter + Desktop | Task 2–4 |
| `updateMessageContent` on Desktop | Task 3 |
| renameTag/deleteTag unchanged for markers | No code change; existing journaled edits |
| Validation rules | Task 1, Task 4 |

No placeholders remain.
