# Arc — Archenemies Deep Agent

> Complex, long-running, and open-ended tasks — solved by a deep agent.

Arc is built on the **[Deep Agents SDK](https://github.com/langchain-ai/deepagents)** by LangChain — the batteries-included agent harness that combines planning, sub-agent spawning, file system context management, and detailed prompts into a production-ready LangGraph graph.

## Stack

| Layer | Technology | Version |
|---|---|---|
| Agent SDK | `deepagents` (Python) | 0.4.12 |
| Agent SDK | `deepagents` (TypeScript) | 0.0.1 |
| Orchestration | `langgraph` | 1.1.3 |
| LLM Framework | `langchain` | latest |
| LLM Provider | OpenRouter | — |
| Default Model | `moonshotai/kimi-k2.5` | — |
| Backend | Python + FastAPI | 3.11+ |
| Frontend | Next.js (App Router) | 15.x |
| Animations | Framer Motion | 12.x |
| Observability | LangSmith | latest |
| Persistence | Neon PostgreSQL | Cloud |

## Project Structure

```
Arc/
├── agents.md              ← Expert guide on the Deep Agents SDK (read this first)
├── .env                   ← Your local environment variables
├── .env.example           ← Environment variable template
├── workspace/             ← Persistent file storage
│   ├── skills/           ← Skill files (synced in cloud mode)
│   └── memories/         ← Memory files (persistent context)
├── backend/               ← Python FastAPI + deepagents backend
│   ├── pyproject.toml
│   └── src/
│       ├── agent.py       ← Core deep agent (create_deep_agent)
│       ├── agent_neon.py  ← Neon cloud configuration
│       ├── agent_gcp.py   ← Google Cloud configuration
│       ├── main.py        ← App entry point with mode switching
│       ├── routes.py      ← FastAPI streaming endpoints
│       ├── tools/         ← Custom tools (e.g. web search)
│       ├── subagents/     ← Sub-agent definitions (researcher, coder)
│       └── skills/        ← Skill files for the agent
└── frontend/              ← Next.js 15 + Framer Motion + Three.js UI
    ├── package.json
    ├── next.config.mjs
    ├── globals.css          # Custom styling
    └── app/
        ├── layout.tsx       # Root layout with fonts
        ├── page.tsx         # Main page (renders AgentChat)
        └── components/      # 18 sophisticated UI components
            ├── AgentChat.tsx          # Main chat interface (33KB!)
            ├── AgentMessage.tsx       # Message bubbles
            ├── ArcMarkdown.tsx        # Markdown renderer
            ├── CommandConduit.tsx     # Command palette UI
            ├── DecayStream.tsx        # Message decay animation
            ├── DeepFocusOverlay.tsx   # Focus mode overlay
            ├── MarkdownContent.tsx    # Content rendering
            ├── OrbScene.tsx           # 3D WebGL animated orb
            ├── OrbTopBar.tsx          # Top navigation bar
            ├── PlanConstellation.tsx  # Todo/plan visualization
            ├── StatusBar.tsx          # Connection status
            ├── TelemetryPanel.tsx     # System metrics panel
            ├── TodoPanel.tsx          # Todo list panel
            ├── ToolCallCard.tsx       # Tool execution cards
            ├── ToolCallLog.tsx        # Tool history log
            ├── ToolFilament.tsx       # Tool animation effects
            └── types.ts               # TypeScript definitions
```

## Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your keys
```

### 2. Backend (Python)

```bash
cd backend

# Install dependencies
pip install -e ".[dev]"

# Test Neon connection (if using cloud mode)
python test_neon.py

# Start the API server
uvicorn src.main:app --reload --port 8000
```

### 3. Frontend (Next.js 15)

```bash
cd frontend
npm install
npm run dev   # starts on http://localhost:3000
```

### 4. LangGraph Studio (optional — visual graph debugging)

```bash
cd backend
langgraph dev --allow-blocking
# Open: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

## Configuration Modes

### Local Mode (Default)

Uses local filesystem and in-memory storage. Data is lost on restart.

```bash
# In .env
ARC_MODE=local
```

### Neon Cloud Mode (Recommended)

Uses Neon PostgreSQL for persistent storage across devices.

```bash
# In .env
ARC_MODE=neon
NEON_DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
```

**Benefits:**
- Resume conversations from any device
- Skills sync automatically
- Memory persists across sessions
- Team collaboration support
- Automatic fallback to local if cloud is unreachable

**Setup:**
1. Sign up at https://neon.tech
2. Create a new project
3. Copy the connection string from Dashboard → Connection Details
4. Paste into `.env`

**Fallback Behavior:**
If Neon is unreachable, the agent automatically:
- Displays a clear notification: "CLOUD STORAGE UNAVAILABLE"
- Falls back to local storage for skills and memories
- Continues operating normally (just without cloud sync)

To force local mode, simply unset `NEON_DATABASE_URL` or disconnect from internet.

## Required API Keys

| Key | Purpose | Get it |
|---|---|---|
| `OPENROUTER_API_KEY` | Kimi K2.5 LLM | [openrouter.ai](https://openrouter.ai) |
| `NEON_DATABASE_URL` | Cloud persistence | [neon.tech](https://neon.tech) |
| `TAVILY_API_KEY` | Web search (researcher sub-agent) | [tavily.com](https://tavily.com) |
| `LANGCHAIN_API_KEY` | LangSmith observability | [smith.langchain.com](https://smith.langchain.com) |

See `.env.example` for the full list.

## Testing Neon Connection

```bash
cd backend
python test_neon.py
```

This verifies:
- Store connection (skills/memory)
- Checkpointer connection (thread persistence)
- Read/write operations

## Documentation

- **[`agents.md`](./agents.md)** — Expert guide on the Deep Agents SDK, LangGraph, and this project's architecture. Read before writing any code.
- [Deep Agents Python docs](https://docs.langchain.com/oss/python/deepagents/overview)
- [Deep Agents TS quickstart](https://docs.langchain.com/oss/javascript/deepagents/quickstart)
- [LangGraph docs](https://docs.langchain.com/oss/python/langgraph/overview)
- [Next.js 15 docs](https://nextjs.org/docs)

## Features

### Deep Agent Capabilities

- **Planning** — `write_todos` tool for task breakdown
- **Sub-agents** — Researcher, Coder, Doc Extraction, UI/UX agents
- **File System** — Read, write, edit, list, search files
- **Web Search** — Tavily integration for research
- **Human-in-the-Loop** — Approval for destructive operations
- **Reflection** — Self-improvement through reflection and skill creation

### Cloud Features (Neon Mode)

- **Thread Persistence** — Resume conversations anywhere
- **Skills Sync** — Skills available on all devices
- **Memory Storage** — Persistent project context
- **Cross-Device Access** — Same agent state everywhere

## Development Rules

1. **Use `write_todos` first** — Any complex task must begin with planning
2. **Research before implementing** — Delegate to researcher subagent
3. **Files as memory** — Large results go to files, not context
4. **Stream everything** — Frontend uses SSE for real-time updates
5. **LangSmith always on** — Tracing enabled in all environments
