#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <CHROME_EXTENSION_ID>"
  exit 1
fi

EXT_ID="$1"
if ! [[ "$EXT_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Error: Invalid Chrome Extension ID '$EXT_ID' (expected 32 lowercase characters a-p)."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOST_SCRIPT="$REPO_ROOT/apps/native-host/dist/host.js"

cd "$REPO_ROOT"
echo "[WebSession2API] Installing dependencies and building all targets..."
npm install
npm run build:all
chmod +x "$HOST_SCRIPT"

OS_NAME="$(uname -s)"
if [ "$OS_NAME" = "Darwin" ]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

mkdir -p "$TARGET_DIR"
MANIFEST_FILE="$TARGET_DIR/com.websession2api.host.json"

cat > "$MANIFEST_FILE" <<EOF
{
  "name": "com.websession2api.host",
  "description": "WebSession2API Local Native Messaging Host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "[WebSession2API] Registered Native Messaging host manifest at:"
echo "  $MANIFEST_FILE"
echo "[WebSession2API] Start the local gateway with: ./scripts/unix/start.sh"
