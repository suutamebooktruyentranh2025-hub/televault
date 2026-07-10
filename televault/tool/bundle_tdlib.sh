#!/usr/bin/env bash
# Bundle libtdjson + OpenSSL vào app Frameworks với @rpath (sandbox-safe).
set -euo pipefail

FRAMEWORKS="${1:?usage: bundle_tdlib.sh <path/to/app/Contents/Frameworks> [sign_identity]}"
SIGN_ID="${2:--}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TDLIB_PREFIX="${TELELIB_TDLIB:-$ROOT/.tdlib/install}"

resolve_td_lib() {
  if [[ -n "${TELELIB_TDLIB_LIB:-}" && -f "$TELELIB_TDLIB_LIB" ]]; then
    echo "$TELELIB_TDLIB_LIB"
    return
  fi
  local d f
  for d in "$TDLIB_PREFIX/lib" "$(brew --prefix 2>/dev/null)/opt/tdlib/lib"; do
    [[ -d "$d" ]] || continue
    for f in "$d"/libtdjson*.dylib; do
      [[ -f "$f" ]] || continue
      echo "$f"
      return
    done
  done
  echo "error: libtdjson not found — chạy ./tool/build_tdlib_macos.sh hoặc brew install tdlib" >&2
  exit 1
}

if ! brew list openssl@3 &>/dev/null; then
  echo "error: brew install openssl@3" >&2
  exit 1
fi

TD_LIB="$(resolve_td_lib)"
SSL_LIB="$(brew --prefix)/opt/openssl@3/lib/libssl.3.dylib"
CRYPTO_LIB="$(brew --prefix)/opt/openssl@3/lib/libcrypto.3.dylib"

for f in "$TD_LIB" "$SSL_LIB" "$CRYPTO_LIB"; do
  if [[ ! -f "$f" ]]; then
    echo "error: missing $f" >&2
    exit 1
  fi
done

echo "Using TDLib: $TD_LIB"

mkdir -p "$FRAMEWORKS"
cp -f "$TD_LIB" "$FRAMEWORKS/libtdjson.dylib"
cp -f "$SSL_LIB" "$FRAMEWORKS/libssl.3.dylib"
cp -f "$CRYPTO_LIB" "$FRAMEWORKS/libcrypto.3.dylib"
chmod u+w "$FRAMEWORKS/libtdjson.dylib" "$FRAMEWORKS/libssl.3.dylib" "$FRAMEWORKS/libcrypto.3.dylib"

RP="@rpath"
TD="$FRAMEWORKS/libtdjson.dylib"
SSL="$FRAMEWORKS/libssl.3.dylib"
CRYPTO="$FRAMEWORKS/libcrypto.3.dylib"

install_name_tool -id "${RP}/libtdjson.dylib" "$TD"
install_name_tool -id "${RP}/libssl.3.dylib" "$SSL"
install_name_tool -id "${RP}/libcrypto.3.dylib" "$CRYPTO"

while read -r old_path; do
  [[ -z "$old_path" || "$old_path" == *libSystem* || "$old_path" == /usr/lib/* ]] && continue
  case "$old_path" in
    *libtdjson*) install_name_tool -change "$old_path" "${RP}/libtdjson.dylib" "$TD" 2>/dev/null || true ;;
    *libssl*)    install_name_tool -change "$old_path" "${RP}/libssl.3.dylib" "$TD" 2>/dev/null || true ;;
    *libcrypto*) install_name_tool -change "$old_path" "${RP}/libcrypto.3.dylib" "$TD" 2>/dev/null || true ;;
  esac
done < <(otool -L "$TD" | tail -n +2 | awk '{print $1}')

while read -r old_path; do
  [[ -z "$old_path" || "$old_path" == *libSystem* || "$old_path" == /usr/lib/* ]] && continue
  case "$old_path" in
    *libcrypto*) install_name_tool -change "$old_path" "${RP}/libcrypto.3.dylib" "$SSL" 2>/dev/null || true ;;
  esac
done < <(otool -L "$SSL" | tail -n +2 | awk '{print $1}')

for lib in libcrypto.3.dylib libssl.3.dylib libtdjson.dylib; do
  codesign --force --sign "$SIGN_ID" --timestamp=none "$FRAMEWORKS/$lib"
done

echo "Bundled + signed TDLib -> $FRAMEWORKS"
