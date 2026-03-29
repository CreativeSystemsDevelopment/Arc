# 🔍 System Filesystem Index
*Generated: 2026-03-29*

Quick reference guide for navigating the atlas-platform VM filesystem.

---

## 📊 System Overview

| Property | Value |
|----------|-------|
| **Hostname** | atlas-platform |
| **OS** | Ubuntu 22.04 LTS |
| **Machine Type** | e2-highmem-4 (4 vCPUs, high memory) |
| **Zone** | us-central1-a |
| **External IP** | 136.112.148.169 |
| **Disk Usage** | 70G used / 78G total (91% full) |
| **Primary User** | eshan |

---

## 🏠 Home Directory Structure (/home/eshan/)

### Primary Active Projects

| Project | Path | Type | Remote |
|---------|------|------|--------|
| **Arc** | `/home/eshan/arc/Arc/` | Full-Stack AI Agent Platform | CreativeSystemsDevelopment/Arc |
| **vm-agent_final** | `/home/eshan/vm-agent_final/` | CV/ML Annotation Tool | CreativeSystemsDevelopment/vm-agent-final |
| **vm-agent** | `/home/eshan/vm-agent/` | Python FastAPI + Electron | (local) |

### AI/ML Development Projects

```
/home/eshan/
├── agent-zero/            # Python agent framework
├── agent_zero/            # Cloned repo
├── browser-use/           # Browser automation
├── claude-code-agents/    # Claude agents
├── claude-code-router/   # Claude routing
├── cognee/                # Memory framework
├── crewAI/                # CrewAI framework (placeholder)
├── langgraph/             # LangGraph (placeholder)
├── llama-agents/          # Llama agents
├── openai-agents-python/ # OpenAI agents
├── openhands-*/           # OpenHands projects
├── smolagents/            # Smolagents framework
├── anthropic-*/           # Anthropic SDKs/cookbook
├── pydantic-ai/           # Pydantic AI
├── semantic-kernel/       # Microsoft Semantic Kernel
├── extraction_docs/       # Document extraction
├── pdf-processing/        # PDF processing
```

### Node.js Applications

| Project | Path | Purpose |
|---------|------|---------|
| agent-portal | `/home/eshan/agent-portal/` | Express server portal |
| openclaw | `/home/eshan/openclaw/` | A2A agent system |
| tui-inbox | `/home/eshan/tui-inbox/` | Terminal UI inbox |
| copilot-agent-builder | `/home/eshan/copilot-agent-builder/` | Next.js Copilot builder |
| openrouter | `/home/eshan/openrouter/` | OpenRouter integration |

---

## 🗄️ Service Directories

### /chromadb/
- **Purpose**: Vector database for AI embeddings
- **Port**: 8000
- **Data**: Stored in container (host directory empty)
- **Status**: Running (containerized)

### /portainer/
- **Purpose**: Docker container management UI
- **Port**: 9000
- **Key Files**:
  - `data/portainer.db` (32 KB) - SQLite configuration database
  - `data/portainer.key` (227 bytes) - Private encryption key
  - `data/portainer.pub` (190 bytes) - Public key
- **Status**: Active with persistent config

### /redis/
- **Purpose**: In-memory key-value store
- **Port**: 6379
- **Key Files**:
  - `data/dump.rdb` (88 bytes) - Redis persistence snapshot
- **Status**: Minimal data stored

### /portainer/
- **Purpose**: Docker container management UI
- **Port**: 9000

---

## ⚙️ Important Config Locations

### System Configs (/etc/)

| Location | Purpose |
|----------|---------|
| `/etc/caddy/` | Caddy reverse proxy configuration |
| `/etc/systemd/` | Systemd service definitions |
| `/etc/docker/` | Docker daemon configuration |
| `/etc/nginx/` | Nginx configuration (if enabled) |

### User Configs (~/.config/, dotfiles)

