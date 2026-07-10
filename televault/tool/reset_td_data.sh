#!/usr/bin/env bash
# Xóa dữ liệu TDLib local (dùng khi đổi encryption key hoặc auth bị kẹt).
set -euo pipefail
CONTAINER="$HOME/Library/Containers/com.televault.televault/Data/Library/Application Support/com.televault.televault"
if [[ -d "$CONTAINER/td" ]]; then
  rm -rf "$CONTAINER/td"
  echo "Đã xóa $CONTAINER/td"
else
  echo "Không có dữ liệu TDLib cũ."
fi
