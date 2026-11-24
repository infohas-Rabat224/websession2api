#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
mkdir -p "$REPO_ROOT/data"

export WEBSESSION2API_HOST="${WEBSESSION2API_HOST:-127.0.0.1}"
export WEBSESSION2API_PORT="${WEBSESSION2API_PORT:-8787}"

cd "$REPO_ROOT"
nohup npm run gateway > "$REPO_ROOT/data/gateway.log" 2>&1 &
echo $! > "$REPO_ROOT/data/gateway.pid"

echo "[WebSession2API] Local API gateway started (PID $(cat "$REPO_ROOT/data/gateway.pid")) on http://$WEBSESSION2API_HOST:$WEBSESSION2API_PORT"
