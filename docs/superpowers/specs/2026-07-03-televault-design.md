# TeleVault — Thiết kế ứng dụng quản lý file trên Telegram

**Ngày:** 2026-07-03
**Trạng thái:** Đã duyệt (brainstorming hoàn tất)

## 1. Mục đích

Ứng dụng đa nền tảng (1 codebase Flutter chạy macOS/Windows/Linux/iOS/Android) dùng Telegram làm cloud storage cá nhân:

- Upload file từ máy lên Telegram, duyệt kho file, tải về khi cần (kiểu Google Drive nhưng lưu trên Telegram).
- Đồng bộ giữa các thiết bị: mọi thiết bị đăng nhập cùng tài khoản thấy cùng một kho.
- Hỗ trợ file lớn 200–300MB (giới hạn kỹ thuật: 2GB/file, 4GB với Telegram Premium).

## 2. Các quyết định đã chốt

| Quyết định | Lựa chọn |
|---|---|
| Nền tảng | 1 codebase Flutter cho cả 6 nền tảng |
| Kết nối Telegram | MTProto qua **TDLib** (FFI wrapper tự viết quanh `td_json_client` — package có sẵn như `handy_tdlib` chỉ hỗ trợ Android; binary TDLib prebuilt bundle theo từng nền tảng), đăng nhập bằng tài khoản Telegram cá nhân |
| Phạm vi quản lý file | Mô hình "kho" (vault): cấu trúc thư mục ảo do app quản lý, thêm file qua picker/share/kéo-thả |
| Nơi lưu metadata | 100% trên Telegram: mỗi file = 1 message trong kênh private, caption chứa JSON metadata; app quét kênh dựng index |
| Chế độ đồng bộ | Metadata luôn đồng bộ, file tải on-demand |
| Tính năng bắt buộc v1 | Tìm kiếm theo tên, preview (ảnh/PDF/video), upload hàng loạt có hàng đợi + resume, tag đầy đủ (gắn/gỡ tag, lọc theo tag, quản lý danh sách tag) |

### Các hướng đã loại

- **MTProto thuần Dart:** thư viện chưa trưởng thành, phải tự viết upload chunk/retry/session — rủi ro cao.
- **Bot API + cắt file:** download giới hạn 20MB/phần → file lớn thành ~100 mảnh, hacky và mong manh.

## 3. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────┐
│              Flutter App (1 codebase)        │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │   UI    │→│ Services │→│ TDLib (FFI)  │──┼──→ Telegram
│  │ (views) │ │  layer   │ │ native binary│  │
│  └─────────┘ └────┬─────┘ └──────────────┘  │
│                   ↓                          │
│            ┌────────────┐                    │
│            │ Local cache│  SQLite: index     │
│            │            │  + file cache      │
│            └────────────┘                    │
└─────────────────────────────────────────────┘
```

### Các khối chính

1. **TelegramService** — wrap TDLib: đăng nhập (SĐT + OTP + 2FA), gửi/nhận/sửa/xoá message, upload/download file, lắng nghe update realtime.
2. **VaultService** — dựng cây thư mục ảo từ message trong kênh; xử lý tạo/xoá/đổi tên/di chuyển file và thư mục.
3. **TransferService** — hàng đợi upload/download: tuần tự hoá, progress, retry, resume.
4. **IndexDB (SQLite)** — bản chiếu local của kho (mở app thấy ngay cây thư mục, tìm kiếm offline) + journal thao tác hàng loạt dở dang.
5. **UI** — Provider, responsive: mobile là list + bottom nav; desktop là 2 cột (cây thư mục | nội dung).

### Cách lưu trên Telegram

- App tạo (hoặc dùng lại) **1 kênh private** trong tài khoản người dùng, nhận diện bằng chuỗi đánh dấu `#televault-v1` trong mô tả kênh.
- Mỗi file = 1 message: file đính kèm + caption JSON metadata.
- Thư mục chỉ là prefix đường dẫn trong metadata (như S3). Thư mục rỗng = 1 message text marker.
- Đổi tên/di chuyển = sửa caption (không upload lại). Xoá = xoá message.
- Thiết bị mới → quét lịch sử kênh 1 lần dựng index → sau đó chỉ nghe update realtime.

## 4. Đăng nhập & thiết lập lần đầu

