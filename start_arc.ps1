# Arc Agent - Setup and Launch Script
# This script installs dependencies and starts both backend and frontend
# Run: .\start_arc.ps1

param(
    [switch]$SkipBackendInstall,
    [switch]$SkipFrontendInstall,
    [switch]$TestOnly,
    [switch]$Help
)

function Show-Help {
    Write-Host ""
    Write-Host "Arc Agent Setup and Launch Script"
    Write-Host "================================="
    Write-Host ""
    Write-Host "Usage: .\start_arc.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -SkipBackendInstall    Skip backend pip install (if already done)"
    Write-Host "  -SkipFrontendInstall   Skip frontend npm install (if already done)"
    Write-Host "  -TestOnly              Only test Neon connection, don't start services"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\start_arc.ps1                      # Full setup and launch"
    Write-Host "  .\start_arc.ps1 -SkipBackendInstall  # Skip backend install"
    Write-Host "  .\start_arc.ps1 -TestOnly            # Test Neon only"
    Write-Host ""
}

if ($Help) {
    Show-Help
    exit 0
}

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Arc Agent - Setup and Launch" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Python
Write-Host "Checking Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python not found. Please install Python 3.11+" -ForegroundColor Red
    exit 1
}
Write-Host "  Found: $pythonVersion" -ForegroundColor Green

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}
Write-Host "  Found: $nodeVersion" -ForegroundColor Green
Write-Host ""

# Install Backend Dependencies
if (-not $SkipBackendInstall) {
    Write-Host "Installing Backend Dependencies..." -ForegroundColor Yellow
    Write-Host "  This may take a few minutes..." -ForegroundColor Gray
    
    Set-Location "$scriptDir\backend"
    
    try {
        $output = pip install -e ".[dev]" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "pip install failed"
        }
        Write-Host "  Backend dependencies installed successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "  ERROR: Failed to install backend dependencies" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        exit 1
    }
    
    Set-Location $scriptDir
}
else {
    Write-Host "Skipping Backend Install (--SkipBackendInstall)" -ForegroundColor Gray
}

Write-Host ""

# Test Neon Connection
Write-Host "Testing Neon Connection..." -ForegroundColor Yellow
Set-Location "$scriptDir\backend"

try {
    $env:PYTHONPATH = "$scriptDir\backend\src"
    python -c "
import sys
sys.path.insert(0, 'src')
from dotenv import load_dotenv
load_dotenv()

from skills_manager import discover_local_skills
skills = discover_local_skills()
print(f'[OK] Found {len(skills)} skills ready to sync')
for s in skills[:5]:  # Show first 5
    print(f'     - {s[\"name\"]}')
if (len(skills) > 5):
    print(f'     ... and {len(skills) - 5} more')
"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Backend is ready" -ForegroundColor Green
    }
}
catch {
    Write-Host "  WARNING: Could not test backend" -ForegroundColor Yellow
}

Set-Location $scriptDir
Write-Host ""

if ($TestOnly) {
    Write-Host "Test complete. Exiting (--TestOnly)" -ForegroundColor Cyan
    exit 0
}

# Install Frontend Dependencies
if (-not $SkipFrontendInstall) {
    Write-Host "Installing Frontend Dependencies..." -ForegroundColor Yellow
    Write-Host "  This may take a few minutes..." -ForegroundColor Gray
    
    Set-Location "$scriptDir\frontend"
    
    try {
        $output = npm install 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed"
        }
        Write-Host "  Frontend dependencies installed successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "  ERROR: Failed to install frontend dependencies" -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        exit 1
    }
    
    Set-Location $scriptDir
}
else {
    Write-Host "Skipping Frontend Install (--SkipFrontendInstall)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Start Services
Write-Host "Starting Services..." -ForegroundColor Yellow
Write-Host ""

# Start Backend
Write-Host "Starting Backend (port 8000)..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\backend"
    $env:PYTHONPATH = "$dir\backend\src"
    uvicorn src.main:app --reload --port 8000
} -ArgumentList $scriptDir

# Give backend a moment to start
Start-Sleep -Seconds 3

# Check if backend started
$backendOutput = Receive-Job -Job $backendJob -Keep -ErrorAction SilentlyContinue
if ($backendOutput -match "error" -or $backendJob.State -eq "Failed") {
    Write-Host "  WARNING: Backend may have failed to start" -ForegroundColor Yellow
    Write-Host "  Output: $backendOutput" -ForegroundColor Gray
}
else {
    Write-Host "  Backend started successfully" -ForegroundColor Green
    Write-Host "  API: http://localhost:8000" -ForegroundColor Gray
    Write-Host "  Docs: http://localhost:8000/docs" -ForegroundColor Gray
}

Write-Host ""

# Start Frontend
Write-Host "Starting Frontend (port 3000)..." -ForegroundColor Cyan
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\frontend"
    npm run dev
} -ArgumentList $scriptDir

# Give frontend a moment to start
Start-Sleep -Seconds 5

# Check if frontend started
$frontendOutput = Receive-Job -Job $frontendJob -Keep -ErrorAction SilentlyContinue
if ($frontendOutput -match "error" -or $frontendJob.State -eq "Failed") {
    Write-Host "  WARNING: Frontend may have failed to start" -ForegroundColor Yellow
    Write-Host "  Output: $frontendOutput" -ForegroundColor Gray
}
else {
    Write-Host "  Frontend started successfully" -ForegroundColor Green
    Write-Host "  URL: http://localhost:3000" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Arc Agent is Running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host ""

# Keep script running and show logs
try {
    while ($true) {
        $backendLog = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        $frontendLog = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        
        if ($backendLog) {
            Write-Host "[BACKEND] $backendLog" -ForegroundColor Gray
        }
        if ($frontendLog) {
            Write-Host "[FRONTEND] $frontendLog" -ForegroundColor Gray
        }
        
        if ($backendJob.State -eq "Completed" -or $backendJob.State -eq "Failed") {
            Write-Host "Backend job stopped" -ForegroundColor Red
            break
        }
        if ($frontendJob.State -eq "Completed" -or $frontendJob.State -eq "Failed") {
            Write-Host "Frontend job stopped" -ForegroundColor Red
            break
        }
        
        Start-Sleep -Milliseconds 500
    }
}
finally {
    # Cleanup
    Write-Host ""
    Write-Host "Shutting down services..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Write-Host "Done!" -ForegroundColor Green
}
