#!/usr/bin/env bash
# Chạy TeleVault trên macOS (debug).
# dart_defines.json (tùy chọn): bỏ qua Supabase + màn nhập API khi dev local.
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
  if brew list tdlib &>/dev/null; then
    echo "Cảnh báo: dùng Homebrew TDLib 1.8.0 — đăng nhập có thể lỗi 406 UPDATE_APP_TO_LOGIN."
    echo "Build TDLib mới: ./tool/build_tdlib_macos.sh"
  else
    echo "Thiếu TDLib. Chạy: ./tool/build_tdlib_macos.sh"
    exit 1
  fi
fi

flutter build macos --debug "${DART_DEFINES[@]}"
flutter run -d macos "${DART_DEFINES[@]}" "$@"