1. Nhập số điện thoại (mặc định +84) → OTP (qua app Telegram khác hoặc SMS) → mật khẩu 2FA nếu có.
2. TDLib lưu session vào thư mục app, mã hoá bằng key ngẫu nhiên cất trong `flutter_secure_storage` (Keychain/Keystore/tương đương). Các lần sau vào thẳng.
3. Tìm kênh kho theo marker `#televault-v1`:
   - Chưa có → tự tạo kênh private mới, không hỏi.
   - Đã có → quét lịch sử dựng index, hiện progress "Đang đồng bộ kho... 120/450 file".
4. **`api_id`/`api_hash`**: đăng ký 1 lần tại my.telegram.org, nhúng vào app khi build (định danh app, không phải per-user).

**Lỗi:** sai OTP/mật khẩu → báo tại chỗ, nhập lại. Rate-limit khi quét kênh lớn → TDLib tự chờ, app hiện "đang đồng bộ". Đăng xuất → xoá session + cache local, kênh Telegram giữ nguyên.

## 5. Quản lý file & cây thư mục ảo

### Mô hình dữ liệu

Caption JSON mỗi message file:

```json
{
  "v": 1,
  "path": "/Truyện/One Piece/tập-01.pdf",
  "size": 245891072,
  "sha256": "a3f8...",
  "mtime": "2026-07-03T10:15:00Z",
  "tags": ["manga", "đã đọc"]
}
```

Marker thư mục rỗng: `{"v":1,"dir":"/path/"}`.

Index SQLite: bảng `files(message_id, path, size, sha256, mtime, local_cache_path)` + bảng `file_tags(message_id, tag)` (chuẩn hoá để lọc theo tag nhanh). Mọi thao tác đọc (duyệt, tìm kiếm, lọc tag) chạy trên SQLite — tức thì, offline được.

### Thao tác

| Thao tác | Thực hiện trên Telegram |
|---|---|
| Thêm file | Upload message mới kèm caption |
| Xoá file | Xoá message |
| Đổi tên / di chuyển file | Sửa caption |
| Gắn / gỡ tag | Sửa caption (cập nhật mảng `tags`) |
| Tạo thư mục rỗng | Message text marker |
| Đổi tên / di chuyển thư mục | Sửa caption hàng loạt mọi file có prefix |
| Xoá thư mục | Xoá hàng loạt message con |

Thao tác hàng loạt chạy qua hàng đợi có progress; journal trong SQLite để tiếp tục nếu app tắt giữa chừng.

### Đồng bộ & xung đột

- Nguồn chân lý duy nhất: kênh Telegram. App nghe update realtime → cập nhật SQLite → UI vẽ lại qua Provider.
- Mở app sau khi offline: TDLib tự đồng bộ update đã lỡ.
- Xung đột (2 thiết bị cùng ghi 1 đường dẫn): message mới hơn thắng, bản cũ tự đổi tên `tên (conflict YYYY-MM-DD).ext` — không mất dữ liệu, không hỏi người dùng. Thiết bị nào phát hiện trùng đường dẫn khi nhận update sẽ sửa caption của message cũ hơn; thao tác này idempotent (dựa trên `message_id` nhỏ hơn) nên nhiều thiết bị cùng xử lý cho cùng kết quả.

### Trùng lặp & tìm kiếm

- Trước upload tính SHA-256; nếu hash trùng → hỏi "File đã có tại /X/Y, vẫn upload bản sao?".
- Tìm kiếm: `LIKE` trên cột `path` trong SQLite (bao phủ cả lọc theo tên thư mục vì path chứa tên folder).

### Tag (v1)

- Mỗi file có 0..n tag tự do (chuỗi ngắn, ví dụ `manga`, `đã đọc`), lưu trong mảng `tags` của caption — nguồn chân lý vẫn 100% trên Telegram, đồng bộ giữa thiết bị như mọi metadata khác.
- **Gắn/gỡ tag**: từ menu ngữ cảnh của file (chọn nhiều file để gắn hàng loạt qua hàng đợi, như đổi tên thư mục). Nhập tag có autocomplete từ danh sách tag hiện có.
- **Lọc theo tag**: màn hình tìm kiếm có bộ lọc tag (chọn 1 hoặc nhiều tag — nhiều tag = giao AND), kết hợp được với từ khoá tên file.
- **Quản lý danh sách tag**: màn hình liệt kê mọi tag + số file; đổi tên tag = sửa caption hàng loạt các file mang tag đó; xoá tag = gỡ khỏi mọi file (đều qua hàng đợi + journal như thao tác thư mục).
- Danh sách tag không có message riêng — nó là tập hợp suy ra từ các file (tag không còn file nào thì tự biến mất).
- Giới hạn: tag tối đa 50 ký tự, không chứa dấu phẩy; tổng caption vẫn phải dưới ~1KB (path + tags — thực tế thoải mái).

