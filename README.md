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
| Backend | Python + FastAPI | 3.11+ |
| Frontend | Next.js (App Router) | 15.x |
| Animations | Framer Motion | 12.x |
| Observability | LangSmith | latest |

## Project Structure

```
Arc/
├── agents.md              ← Expert guide on the Deep Agents SDK (read this first)
├── .env.example           ← Environment variable template
├── backend/               ← Python FastAPI + deepagents backend
│   ├── pyproject.toml
│   └── src/
│       ├── agent.py       ← Core deep agent (create_deep_agent)
│       ├── routes.py      ← FastAPI streaming endpoints
│       ├── main.py        ← App entry point
│       ├── tools/         ← Custom tools (e.g. web search)
│       ├── subagents/     ← Sub-agent definitions (researcher, coder)
│       └── skills/        ← Skill files for the agent
└── frontend/              ← Next.js 15 + Framer Motion UI
    ├── package.json
    ├── next.config.mjs
    └── app/
        ├── layout.tsx
        ├── page.tsx
        └── components/    ← AgentChat, AgentMessage, StatusBar, ToolCallLog
```

## Setup

### 1. Copy environment variables

```bash
cp .env.example .env
# Fill in your API keys in .env
```

### 2. Backend (Python)

```bash
cd backend
# Using uv (recommended)
uv venv && source .venv/bin/activate
uv sync

# Or pip
pip install -e ".[dev]"

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

## Required API Keys

| Key | Purpose | Get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Default LLM | [console.anthropic.com](https://console.anthropic.com) |
| `TAVILY_API_KEY` | Web search (researcher sub-agent) | [tavily.com](https://tavily.com) |
| `LANGCHAIN_API_KEY` | LangSmith observability | [smith.langchain.com](https://smith.langchain.com) |

See `.env.example` for the full list.

## Documentation

- **[`agents.md`](./agents.md)** — Expert guide on the Deep Agents SDK, LangGraph, and this project's architecture. Read before writing any code.
- [Deep Agents Python docs](https://docs.langchain.com/oss/python/deepagents/overview)
- [Deep Agents TS quickstart](https://docs.langchain.com/oss/javascript/deepagents/quickstart)
- [LangGraph docs](https://docs.langchain.com/oss/python/langgraph/overview)
- [Next.js 15 docs](https://nextjs.org/docs)
