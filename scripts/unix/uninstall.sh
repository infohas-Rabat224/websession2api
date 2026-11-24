#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/stop.sh" || true

OS_NAME="$(uname -s)"
if [ "$OS_NAME" = "Darwin" ]; then
  MANIFEST_FILE="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.websession2api.host.json"
else
  MANIFEST_FILE="$HOME/.config/google-chrome/NativeMessagingHosts/com.websession2api.host.json"
fi

if [ -f "$MANIFEST_FILE" ]; then
  rm -f "$MANIFEST_FILE"
  echo "[WebSession2API] Removed Native Messaging manifest: $MANIFEST_FILE"
else
  echo "[WebSession2API] Manifest not found at $MANIFEST_FILE"
fi
