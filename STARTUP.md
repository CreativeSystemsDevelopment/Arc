# Arc Agent - Quick Start

Choose the option that works best for your environment:

---

## Option 1: Windows Command Prompt (Easiest)

Just double-click or run in Command Prompt:

```cmd
START.cmd
```

This will:
1. Check Python and Node.js
2. Install all dependencies
3. Test Neon connection
4. Open **separate windows** for backend and frontend
5. Show you the URLs

---

## Option 2: Git Bash (Recommended for developers)

If you have Git Bash (comes with Git for Windows):

```bash
# Full setup with logs in one window
./start.sh
```

Or for separate windows:

```bash
./start-separate.sh
```

**Note:** You may need to make the scripts executable first:
```bash
chmod +x start.sh start-separate.sh
```

---

## Option 3: PowerShell

```powershell
# Full setup with real-time logs
.\start_arc.ps1

# Skip installations (if already done)
.\start_arc.ps1 -SkipBackendInstall -SkipFrontendInstall

# Show help
.\start_arc.ps1 -Help
```

---

## Option 4: Manual (Full Control)

### Terminal 1: Backend
```bash
cd backend
pip install -e ".[dev]"
python test_neon.py
uvicorn src.main:app --reload --port 8000
```

### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Access the Application

Once running, open your browser:

| Service | URL |
|---------|-----|
| **Frontend UI** | http://localhost:3000 |
| **Backend API** | http://localhost:8000 |
| **API Docs** | http://localhost:8000/docs |
| **Health Check** | http://localhost:8000/ |

---

## Troubleshooting

### "Python not found"
Install Python 3.11+ from https://python.org

### "Node.js not found"
Install Node.js 18+ from https://nodejs.org

### "pip install fails"
```bash
python -m pip install --upgrade pip
```

### "npm install fails"
```bash
npm cache clean --force
```

### "Permission denied" (Git Bash)
```bash
chmod +x start.sh
```

### Backend shows "ModuleNotFoundError"
Make sure you're in the `backend` directory when running uvicorn.

### Neon connection fails
The backend will automatically fall back to **local mode**. You'll see:
```
WARNING: CLOUD STORAGE UNAVAILABLE
Falling back to LOCAL storage for skills and memories.
```

This is normal if:
- You don't have internet
- NEON_DATABASE_URL is not set
- Neon project is not active

The agent will work fine, just without cloud sync.

---

## Services Overview

After starting:

| Service | Port | Description |
|---------|------|-------------|
| FastAPI Backend | 8000 | Python API with Deep Agent |
| Next.js Frontend | 3000 | React UI with 3D Orb |
| Neon PostgreSQL | 5432 | Cloud persistence (if configured) |

---

## Quick Commands Reference

```bash
# Just test Neon connection
cd backend && python test_neon.py

# Start backend only
cd backend && uvicorn src.main:app --reload --port 8000

# Start frontend only
cd frontend && npm run dev

# Check what's running
# (Git Bash)
ps aux | grep -E "uvicorn|node"

# (Windows CMD)
tasklist | findstr node
tasklist | findstr python
```

---

## Stopping Services

- **START.cmd**: Close the terminal windows
- **start.sh**: Press `Ctrl+C`
- **start-separate.sh**: Close the terminal windows
- **Manual**: Press `Ctrl+C` in each terminal
