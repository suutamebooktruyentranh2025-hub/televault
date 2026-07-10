# TeleVault

Kho file cá nhân trên Telegram. Flutter, chạy macOS/Windows/Linux/iOS/Android.

## Đăng nhập (luồng phát hành)

1. **Google** qua Supabase (PKCE, giống crawler-mobile).
2. Gọi Edge Function **`resolve-televault-access`** — membership **TeleVault** (tách billing crawler).
3. Session lưu **Keychain** (`SecureSessionStore`), Supabase SDK dùng `EmptyLocalStorage` + `autoRefreshToken: false`.
4. **api_id + api_hash** từ https://my.telegram.org/apps (mỗi user một cặp; app nhớ trên thiết bị).
5. **Số điện thoại Telegram** → OTP → 2FA (nếu có).

**Supabase Dashboard → Redirect URLs:** `com.televault.televault://oauth2callback`

Build/run **không cần** nhúng `TG_API_ID`/`TG_API_HASH` vào app.

## Chuẩn bị TDLib

macOS dev (khuyến nghị bản mới, tránh lỗi 406):

```bash
./tool/build_tdlib_macos.sh
```

Các nền khác: `./tool/fetch_tdlib.sh <macos|ios|android|windows|linux>`

## Chạy dev (macOS)

```bash
./tool/run_dev.sh
```

Hoặc:

```bash
flutter run -d macos
```

## Dev shortcut (tùy chọn)

Tạo `dart_defines.json` (gitignored) để **bỏ qua Supabase** và vào thẳng màn SĐT Telegram khi dev:

```json
{
  "TG_API_ID": "your_api_id",
  "TG_API_HASH": "your_api_hash"
}
```

```bash
flutter run -d macos --dart-define-from-file=dart_defines.json
```

## Build release (macOS)

```bash
flutter build macos --release
# TDLib + entitlements được áp tự động qua Xcode build phase (copy_tdlib_build_phase.sh).
# Nếu bundle tay sau build:
./tool/bundle_tdlib.sh build/macos/Build/Products/Release/televault.app/Contents/Frameworks
codesign --force --deep -s - \
  --entitlements macos/Runner/Release.entitlements \
  build/macos/Build/Products/Release/televault.app
```

Các nền khác:

```bash
flutter build ios --release      # hoặc: flutter build ipa --release
flutter build apk --release      # hoặc: flutter build appbundle --release
flutter build windows --release
flutter build linux --release
```

## Test

```bash
flutter test
```

Smoke TDLib (cần `--dart-define-from-file=dart_defines.json` hoặc `--dart-define=TG_API_ID=...`):

```bash
dart run tool/macos_smoke.dart --dart-define-from-file=dart_defines.json
```
