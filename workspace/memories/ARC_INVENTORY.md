# Arc Project Inventory
*Generated: 2026-03-29*
*Root: `/home/eshan/arc/Arc`*

## Overview
**Arc — Archenemies Deep Agent** is a full-stack AI agent platform built on LangChain's Deep Agents SDK.

| Property | Value |
|----------|-------|
| **Total Size** | 1,246 MB (1.2 GB) |
| **Backend** | Python 3.11+ + FastAPI |
| **Frontend** | Next.js 15.x + React 19.x + TypeScript |
| **Agent SDK** | deepagents 0.4.12 |
| **Orchestration** | LangGraph 1.1.3 |
| **Persistence** | Neon PostgreSQL (cloud) |
| **Observability** | LangSmith |
| **Styling** | Tailwind CSS 4.x |
| **Animations** | Framer Motion 12.x + Three.js |

---

## Directory Structure

```
/home/eshan/arc/Arc/                          [1,246 MB total]
├── .env                                          [344 B]
├── .env.example                                  [4.2 KB]
├── .git/                                         [Git repository]
├── .gitignore                                    [195 B]
├── .ruff_cache/                                  [Ruff linter cache]
├── agents.md                                     [25 KB]     ← SDK docs
├── CHANGES.md                                    [8 KB]
├── LICENSE                                       [1 KB]
├── README.md                                     [7.5 KB]    ← Start here
├── SETUP.md                                      [4 KB]
├── SETUP_COMPLETE.md                             [5 KB]
├── SKILLS_CONFIG.md                              [2 KB]
├── START.cmd                                     [2 KB]
├── STARTUP.md                                    [3 KB]
├── start-separate.sh                             [Script]
├── start.sh                                      [3.5 KB]    ← Main start script
├── start_arc.ps1                                 [8.5 KB]    ← PowerShell
├── start_arc_simple.bat                          [Script]
│
├── backend/                                      [~240 MB]
│   ├── .venv/                                    [Virtual environment]
│   ├── .pytest_cache/                            [Test cache]
│   ├── .ruff_cache/                              [Linter cache]
│   ├── pyproject.toml                            [Python deps]
│   ├── README.md
│   ├── test_neon.py                              [Neon test]
│   ├── init_cloud_skills.py                      [Cloud init]
│   ├── start-dev-backend.sh                      [Dev script]
│   ├── src/                                      [Source code]
│   │   ├── __init__.py
│   │   ├── main.py                               [FastAPI entry]
│   │   ├── agent.py                              [Local agent config]
│   │   ├── agent_neon.py                         [Neon cloud config]
│   │   ├── agent_gcp.py                          [GCP config]
│   │   ├── agent_cloud.py                        [Generic cloud config]
│   │   ├── minimal_agent.py                      [Minimal agent]
│   │   ├── model_factory.py                      [LLM factory]
│   │   ├── routes.py                             [API routes]
│   │   ├── middleware.py                         [CORS/auth]
│   │   ├── prompt.py                             [Prompts]
│   │   ├── serialization.py                      [Serializers]
│   │   ├── skills_manager.py                     [Skills manager]
│   │   ├── tools/                                [Custom tools]
│   │   │   ├── __init__.py
│   │   │   ├── reflection.py                     [Memory tool]
│   │   │   ├── search.py                         [Web search]
│   │   │   └── vm_health.py                      [VM monitoring]
│   │   ├── subagents/                            [Sub-agent definitions]
│   │   │   ├── __init__.py
│   │   │   ├── researcher.py                     [Research subagent]
│   │   │   ├── coder.py                          [Coder subagent]
│   │   │   ├── uiux.py                           [UI/UX subagent]
│   │   │   └── doc_extraction.py                 [Doc extraction]
│   │   └── skills/                               [Skill implementations]
│   │       └── __init__.py
│   ├── tests/                                    [Test files]
│   └── workspace/                                [Backend workspace]
│
├── frontend/                                     [1,006 MB]
│   ├── .env.local                                [Local env]
│   ├── .env.production                           [Prod env]
│   ├── .next/                                    [243 MB - Build cache]
│   │   ├── cache/                                [195 MB]
│   │   ├── static/                               [25 MB]
│   │   └── server/                               [23 MB]
│   ├── app/                                      [App Router]
│   │   ├── layout.tsx                            [Root layout]
│   │   ├── page.tsx                              [Main page]
│   │   ├── globals.css                           [Styles]
│   │   ├── minimal/                              [Minimal page]
│   │   │   └── page.tsx
│   │   └── components/                           [UI Components - 18 files]
│   │       ├── AgentChat.tsx                     [★ Main chat interface]
│   │       ├── AgentMessage.tsx                  [Message bubbles]
│   │       ├── ArcMarkdown.tsx                   [Markdown renderer]
│   │       ├── CommandConduit.tsx                [Command palette]
│   │       ├── DecayStream.tsx                   [Message decay animation]
│   │       ├── DeepFocusOverlay.tsx             [Focus overlay]
│   │       ├── MarkdownContent.tsx               [Content rendering]
│   │       ├── OrbScene.tsx                      [★ 3D WebGL orb]
│   │       ├── OrbTopBar.tsx                     [Top nav bar]
│   │       ├── PlanConstellation.tsx            [Todo visualization]
│   │       ├── StatusBar.tsx                     [Connection status]
│   │       ├── TelemetryPanel.tsx               [System metrics]
│   │       ├── TodoPanel.tsx                     [Todo list panel]
│   │       ├── ToolCallCard.tsx                 [Tool execution cards]
│   │       ├── ToolCallLog.tsx                  [Tool history]
│   │       ├── ToolFilament.tsx                 [Tool animations]
│   │       └── types.ts                          [TypeScript types]
│   ├── eslint.config.mjs                         [ESLint config]
│   ├── next.config.mjs                           [Next.js config]
│   ├── next-env.d.ts                           [TypeScript declarations]
│   ├── node_modules/                            [763 MB - npm deps]
│   ├── package.json                             [★ Dependencies]
│   ├── package-lock.json                        [300 KB]
│   ├── postcss.config.mjs                       [PostCSS config]
│   └── tsconfig.json                            [TypeScript config]
│
└── workspace/                                    [16 KB → MB scale]
    ├── skills/                                   [Skill files]
    │   └── langgraph-patterns/
    └── memories/                                 [Persistent memory]
        ├── AGENTS.md                             [Project conventions]
        ├── VM_CONFIG.md                          [VM config reference]
        ├── FILESYSTEM_INDEX.md                  [Filesystem info]
        ├── FILESYSTEM_SCAN.md                   [Detailed scan]
        └── user_reflections.md                  [User learnings]
```

