#!/usr/bin/env bash
set -euo pipefail

APP="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app"
FRAMEWORKS="${APP}/Contents/Frameworks"
SIGN_ID="${EXPANDED_CODE_SIGN_IDENTITY:--}"

if [[ "${CONFIGURATION:-Debug}" == "Release" ]]; then
  ENTITLEMENTS="${PROJECT_DIR}/Runner/Release.entitlements"
else
  ENTITLEMENTS="${PROJECT_DIR}/Runner/DebugProfile.entitlements"
fi

"${PROJECT_DIR}/../tool/bundle_tdlib.sh" "$FRAMEWORKS" "$SIGN_ID"

# Re-sign app with sandbox entitlements (file_picker, network, …).
# Ad-hoc flutter builds omit entitlements unless applied explicitly here.
codesign --force --sign "$SIGN_ID" --entitlements "$ENTITLEMENTS" --timestamp=none \
  "${APP}/Contents/MacOS/${PRODUCT_NAME}"
codesign --force --deep --sign "$SIGN_ID" --entitlements "$ENTITLEMENTS" --timestamp=none \
  "$APP"

echo "Re-signed ${PRODUCT_NAME}.app with $(basename "$ENTITLEMENTS")"
