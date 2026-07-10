# Google Drive → Telegram Sync

## Mục tiêu

Thêm tính năng đồng bộ một chiều Google Drive → Telegram vault. User kết nối tài khoản Google qua OAuth2, chọn các thư mục/file trên Drive cần theo dõi, app tự động phát hiện file mới/thay đổi và upload lên Telegram vault.

## Quyết định thiết kế

| Quyết định | Lựa chọn |
|---|---|
| Kết nối | Google Drive REST API v3 + OAuth2 (không cần cài Google Drive desktop) |
| Hướng sync | Một chiều: Google Drive → Telegram |
| Phạm vi | User chọn nhiều thư mục/file tùy ý trên Drive |
| Cấu trúc vault | Giữ nguyên cấu trúc thư mục: `/GDrive/<tên folder Drive>/...` |
| Phát hiện thay đổi | Polling định kỳ (mặc định 5 phút) + manual scan |
| Dedup | Bỏ qua file trùng (SHA256 + kích thước) — chỉ upload file mới/thay đổi |
| File temp | Stream download vào `temp/gdrive-sync/`, xóa sau khi upload thành công |

## Kiến trúc

### Module mới: `electron/lib/gdrive/`

```
electron/lib/gdrive/
├── gdriveAuth.js          ← OAuth2 flow, token management, refresh
├── gdriveApi.js           ← Google Drive API wrapper (list, download, changes)
├── gdriveSyncService.js   ← Orchestrator: polling, manual scan, execute sync
├── gdriveFilePicker.js    ← Logic cho UI file/folder picker từ Drive
└── gdriveSyncState.js     ← SQLite tables: subscriptions, manifest, tokens
```

### Luồng dữ liệu

```
Google Drive API → gdriveSyncService
    ├── Poll changes (mỗi 5 phút)
    │   └── changes.list API + startPageToken
    ├── Manual scan (user bấm nút)
    │   └── Full scan các subscribed folders
    └── Detect new/changed files
            ↓
        Download file → temp directory
            ↓
        vault.enqueueUpload(tempPath, /GDrive/<folder>/...)
            ↓
        Cập nhật manifest (SHA256 + Drive fileId)
            ↓
        Xóa file temp
```

## OAuth2 Authentication

### Flow

1. User bấm "Kết nối Google Drive" trong Settings
2. App mở system browser (`shell.openExternal`) đến Google OAuth consent URL
3. Redirect về `http://localhost:<random-port>` — Electron main process chạy HTTP server tạm để bắt auth code
4. Đổi auth code lấy `access_token` + `refresh_token`
5. Lưu tokens vào SQLite table `gdrive_tokens`
6. Tự động refresh token khi hết hạn (dùng `refresh_token`)

### OAuth Scopes

- `https://www.googleapis.com/auth/drive.readonly` — chỉ đọc (đủ cho one-way sync)

### Google Cloud Setup

- User cần tạo Google Cloud project + OAuth Client ID (Desktop type)
- Nhập Client ID và Client Secret vào Settings (giống flow Telegram API ID hiện tại)

## Data Model — SQLite

### Bảng `gdrive_tokens`

```sql
CREATE TABLE IF NOT EXISTS gdrive_tokens (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: 'access_token', 'refresh_token', 'expiry', 'client_id', 'client_secret'
```

### Bảng `gdrive_subscriptions`

```sql
CREATE TABLE IF NOT EXISTS gdrive_subscriptions (
  drive_id TEXT PRIMARY KEY,
  drive_path TEXT NOT NULL,
  vault_path TEXT NOT NULL,
  is_folder INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
```

### Bảng `gdrive_manifest`

```sql
CREATE TABLE IF NOT EXISTS gdrive_manifest (
  drive_file_id TEXT PRIMARY KEY,
  drive_path TEXT NOT NULL,
  vault_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  drive_modified_time TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
```

### Bảng `gdrive_state`

```sql
CREATE TABLE IF NOT EXISTS gdrive_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys: 'changes_page_token', 'last_poll_time'
```

## Sync Logic

### Thuật toán Poll Changes (tự động)

1. Gọi `changes.list(pageToken)` → danh sách file thay đổi kể từ lần poll cuối
2. Lọc: chỉ giữ file thuộc subscribed folders (dựa vào `parents` field)
3. So sánh `modifiedTime` + `md5Checksum` từ Drive API với `gdrive_manifest`
4. File mới hoặc thay đổi → thêm vào sync queue
5. Cập nhật `changes_page_token` trong `gdrive_state`

