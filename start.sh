#!/bin/bash
# Arc Agent - Git Bash Startup Script
# Usage: ./start.sh

set -e  # Exit on error

echo ""
echo "========================================"
echo "  Arc Agent - Setup and Launch"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check Python
echo -e "${YELLOW}Checking Python...${NC}"
if ! command -v python &> /dev/null; then
    echo -e "${RED}ERROR: Python not found. Please install Python 3.11+${NC}"
    exit 1
fi
python --version

# Check Node.js
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi
node --version
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Install Backend Dependencies
if [ ! -d "backend/.venv" ] && [ ! -f "backend/src/agent_neon.py" ]; then
    echo -e "${YELLOW}Backend dependencies seem to be missing${NC}"
fi

echo -e "${YELLOW}Installing Backend Dependencies...${NC}"
echo "  This may take a few minutes..."
cd backend

# Try to install, but don't fail if already installed
pip install -e ".[dev]" || {
    echo -e "${YELLOW}Warning: Backend install had issues, trying to continue...${NC}"
}

cd "$SCRIPT_DIR"
echo -e "${GREEN}  Backend ready${NC}"
echo ""

# Install Frontend Dependencies
echo -e "${YELLOW}Installing Frontend Dependencies...${NC}"
echo "  This may take a few minutes..."
cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}  Frontend dependencies already installed${NC}"
fi

cd "$SCRIPT_DIR"
echo -e "${GREEN}  Frontend ready${NC}"
echo ""

# Test Neon Connection
echo -e "${YELLOW}Testing Neon Connection...${NC}"
cd backend
python test_neon.py || {
    echo -e "${YELLOW}Neon test failed, will use local fallback mode${NC}"
}
cd "$SCRIPT_DIR"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Start Backend
echo -e "${YELLOW}Starting Backend (port 8000)...${NC}"
cd backend
export PYTHONPATH="src"
python -m uvicorn src.main:app --reload --port 8000 &
BACKEND_PID=$!
echo -e "${GREEN}  Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend
echo "  Waiting for backend to start..."
sleep 5

cd "$SCRIPT_DIR"

# Start Frontend
echo ""
echo -e "${YELLOW}Starting Frontend (port 3000)...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
echo -e "${GREEN}  Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait for frontend
echo "  Waiting for frontend to start..."
sleep 5

cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Arc Agent is Running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}Backend:${NC}  http://localhost:8000"
echo -e "${CYAN}Frontend:${NC} http://localhost:3000"
echo -e "${CYAN}API Docs:${NC} http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Handle Ctrl+C to stop services
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Done!${NC}"
    exit 0
}

trap cleanup INT

# Keep script running
wait
