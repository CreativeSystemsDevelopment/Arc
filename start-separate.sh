#!/bin/bash
# Arc Agent - Start services in separate windows (Git Bash)
# Usage: ./start-separate.sh

set -e

echo ""
echo "========================================"
echo "  Arc Agent - Setup and Launch"
echo "========================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
BACKEND_VENV="$SCRIPT_DIR/backend/.venv"
BACKEND_PYTHON="$BACKEND_VENV/bin/python"

if [ ! -x "$BACKEND_PYTHON" ]; then
    echo "Creating backend virtualenv..."
    python -m venv "$BACKEND_VENV"
fi

# Install Backend
echo "Installing Backend Dependencies..."
cd backend
"$BACKEND_PYTHON" -m pip install -e ".[dev]" -q
cd "$SCRIPT_DIR"
echo "  Backend ready"

# Install Frontend
echo ""
echo "Installing Frontend Dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd "$SCRIPT_DIR"
echo "  Frontend ready"

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""

# Start services in separate windows
echo "Starting services in separate windows..."

# For Git Bash on Windows, use start command
cd backend
start "Arc Backend" "$BACKEND_PYTHON" -m uvicorn src.main:app --reload --port 8000

cd "$SCRIPT_DIR"

cd frontend
start "Arc Frontend" npm run dev

cd "$SCRIPT_DIR"

echo ""
echo "Services started in separate windows!"
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Close the windows to stop the services."
echo ""
read -p "Press Enter to exit..."