### Giới hạn chấp nhận ở v1

- Không có thùng rác (xoá thật, có confirm dialog).
- Không có phiên bản file (upload đè = xoá message cũ + tạo mới).
- Caption Telegram ~1KB → đường dẫn tối đa ~800 ký tự.

## 6. Hàng đợi truyền tải & preview

### Đưa file vào kho

- Mobile: `file_picker` + nhận từ share sheet (`receive_sharing_intent`).
- Desktop: file picker + kéo-thả file/thư mục vào cửa sổ.
- Chọn thư mục → giữ nguyên cấu trúc con.

### Hàng đợi (TransferService)

- Màn hình "Truyền tải" chung, 2 tab upload/download.
- 2 transfer song song (mặc định, chỉnh trong Settings).
- Mỗi mục: tên, %, tốc độ, tạm dừng/huỷ (TDLib có progress callback sẵn).
- Resume: TDLib tự resume theo chunk khi đứt mạng; app tắt hẳn → hàng đợi khôi phục từ SQLite, upload tiếp từ phần đã truyền.
- Thất bại sau 3 retry (backoff) → đánh dấu lỗi, thử lại thủ công.
- Mobile: `wakelock_plus` giữ máy thức khi truyền. Không background transfer thực sự ở v1 (để v2).

### Download & cache

- Bấm file chưa có local → tải vào cache app → mở preview.
- File đã cache: mở tức thì, badge "đã tải về". Cache giới hạn 2GB mặc định (chỉnh được), đầy → xoá LRU. File đang preview không bị xoá.
- "Lưu về máy": mobile share sheet / desktop Save As.

### Preview

- Ảnh (jpg/png/webp/gif): viewer zoom, vuốt chuyển ảnh cùng thư mục.
- PDF: `pdfx`.
- Video/audio: `media_kit` (6 nền tảng). V1 tải xong mới phát; streaming để v2.
- Loại khác: icon + "Mở bằng app khác" (`open_filex`).

## 7. Cấu trúc project & stack

Project mới, tên `televault`:

```
televault/
├── lib/
│   ├── main.dart
│   ├── models/          # VaultFile, VaultFolder, TransferTask
│   ├── services/
│   │   ├── telegram/    # TelegramService: wrap TDLib, auth, updates
│   │   ├── vault_service.dart      # cây thư mục ảo, thao tác file
│   │   ├── transfer_service.dart   # hàng đợi upload/download
│   │   └── index_db.dart           # SQLite index + journal
│   ├── providers/       # state cho UI (Provider)
│   ├── screens/         # auth, browser, transfers, settings
│   └── widgets/
├── test/
└── [android|ios|macos|windows|linux]/
```

**Stack:** Flutter + Provider, TDLib qua `dart:ffi` (wrapper tự viết quanh `td_json_client`, binary prebuilt per-platform — xem ghi chú §2), `sqflite` + FFI, `file_picker`, `receive_sharing_intent`, `pdfx`, `media_kit`, `flutter_secure_storage`, `wakelock_plus`, `open_filex`.

## 8. Testing

- **Unit test** (trọng tâm, mock TelegramService): dựng cây từ danh sách caption, phân giải xung đột, journal thao tác hàng loạt, LRU cache eviction.
- **Widget test**: màn hình duyệt file, hàng đợi truyền tải.
- **TDLib thật**: test thủ công với tài khoản Telegram test (Telegram có test DC riêng cho dev).

## 9. Lộ trình

1. **M1 — Nền móng:** project + TDLib chạy trên macOS & Android, đăng nhập, tạo/tìm kênh kho.
2. **M2 — Kho hoạt động:** upload/download đơn lẻ, index SQLite, duyệt cây, realtime update giữa 2 thiết bị.
3. **M3 — Đầy đủ v1:** hàng đợi + resume, thao tác hàng loạt, đổi tên/di chuyển/xoá, tìm kiếm, tag (gắn/gỡ/lọc/quản lý), xung đột.
4. **M4 — Hoàn thiện:** preview, cache LRU, share/kéo-thả, build 6 nền tảng, polish UI.

## 10. Ngoài phạm vi v1 (để v2+)

- Mã hoá file trước khi upload.
- Background transfer trên mobile.
- Streaming video từng phần.
- Thùng rác, phiên bản file.
- Selective sync ("giữ offline" thư mục).