---

## Key Configuration Files

### Environment Variables (`.env`)
- `ARC_MODE=local|neon|gcp|r2` — Agent mode
- `OPENROUTER_API_KEY` — LLM access
- `LANGSMITH_API_KEY` — Observability
- `NEON_DATABASE_URL` — Cloud persistence
- `GCP_*` — Google Cloud settings

### Backend Python Deps (`pyproject.toml`)
- **Deep Agents SDK**: 0.4.12
- **LangGraph**: 1.1.3
- **LangChain**: OpenRouter, Anthropic, Google
- **FastAPI + Uvicorn**: API server
- **PostgreSQL**: Neon persistence

### Frontend NPM Deps (`package.json`)
- **Framework**: Next.js 15.x + React 19.x
- **Agent SDK**: deepagents 1.8.5 (TypeScript)
- **Animations**: Framer Motion + react-three/fiber
- **Styling**: Tailwind CSS + postcss
- **Markdown**: react-markdown + remark-gfm + rehype-highlight
- **Schema**: zod

---

## Startup Commands

### Quick Start
```bash
cd /home/eshan/arc/Arc
./start.sh              # Starts both backend (8000) and frontend (3000)
```

### Manual Start
```bash
# Backend
cd backend && uvicorn src.main:app --reload --port 8000

# Frontend  
cd frontend && npm run dev          # Uses Turbopack

# LangGraph Studio
cd backend && langgraph dev --allow-blocking
```

### Development
```bash
cd backend
pip install -e ".[dev]"             # Install dev dependencies
pytest                              # Run tests
ruff check .                        # Linting
```

---

## Architecture Notes

### Agent Modes
1. **local** — Uses local MemorySaver, no persistence
2. **neon** — PostgreSQL persistence via Neon
3. **gcp** — Google Cloud configuration
4. **r2** — R2 backend configuration

### Sub-Agent Types
- `coder` — Python/TypeScript code writing
- `researcher` — Web research, docs lookup  
- `uiux` — React/Next.js UI components
- `doc_extraction` — PDF/OCR/document processing

### Key Frontend Components
1. **AgentChat.tsx** (33KB!) — Main chat interface
2. **OrbScene.tsx** — 3D animated orb
3. **ArcMarkdown.tsx** — Markdown rendering (potential Mermaid hook point)
4. **TelemetryPanel.tsx** — System metrics display
5. **ToolCallCard.tsx** — Tool execution UI

### Memory System
- **Session**: `/memories/session/` (ephemeral)
- **Repository**: `/workspace/memories/` (project-level, persisted)
- **User**: `/memories/` (user preferences, persisted)

---

## Development Priorities (Inferred)

1. **Mermaid Diagram Support** — Hook into `ArcMarkdown.tsx` or `MarkdownContent.tsx`
2. **Visual Output** — Image generation/display capabilities
3. **Tool Reliability** — Error handling, timeouts, retries
4. **Context Management** — Better token management for long conversations
5. **UI Polish** — Mermaid rendering, streaming improvements

---

## URLs When Running

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Health | http://localhost:8000/ |
| LangGraph Studio | http://localhost:8100 (if dev mode) |

---

*Inventory complete. Use this as reference for Atlas Platform development.*
