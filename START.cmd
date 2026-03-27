@echo off
REM Arc Agent - Windows Command Prompt Startup
REM Usage: START.cmd

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
    pause
    exit /b 1
)
echo   OK

REM Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)
echo   OK
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Install Backend
echo Installing Backend Dependencies...
echo   This may take a few minutes...
cd backend
call pip install -e ".[dev]" -q
if errorlevel 1 (
    echo WARNING: Backend install had issues, continuing anyway...
)
cd "%SCRIPT_DIR%"
echo   Backend ready
echo.

REM Install Frontend
echo Installing Frontend Dependencies...
echo   This may take a few minutes...
cd frontend
if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        echo ERROR: Frontend install failed
        pause
        exit /b 1
    )
) else (
    echo   Frontend dependencies already installed
)
cd "%SCRIPT_DIR%"
echo   Frontend ready
echo.

REM Test Neon
echo Testing Neon Connection...
cd backend
python test_neon.py >nul 2>&1
if errorlevel 1 (
    echo   Neon connection failed - will use local fallback mode
) else (
    echo   Neon connection OK
)
cd "%SCRIPT_DIR%"
echo.

echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Starting services in separate windows...
echo.

REM Start Backend
cd backend
set PYTHONPATH=src
start "Arc Backend (Port 8000)" cmd /k "python -m uvicorn src.main:app --reload --port 8000"

cd "%SCRIPT_DIR%"

REM Wait for backend
timeout /t 3 /nobreak >nul

REM Start Frontend
cd frontend
start "Arc Frontend (Port 3000)" cmd /k "npm run dev"

cd "%SCRIPT_DIR%"

echo.
echo ========================================
echo   Arc Agent is Starting!
echo ========================================
echo.
echo Wait 10-15 seconds for services to fully start
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo API Docs: http://localhost:8000/docs
echo.
echo Close the terminal windows to stop the services.
echo.
pause
