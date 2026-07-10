#!/usr/bin/env bash
# Copy libtdjson vào mọi app build có sẵn (dev helper).
set -euo pipefail
cd "$(dirname "$0")/.."
SCRIPT="$(dirname "$0")/bundle_tdlib.sh"

for config in Debug Release Profile; do
  APP="build/macos/Build/Products/${config}/televault.app/Contents/Frameworks"
  if [[ -d "build/macos/Build/Products/${config}/televault.app" ]]; then
    "$SCRIPT" "$APP"
  fi
done
