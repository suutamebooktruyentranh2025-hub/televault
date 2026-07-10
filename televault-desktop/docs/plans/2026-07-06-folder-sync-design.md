# Folder Sync — Đồng bộ thư mục Local ↔ Telegram Vault

## Mục tiêu

Thêm tính năng cho phép user chọn 1 thư mục local và tự động đồng bộ nội dung với Telegram vault. Hỗ trợ 2 chế độ:

- **Upload only** (mặc định): local → Telegram
- **Two-way**: local ↔ Telegram

## Quyết định thiết kế

| Quyết định | Lựa chọn |
|---|---|
| Công nghệ | Node.js thuần trong Electron main process — `chokidar` + TDLib qua `VaultService` có sẵn |
| Hướng sync | User chọn: Upload-only (mặc định) hoặc Two-way |
| Xung đột | Giữ cả hai bản: `filename (conflict YYYY-MM-DD).ext` |
| Lan truyền xóa | Đồng bộ 2 chiều (xóa local → xóa trên Telegram, và ngược lại) |
| Thời điểm | Realtime watcher + batch gom ~30 giây trước khi sync |
| Phạm vi | 1 thư mục sync duy nhất |
| Initial sync | Dialog cho user chọn: Merge / Local làm gốc / Telegram làm gốc |

## Kiến trúc

### Module mới: `electron/lib/sync/`

```
electron/lib/sync/
├── syncService.js        ← Orchestrator chính, quản lý vòng đời sync
├── localWatcher.js       ← Chokidar watcher, phát hiện thay đổi local (add/change/unlink)
├── remoteWatcher.js      ← Lắng nghe updateNewMessage/updateDeleteMessages từ ChannelService
├── syncEngine.js         ← So sánh 2 phía, tính diff, quyết định action
├── conflictResolver.js   ← Xử lý conflict: rename file với hậu tố (conflict)
└── syncState.js          ← Quản lý trạng thái sync, manifest trong SQLite
```

### Luồng dữ liệu

```
┌─────────────┐         ┌──────────────┐
│ localWatcher │         │ remoteWatcher│
│  (chokidar)  │         │  (TDLib)     │
└──────┬──────┘         └──────┬───────┘
       │ add/change/unlink      │ newMessage/deleteMessages
       ▼                        ▼
┌──────────────────────────────────────┐
│          Batch Buffer (30s)          │
└──────────────────┬───────────────────┘
                   ▼
┌──────────────────────────────────────┐
│            syncEngine.js             │
│  - So sánh local vs manifest vs DB  │
│  - Tạo action list:                 │
│    upload / download / delete /      │
│    conflict                          │
└──────────────────┬───────────────────┘
                   ▼
┌──────────────────────────────────────┐
│          syncService.js              │
│  - Thực thi actions qua VaultService │
│  - Upload: vault.enqueueUpload()    │
│  - Download: vault.enqueueDownload()│
│  - Delete: vault.deleteEntries()    │
│  - Conflict: tạo bản copy (conflict)│
│  - Cập nhật manifest sau mỗi sync   │
└──────────────────────────────────────┘
```

### Cơ chế phát hiện thay đổi

**Local (chokidar):**
- Watch thư mục sync folder đệ quy
- Events: `add`, `change`, `unlink`, `addDir`, `unlinkDir`
- Dùng `awaitWriteFinish` để tránh trigger khi file đang ghi dở
- Gom events vào batch, đợi 30 giây stable trước khi xử lý

**Remote (TDLib):**
- `ChannelService.listenUpdates()` đã lắng nghe `updateNewMessage`, `updateDeleteMessages`, `updateMessageContent`
- `remoteWatcher` hook vào `ChannelService.onChange()` để phát hiện thay đổi từ Telegram
- Lọc các thay đổi thuộc thư mục sync (path bắt đầu bằng `/Sync/`)

### Sync Engine — Logic so sánh

Sync manifest lưu snapshot của mỗi file tại thời điểm sync thành công cuối cùng:

```
sync_manifest table:
  rel_path TEXT PRIMARY KEY   -- đường dẫn tương đối trong sync folder
  sha256   TEXT NOT NULL      -- SHA256 tại thời điểm sync cuối
  mtime    TEXT NOT NULL      -- mtime tại thời điểm sync cuối
  side     TEXT NOT NULL      -- 'local' | 'remote' | 'both'
```

**Thuật toán diff (three-way merge):**

1. Quét local folder → tính SHA256 mỗi file → tạo `localSnapshot`
2. Quét DB entries dưới `/Sync/` → tạo `remoteSnapshot`
3. So sánh với `manifest` (lần sync cuối):