| Location | Purpose |
|----------|---------|
| `~/.config/gcloud/` | Google Cloud SDK configuration |
| `~/.config/fish/` | Fish shell configuration |
| `~/.azure/` | Azure CLI configuration |
| `~/.aws/` | AWS CLI configuration (if exists) |
| `~/.ssh/` | SSH keys and config |
| `~/.cursor/` | Cursor IDE settings |
| `~/.claude.json` | Claude CLI settings |
| `~/.continue/` | Continue.dev AI IDE |
| `~/.nvm/` | Node Version Manager |

### Project Config Files

| File | Purpose | Locations |
|------|---------|-----------|
| `.env` | Environment variables | Multiple projects |
| `pyproject.toml` | Python project config | `vm-agent/`, `copilot-agent-ui/` |
| `requirements.txt` | Python dependencies | `vm-agent_final/`, `agent-zero/` |
| `package.json` | Node.js dependencies | Multiple Node projects |
| `Dockerfile` | Container definitions | `openclaw/`, `.nvm/`, `.devcontainer/` |

---

## 🔧 Development Tools

### Package Managers
- **UV**: `/home/eshan/.local/bin/uv` (Python package management)
- **NVM**: `/home/eshan/.nvm/` (Node.js version management)
- **Homebrew**: `/home/linuxbrew/.linuxbrew/` (Linuxbrew)
- **Pip**: System pip at `/usr/bin/pip`

### IDEs & Editors
- **Cursor**: Config at `~/.cursor/`
- **VS Code**: Config at `~/.vscode/`, extensions at `~/.vscode-server/`
- **Code Server**: Config at `~/.config/code-server/`

### AI Assistants
- **Claude Code**: `~/.claude/`, `~/.claude.json`
- **GitHub Copilot**: `~/.copilot/`, `~/.github/copilot/`
- **Continue.dev**: `~/.continue/`
- **Gemini CLI**: `~/.gemini/`
- **CodeGPT**: `~/.codegpt/`

---

## 🐳 Container Services

### Docker Context
- **Portainer UI**: http://localhost:9000
- **ChromaDB**: Port 8000
- **Redis**: Port 6379

### Common Commands

```bash
# List running containers
docker ps

# Portainer access
curl http://localhost:9000

# Redis CLI
docker exec -it redis redis-cli

# Check container logs
docker logs <container_name>
```

---

## 📝 Log Locations

| Location | Purpose |
|----------|---------|
| `/var/log/syslog` | System logs |
| `/var/log/auth.log` | Authentication logs |
| `/home/eshan/.bash_history` | Shell command history |
| `/home/eshan/.local/share/code-server/` | Code server logs |

---

## 🔑 Git Repository Summary

| Repository | Path | Remote |
|------------|------|--------|
| Arc Platform | `/home/eshan/arc/Arc/` | github.com/CreativeSystemsDevelopment/Arc |
| VM Agent Final | `/home/eshan/vm-agent_final/` | github.com/CreativeSystemsDevelopment/vm-agent-final |
| Atlas Platform VM | `/home/eshan/` (home) | github.com/CreativeSystemsDevelopment/atlas-platform-vm |
| Agent Frameworks | `/home/eshan/` (alt remote) | github.com/CreativeSystemsDevelopment/agent_frameworks |
| OpenClaw | `/home/eshan/.openclaw/workspace/` | (local only) |

---

## 🚀 Quick Navigation

### To start the main Arc development server:
```bash
cd /home/eshan/arc/Arc/backend && uvicorn src.main:app --reload --port 8000
cd /home/eshan/arc/Arc/frontend && npm run dev
```

### To access VM agent:
```bash
cd /home/eshan/vm-agent
source .venv/bin/activate
python backend/main.py
```

### To check Docker services:
```bash
docker ps
docker-compose ps  # if compose files exist
```

---

## ⚠️ Disk Space Alert

**Current usage: 91% (70G/78G)**

Consider cleanup areas:
- `~/.cache/` - Application caches
- `~/.npm/` - npm cache
- `/var/log/` - System logs
- Docker images/containers
- Old node_modules directories

---

*Last updated: 2026-03-29*