### Thuật toán Manual Scan

1. Với mỗi subscription enabled:
   - Gọi `files.list` đệ quy (query: `'<folderId>' in parents`)
   - So sánh với `gdrive_manifest`
   - File chưa có trong manifest hoặc `modifiedTime` khác → thêm vào sync queue

### Sync Queue Execution

1. Download file từ Drive → `temp/gdrive-sync/<driveFileId>_<filename>`
   - Stream download bằng `googleapis` SDK hoặc raw REST + `node:https`
   - Ghi vào temp file, không buffer toàn bộ trong memory
2. Tính SHA256 sau download
3. Kiểm tra dedup:
   - Tìm entry trên vault có cùng vault_path → so SHA256 + size
   - Nếu khớp → bỏ qua, xóa temp, cập nhật manifest
4. Upload lên Telegram: `vault.enqueueUpload(tempPath, vaultPath)`
5. Đợi upload hoàn tất → cập nhật `gdrive_manifest`
6. Xóa file temp

### Xử lý lỗi

- Download thất bại → retry 3 lần với exponential backoff
- Upload thất bại → giữ trong sync queue, retry lần poll tiếp theo
- Token hết hạn → tự động refresh, nếu refresh thất bại → status = error, yêu cầu re-auth
- Network error → pause polling, resume khi có mạng lại

## Tích hợp vào hệ thống hiện tại

### `electron/lib/ipc/sessionHandlers.js`

Thêm IPC handlers mới:

- `gdrive:getAuth` — kiểm tra trạng thái kết nối Google
- `gdrive:connect` — bắt đầu OAuth flow (cần clientId, clientSecret)
- `gdrive:disconnect` — xóa tokens, subscriptions
- `gdrive:listFolder` — liệt kê nội dung folder trên Drive (cho file picker)
- `gdrive:addSubscription` — đăng ký folder/file sync
- `gdrive:removeSubscription` — hủy đăng ký
- `gdrive:getSubscriptions` — lấy danh sách subscriptions
- `gdrive:getStatus` — trạng thái sync (idle/syncing/error)
- `gdrive:scanNow` — trigger manual scan
- `gdrive:getConfig` — lấy cấu hình (poll interval)
- `gdrive:setConfig` — cập nhật cấu hình

### `electron/preload.js`

Expose `window.televault.gdrive` API cho renderer.

### `TelegramCoordinator`

Sau khi vault sẵn sàng → khởi tạo `GDriveSyncService` nếu đã có tokens.

## UI/UX

### Settings Screen — Section "Google Drive"

1. **Kết nối Google**: 
   - Chưa kết nối: Form nhập Client ID + Client Secret + nút "Kết nối"
   - Đã kết nối: Hiển thị email Google + nút "Ngắt kết nối"

2. **Thư mục đăng ký sync**:
   - Danh sách folders/files đã chọn (tên + path trên Drive)
   - Toggle bật/tắt cho từng subscription
   - Nút "Thêm từ Drive" → mở modal file picker

3. **Cấu hình**:
   - Polling interval: Dropdown — 1p / 5p (mặc định) / 15p / 30p / Tắt auto
   - Nút "Quét ngay" → manual scan

### Drive File Picker (Modal)

- Tree view hiển thị cấu trúc thư mục Google Drive
- Điều hướng folder bằng click
- Checkbox chọn folder/file cần sync
- Hiển thị: tên, kích thước, ngày sửa đổi
- Nút "Xác nhận" → thêm vào subscriptions

### Status Indicators (Status Bar)

- ☁️ Đã kết nối, idle (Google Drive icon)
- 🔄 Đang sync (số file còn lại)
- ❌ Lỗi (tooltip hiển thị chi tiết)
- ⚪ Chưa kết nối

Click vào icon → popover hiển thị:
- Sync lần cuối: thời gian
- Số file đang chờ sync
- Danh sách subscriptions

## Dependencies mới

- `googleapis` — Google APIs Node.js client (hoặc raw REST calls nếu muốn giữ bundle nhỏ)

## Phạm vi KHÔNG bao gồm (YAGNI)

- Không sync ngược Telegram → Google Drive
- Không sync Google Docs/Sheets/Slides (chỉ file thường — binary files)
- Không sync Shared Drives (chỉ My Drive)
- Không sync file trong Trash trên Drive
- Không xóa file trên Telegram khi file bị xóa trên Drive
- Không hỗ trợ Google Workspace domain restrictions