| Local | Remote | Manifest | Action |
|---|---|---|---|
| Mới | Không có | Không có | Upload |
| Không có | Mới | Không có | Download (nếu two-way) |
| Thay đổi | Không đổi | Có | Upload |
| Không đổi | Thay đổi | Có | Download (nếu two-way) |
| Thay đổi | Thay đổi | Có | **Conflict** → giữ cả 2 bản |
| Không có | Có | Có | Xóa remote (file bị xóa ở local) |
| Có | Không có | Có | Xóa local (nếu two-way, file bị xóa ở remote) |

**Upload-only mode:** bỏ qua các action Download và "Xóa local".

### Xử lý Conflict

Khi cả local và remote đều thay đổi cùng 1 file:

1. Giữ bản remote trên Telegram (không sửa)
2. Rename bản local thành `filename (conflict 2026-07-06).ext`
3. Upload bản conflict lên Telegram
4. Cập nhật manifest cho cả 2 file
5. Hiển thị thông báo cho user trong UI

### Lan truyền xóa

- Xóa local → xóa entry tương ứng trên Telegram qua `vault.deleteEntries()`
- Xóa remote (two-way) → xóa file local tương ứng qua `fs.unlinkSync()`
- Phân biệt "file bị xóa" vs "file chưa sync": dựa vào manifest. Nếu file có trong manifest mà biến mất → bị xóa. Nếu không có trong manifest → chưa sync (file mới).

### Trạng thái sync trong SQLite

Bảng mới trong `indexDb.js`:

```sql
CREATE TABLE IF NOT EXISTS sync_config(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: sync_folder, sync_mode, sync_enabled, sync_vault_folder

CREATE TABLE IF NOT EXISTS sync_manifest(
  rel_path TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  mtime TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'both'
);
```

### Tích hợp vào hệ thống hiện tại

**`TelegramCoordinator`:**
- Sau `_runSync()` thành công → khởi tạo `SyncService` nếu sync đã được cấu hình
- Truyền `client`, `db`, `channel`, `vault` cho `SyncService`

**`sessionHandlers.js`:**
- Thêm IPC handlers mới:
  - `sync:getConfig` — lấy cấu hình sync hiện tại
  - `sync:setConfig` — lưu cấu hình (folder, mode, enabled)
  - `sync:pickFolder` — mở dialog chọn thư mục
  - `sync:getStatus` — lấy trạng thái sync (synced/syncing/conflict/paused)
  - `sync:startInitialSync` — bắt đầu initial sync với strategy được chọn

**`preload.js`:**
- Expose `window.televault.sync` API cho renderer

## UI/UX

### Settings — Phần Sync mới

Thêm section "Đồng bộ thư mục" vào `SettingsScreen.jsx`:

- **Thư mục đồng bộ**: hiển thị path + nút chọn folder (giống saveAsDir hiện có)
- **Chế độ**: dropdown — "Chỉ upload" (mặc định) / "Đồng bộ 2 chiều"
- **Bật/Tắt**: toggle on/off
- **Thư mục đích trên Vault**: mặc định `/Sync/`, có thể đổi

### Dialog Initial Sync

Hiện khi user bật sync lần đầu hoặc đổi folder:

- Hiển thị số file local + số file trên Telegram vault
- 3 lựa chọn:
  - "Gộp cả hai phía" (merge)
  - "Lấy thư mục local làm gốc" (upload all, ignore remote)
  - "Lấy Telegram làm gốc" (download all, ignore local)

### Status Bar — Trạng thái sync

Icon ở thanh trạng thái chính:

- ☁️ `synced` — đã đồng bộ xong
- 🔄 `syncing` — đang đồng bộ (+ số file còn lại)
- ⚠️ `conflict` — có file conflict cần xử lý
- ⏸ `paused` — sync bị tắt/tạm dừng

Click vào icon → popover hiển thị chi tiết:
- Sync lần cuối: thời gian
- Số file đang chờ upload/download
- Danh sách file conflict (nếu có)

## Dependencies mới

- `chokidar` — file system watcher, cross-platform (macOS + Windows)

## Phạm vi KHÔNG bao gồm (YAGNI)

- Không sync subfolder chọn lọc (chỉ 1 folder toàn bộ)
- Không sync incremental/delta (upload toàn bộ file, không patch)
- Không hỗ trợ nhiều sync folder
- Không sync metadata/tags (chỉ sync file content)
- Không encryption riêng (dùng encryption có sẵn của Telegram)
