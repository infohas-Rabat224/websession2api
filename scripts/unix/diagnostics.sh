#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== WebSession2API Diagnostics ==="
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

OS_NAME="$(uname -s)"
if [ "$OS_NAME" = "Darwin" ]; then
  MANIFEST_FILE="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.websession2api.host.json"
else
  MANIFEST_FILE="$HOME/.config/google-chrome/NativeMessagingHosts/com.websession2api.host.json"
fi

[ -f "$MANIFEST_FILE" ] && echo "Native Host Manifest: OK ($MANIFEST_FILE)" || echo "Native Host Manifest: MISSING"
[ -f "$REPO_ROOT/apps/extension/dist/manifest.json" ] && echo "Extension Build: OK" || echo "Extension Build: MISSING"
[ -f "$REPO_ROOT/apps/native-host/dist/host.js" ] && echo "Native Host Build: OK" || echo "Native Host Build: MISSING"
