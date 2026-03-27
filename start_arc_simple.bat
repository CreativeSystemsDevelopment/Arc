@echo off
REM Arc Agent - Simple Startup Script
REM This script installs dependencies and starts both services

echo.
echo ========================================
echo   Arc Agent - Setup and Launch
echo ========================================
echo.

REM Check Python
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.11+
    exit /b 1
)
echo   OK

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 18+
    exit /b 1
)
echo   OK
echo.

REM Install Backend Dependencies
echo Installing Backend Dependencies...
echo   This may take a few minutes...
cd backend
pip install -e ".[dev]"
if errorlevel 1 (
    echo ERROR: Backend installation failed
    exit /b 1
)
echo   Backend dependencies installed
cd ..

REM Install Frontend Dependencies
echo.
echo Installing Frontend Dependencies...
echo   This may take a few minutes...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: Frontend installation failed
    exit /b 1
)
echo   Frontend dependencies installed
cd ..

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Starting services in separate windows...
echo.

REM Start Backend in new window
start "Arc Backend" cmd /k "cd backend && set PYTHONPATH=src && uvicorn src.main:app --reload --port 8000"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start Frontend in new window
start "Arc Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo   Arc Agent is Starting!
echo ========================================
echo.
echo Backend will be at:  http://localhost:8000
echo Frontend will be at: http://localhost:3000
echo API Docs:           http://localhost:8000/docs
echo.
echo Wait 10-15 seconds for services to fully start
echo.
pause
