#!/usr/bin/env bash
# Build TDLib mới nhất từ GitHub (cần cho đăng nhập Telegram — Homebrew 1.8.0 quá cũ → 406 UPDATE_APP_TO_LOGIN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# TDLib CMake/linker lỗi nếu đường dẫn có khoảng trắng — build trong /tmp.
SRC="/tmp/televault-tdlib-src"
BUILD="/tmp/televault-tdlib-build"
INSTALL_TMP="/tmp/televault-tdlib-install"
INSTALL="$ROOT/.tdlib/install"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

echo "==> Cài dependency build (macOS)"
for pkg in cmake gperf openssl@3; do
  brew list "$pkg" &>/dev/null || brew install "$pkg"
done

if [[ ! -d "$SRC/.git" ]]; then
  echo "==> Clone tdlib/td (master)"
  git clone --depth 1 https://github.com/tdlib/td.git "$SRC"
else
  echo "==> Cập nhật tdlib/td"
  git -C "$SRC" pull --ff-only
fi

OPENSSL_ROOT="$(brew --prefix openssl@3)"
rm -rf "$BUILD" "$INSTALL_TMP"
mkdir -p "$BUILD" "$INSTALL_TMP"

echo "==> CMake + build (có thể mất 5–15 phút)"
cmake -S "$SRC" -B "$BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$INSTALL_TMP" \
  -DTD_ENABLE_LTO=ON \
  -DOPENSSL_ROOT_DIR="$OPENSSL_ROOT"

cmake --build "$BUILD" --target install -j"$JOBS"

TD_LIB="$(find "$INSTALL_TMP/lib" -name 'libtdjson*.dylib' | head -1)"
if [[ -z "$TD_LIB" ]]; then
  echo "error: build xong nhưng không thấy libtdjson.dylib" >&2
  exit 1
fi

rm -rf "$INSTALL"
mkdir -p "$INSTALL"
cp -R "$INSTALL_TMP/." "$INSTALL/"

echo ""
echo "OK: $TD_LIB"
echo "Đã copy vào: $INSTALL"
echo "Chạy app: ./tool/run_dev.sh"
