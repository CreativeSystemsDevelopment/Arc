# Arc Project Updates

## Summary of Changes

### 1. Model Configuration Updated
**File:** `backend/src/agent.py`, `.env`, `.env.example`

- **Default Model:** Changed from `openrouter:minimax/minimax-m2.7` to `openrouter:moonshotai/kimi-k2.5`
- **API Key:** OpenRouter key configured
- **Retry Logic:** Added `max_retries=10` and `timeout=120` for connection resilience
- **Environment Variables:**
  - `AGENT_MODEL=openrouter:moonshotai/kimi-k2.5`
  - `AGENT_MAX_RETRIES=10`
  - `AGENT_TIMEOUT=120`

### 2. Critical Gaps Fixed

#### ✅ Checkpointing / Persistence
- Added `MemorySaver` for thread persistence
- Conversations can now be resumed with `thread_id`
- Required for HITL (Human-in-the-Loop)

#### ✅ Filesystem Backend
- Added `FilesystemBackend` with `virtual_mode=True`
- Files persist across agent restarts in `./workspace/`
- All file paths use absolute format (`/file.txt`)

#### ✅ Human-in-the-Loop (HITL)
- `delete_file` requires approval (approve/edit/reject)
- `execute` requires approval (approve/reject only)
- Protects against accidental destructive operations

#### ✅ Skills Support
- Directory: `./workspace/skills/`
- Sample skill created: `langgraph-patterns`
- Skills load on-demand when relevant to the task

#### ✅ Memory Tiers
- Directory: `./workspace/memories/`
- Created `AGENTS.md` for persistent project context
- Memory loaded into system prompt

### 3. Azure Skills Excluded

**Azure skills are excluded from the Arc agent.**

**Excluded Skills (20):**
- appinsights-instrumentation
- azure-ai, azure-aigateway, azure-cloud-migrate
- azure-compliance, azure-compute, azure-cost-optimization
- azure-deploy, azure-diagnostics, azure-hosted-copilot-sdk
- azure-kusto, azure-messaging, azure-observability
- azure-prepare, azure-quotas, azure-rbac
- azure-resource-lookup, azure-resource-visualizer
- azure-storage, azure-validate

**Active Skills (3):**
- entra-app-registration
- langgraph-deepagent-docs (created for this project)
- microsoft-foundry

**Files Modified:**
- `backend/src/skills_manager.py` - Added EXCLUDED_SKILLS
- `backend/src/agent_neon.py` - Azure skills excluded from sync
- `backend/src/remove_azure_skills.py` - Removal script for cloud cleanup

**Configuration:** `SKILLS_CONFIG.md`

### 4. Cloud Persistence with Automatic Fallback

Created cloud backend options with graceful fallback to local storage:

#### Files Created:
- `backend/src/agent_neon.py` - Neon PostgreSQL backend
- `backend/src/agent_gcp.py` - Google Cloud SQL backend
- `backend/src/agent_cloud.py` - Generic cloud PostgreSQL backend
- `backend/src/backends/r2_backend.py` - Cloudflare R2 file storage

#### Usage:
```bash
# Local mode (default)
export ARC_MODE=local

# Neon (easiest cloud option)
export ARC_MODE=neon
export NEON_DATABASE_URL=postgres://user:pass@host.neon.tech/dbname?sslmode=require

# Google Cloud
export ARC_MODE=gcp
export GCP_DATABASE_URL=...
```

**Features:**
- Cloud storage for skills, memories, thread history
- Automatic fallback to local if cloud unreachable
- Clear notification when fallback mode is active
- Continues operating normally in fallback mode

**Fallback Behavior:**
If Neon is unreachable, the agent automatically:
1. Displays clear notification: "CLOUD STORAGE UNAVAILABLE"
2. Falls back to local storage for skills and memories
3. Continues operating normally (without cloud sync)

**Benefits:**
- Access agent from any device
- Skills and memory sync everywhere
- Resume conversations across machines
- Team collaboration support
- No service interruption if cloud is down

### 5. Dynamic Agent Loading
**File:** `backend/src/main.py`

- Added `ARC_MODE` environment variable support
- Automatically loads correct agent configuration
- Health endpoint shows current mode

### 6. Documentation Updates
**File:** `agents.md`

- Updated model configuration section
- Added persistence & state management docs
- Added cloud mode setup instructions
- Updated stack table with new components
- Updated gotchas section

