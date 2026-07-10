# Persistent GDrive Sync Queue Design

## Goal
Tạo cơ chế lưu trữ danh sách file đã quét vào Database (SQLite) thay vì RAM, giúp ứng dụng có thể tiếp tục tiến trình đồng bộ sau khi khởi động lại mà không cần quét lại từ đầu, đồng thời cập nhật linh hoạt danh sách này mỗi khi bấm "Quét ngay" (thêm mới, cập nhật).

## Architecture & Database

Sử dụng SQLite (thông qua `better-sqlite3` trong `indexDb.js`):
- Thêm bảng mới: `gdrive_sync_queue`
  - `drive_file_id` (TEXT PRIMARY KEY)
  - `file_name` (TEXT)
  - `drive_path` (TEXT)
  - `vault_path` (TEXT)
  - `size` (INTEGER)
  - `modified_time` (TEXT)
  - `added_at` (TEXT)

## Data Flow & Components

### 1. Quá trình quét (Scanning - Producer)
- Khi gọi `scanNow()` (Quét thủ công) hoặc `_runPollSync()` (Quét tự động định kỳ), ứng dụng sẽ truy xuất Google Drive API.
- Các file cần đồng bộ (chưa có trong `gdrive_manifest`, hoặc có `modified_time` mới hơn) sẽ được thêm vào bảng `gdrive_sync_queue` qua câu lệnh `INSERT OR REPLACE`.
- Nếu file đã tồn tại trong hàng đợi nhưng bị thay đổi `modified_time` ở lần quét tiếp theo, nó sẽ được cập nhật.
- Tiến trình quét kết thúc độc lập, không cần chờ đồng bộ xong.

### 2. Quá trình đồng bộ (Sync Worker - Consumer)
- Hàm `syncWorker` chạy nền sẽ liên tục query lấy ra 1 file (ví dụ oldest `added_at` hoặc tùy ý) từ `gdrive_sync_queue`.
- Xử lý tải về (Download) và đẩy lên Vault (Upload).
- **Thành công:** Lưu file vào `gdrive_manifest`, sau đó `DELETE` khỏi `gdrive_sync_queue`.
- **Thất bại:** Lưu thông tin lỗi vào `gdrive_sync_errors`, sau đó `DELETE` khỏi `gdrive_sync_queue`. (Có thể cho người dùng ấn Retry để đưa lại vào queue sau).

### 3. Phục hồi khi khởi động (Resume on Restart)
- Trong `gdriveSyncService`, khi khởi tạo hoặc sau khi xác thực (Connected), kiểm tra xem `gdrive_sync_queue` có dòng dữ liệu nào không.
- Nếu có dữ liệu trong Queue: Kích hoạt ngay `syncWorker` để chạy nền, tiêu thụ nốt số file còn tồn đọng mà chưa cần thực hiện lệnh `scanNow()`.

## Error Handling
- Nếu lỗi khi thao tác DB, ứng dụng ghi log console.
- File bị lỗi tải/tải lên sẽ rời khỏi hàng đợi và đi vào bảng `gdrive_sync_errors` để không block hàng đợi (tránh infinite loop lỗi).

## Testing Strategy
- **Manual Testing:**
  1. Bấm Quét ngay -> tắt app (Cmd+Q) ngay giữa lúc đang đồng bộ.
  2. Mở lại app -> Kiểm tra xem nó có tự động resume đồng bộ số lượng pending files không.
  3. Bấm Quét ngay lại lần nữa -> Đảm bảo queue không bị duplicate mà chỉ nhận thêm file mới (nếu có).
