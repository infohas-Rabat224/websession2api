#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PID_FILE="$REPO_ROOT/data/gateway.pid"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "[WebSession2API] Stopped gateway PID $PID."
  else
    echo "[WebSession2API] Process $PID is not running."
  fi
  rm -f "$PID_FILE"
else
  echo "[WebSession2API] No gateway PID file found."
fi
