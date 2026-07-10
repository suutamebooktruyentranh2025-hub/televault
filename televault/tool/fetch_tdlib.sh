#!/usr/bin/env bash
# Tải/chuẩn bị libtdjson cho từng nền tảng. Chạy trước khi build release.
# Binary KHÔNG commit vào git (xem .gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${1:-macos}"

case "$PLATFORM" in
  macos)
    brew list tdlib >/dev/null 2>&1 || brew install tdlib
    echo "macOS: dùng libtdjson từ Homebrew ($(brew --prefix)/lib/libtdjson.dylib)"
    ;;
  android)
    echo "Android: xem https://github.com/tdlib/td/tree/master/example/android"
    echo "Hoặc dùng prebuilt: https://github.com/ivk1800/td-json-client-prebuilt/releases"
    mkdir -p android/app/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}
    ;;
  windows)
    echo "Windows: build qua vcpkg (xem https://tdlib.github.io/td/build.html)"
    echo "Copy tdjson.dll + deps vào windows/ và khai báo trong CMakeLists để bundle cạnh exe"
    ;;
  linux)
    echo "Linux: cài qua package manager hoặc build; libtdjson.so cần nằm trong LD_LIBRARY_PATH"
    ;;
  ios)
    echo "iOS: build framework theo https://github.com/tdlib/td/tree/master/example/ios"
    echo "Add vào Xcode Runner target (static link -> DynamicLibrary.process() hoạt động)"
    ;;
esac
