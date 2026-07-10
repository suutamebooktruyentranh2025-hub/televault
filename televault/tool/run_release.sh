#!/usr/bin/env bash
# Chạy TeleVault trên macOS (release).
# dart_defines.json (tùy chọn): dev shortcut, không dùng khi build phát hành.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

DART_DEFINES=()
if [[ -f dart_defines.json ]]; then
  DART_DEFINES=(--dart-define-from-file=dart_defines.json)
  echo "Dev shortcut: dart_defines.json — bỏ qua Supabase, vào thẳng đăng nhập Telegram."
else
  echo "Không có dart_defines.json — luồng đầy đủ: Google → nhập API → SĐT Telegram."
fi

export TELELIB_TDLIB="${TELELIB_TDLIB:-$ROOT/.tdlib/install}"
if [[ ! -f "$TELELIB_TDLIB/lib/libtdjson.dylib" ]] && ! compgen -G "$TELELIB_TDLIB/lib/libtdjson"*.dylib >/dev/null; then
  echo "Cảnh báo: chưa build TDLib mới — có thể lỗi 406 khi đăng nhập."
  echo "Chạy: ./tool/build_tdlib_macos.sh"
fi

flutter build macos --release "${DART_DEFINES[@]}"
flutter run -d macos --release "${DART_DEFINES[@]}" "$@"
