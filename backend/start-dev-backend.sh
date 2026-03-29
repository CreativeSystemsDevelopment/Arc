#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DEV_PORT="${ARC_DEV_BACKEND_PORT:-8002}"
PORT="${1:-$DEFAULT_DEV_PORT}"
HOST="${ARC_DEV_BACKEND_HOST:-0.0.0.0}"
APP_MODULE="${ARC_DEV_BACKEND_APP:-src.main:app}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Error: port must be numeric. Got: $PORT" >&2
  exit 1
fi

if [[ "$PORT" == "8001" ]] && systemctl is-active --quiet arc-web-backend; then
  echo "Refusing to start dev backend on :8001 while arc-web-backend is active." >&2
  echo "Use the default :8002, pass a different port, or stop arc-web-backend first." >&2
  echo "  sudo systemctl stop arc-web-backend" >&2
  exit 1
fi

if ss -tulpn | rg -q ":${PORT}\\b"; then
  echo "Refusing to start: port :$PORT is already in use." >&2
  ss -tulpn | rg ":${PORT}\\b" >&2 || true
  exit 1
fi

if [[ ! -x "$ROOT_DIR/.venv/bin/python" ]]; then
  echo "Error: backend venv python not found at $ROOT_DIR/.venv/bin/python" >&2
  exit 1
fi

cd "$ROOT_DIR"
echo "Starting Arc dev backend on http://$HOST:$PORT (reload enabled)"
exec ./.venv/bin/python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