### 7. Frontend Architecture (Already Present)

**Your existing frontend is a sophisticated Next.js 15 application with:**

**Core Components:**
- **AgentChat.tsx** (33KB) - Main interface with thread management, SSE streaming
- **OrbScene.tsx** - 3D WebGL orb with custom GLSL shaders, Three.js
- **AgentMessage.tsx** - Animated message bubbles with importance scoring
- **CommandConduit.tsx** - Command palette with slash commands
- **DeepFocusOverlay.tsx** - Focus mode with file/skill/memory browsers

**Visual Effects:**
- **DecayStream.tsx** - Message decay animations
- **ToolFilament.tsx** - Tool call visual effects
- **PlanConstellation.tsx** - Todo visualization
- **OrbTopBar.tsx** - Status bar with VM health
- **TelemetryPanel.tsx** - Real-time system metrics

**Tech Stack:**
- Next.js 15 App Router
- React 19 + TypeScript
- Framer Motion 12 (animations)
- Three.js + React Three Fiber (3D)
- Custom GLSL shaders
- SSE for real-time streaming

### 8. Directory Structure

```
Arc/
├── workspace/                 # NEW - Persistent file storage
│   ├── skills/               # NEW - Skill files (loaded on-demand)
│   └── memories/             # NEW - Memory files (persistent context)
├── backend/
│   └── src/
│       ├── agent.py          # UPDATED - Local mode with HITL
│       ├── agent_neon.py     # UPDATED - Neon cloud, Azure skills excluded
│       ├── agent_gcp.py      # NEW - GCP cloud backend
│       ├── agent_cloud.py    # NEW - Generic cloud backend
│       ├── main.py           # UPDATED - Dynamic mode switching
│       ├── skills_manager.py # NEW - Skill sync with Azure exclusion
│       ├── remove_azure_skills.py  # NEW - Azure skill removal script
│       ├── test_neon.py      # NEW - Neon connection test
│       └── backends/         # NEW - Custom backend implementations
│           └── r2_backend.py
├── frontend/                 # EXISTING - Sophisticated Next.js UI
│   ├── app/
│   │   ├── components/       # 18 React components
│   │   │   ├── AgentChat.tsx
│   │   │   ├── OrbScene.tsx
│   │   │   └── ... (16 more)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── next.config.mjs
│   └── package.json
├── .env                      # NEW - Your local configuration
├── .env.example              # UPDATED - All cloud options documented
├── SKILLS_CONFIG.md          # NEW - Skill exclusion documentation
└── SETUP_COMPLETE.md         # NEW - Setup summary
```

## Quick Start

### Local Mode (Default)
```bash
cd backend
pip install -e ".[dev]"
# Edit .env with your OPENROUTER_API_KEY
uvicorn src.main:app --reload --port 8000
```

### Cloud Mode (Neon)
```bash
# 1. Sign up at https://neon.tech
# 2. Create project, copy connection string
# 3. Edit .env:
export ARC_MODE=neon
export NEON_DATABASE_URL=postgres://...

# 4. Run
cd backend
uvicorn src.main:app --reload --port 8000
```

## Environment Variables Reference

### Required
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `AGENT_MODEL` - Default: `openrouter:moonshotai/kimi-k2.5`

### Optional (Cloud)
- `ARC_MODE` - `local` (default), `neon`, `gcp`, `cloud`
- `NEON_DATABASE_URL` - Neon connection string
- `GCP_DATABASE_URL` - Google Cloud SQL connection string

### Optional (Features)
- `TAVILY_API_KEY` - For web search (researcher subagent)
- `LANGCHAIN_API_KEY` - For LangSmith observability
- `WORKSPACE_ROOT` - Default: `./workspace`
- `AGENT_MAX_RETRIES` - Default: `10`
- `AGENT_TIMEOUT` - Default: `120`

## Next Steps

1. **Test Local Mode:**
   ```bash
   cd backend && uvicorn src.main:app --reload
   ```

2. **Set Up Neon (Optional):**
   - Sign up at https://neon.tech
   - Get connection string
   - Set `ARC_MODE=neon` and `NEON_DATABASE_URL`

3. **Customize Skills:**
   - Add skill folders to `./workspace/skills/`
   - Each skill needs a `SKILL.md` file

4. **Add Memories:**
   - Edit `./workspace/memories/AGENTS.md`
   - Add project conventions, anti-patterns, preferences
