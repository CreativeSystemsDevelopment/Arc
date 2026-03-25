# Arc — Deep Agents Expert Guide

> **Purpose:** This file equips any AI agent working on the Arc project with expert-level knowledge of the Deep Agents SDK, LangGraph, and the full technology stack. Read this file completely before writing any code.

---

## 1. What Arc Is

Arc ("Archenemies Deep Agent") is a **deep agent** built with the LangChain **Deep Agents SDK**. It is designed for **complex, long-running, and open-ended tasks** — the class of problems that simple tool-calling loops fail at.

The full stack is:

| Layer | Technology | Version |
|---|---|---|
| Agent SDK | `deepagents` (Python) | 0.4.12 |
| Agent SDK | `deepagents` (TypeScript) | 0.0.1 |
| Orchestration | `langgraph` | 1.1.3 |
| LLM Framework | `langchain` | latest |
| Backend | Python | 3.11+ |
| Frontend | TypeScript + Next.js | 15.x |
| UI Animations | Framer Motion (`motion`) | 12.x |
| Observability | LangSmith | latest |

---

## 2. The Deep Agents SDK

### 2.1 What It Is

The **Deep Agents SDK** (`deepagents`) is an open-source, MIT-licensed, **batteries-included agent harness** published by LangChain. It is the official SDK for creating "deep" agents — agents that go far beyond a simple tool-calling loop.

> **Key insight:** Simple tool-calling agents are *shallow*. They fail at long, multi-step, open-ended tasks because they lack planning, memory management, and specialization. Applications like **Deep Research**, **Manus**, and **Claude Code** solved this by combining four primitives. Deep Agents packages those four primitives for you.

### 2.2 The Four Primitives

Every deep agent is built from exactly these four things:

| Primitive | What It Does |
|---|---|
| **Planning tool** (`write_todos`) | Breaks the task into steps, tracks progress, adapts the plan |
| **Sub-agents** (`task`) | Spawns isolated child agents with their own context windows |
| **File system tools** | `read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep` — offloads context to disk |
| **Detailed system prompt** | Teaches the model exactly how and when to use the above tools |

### 2.3 Why This Works

Context window overflow is the primary failure mode of shallow agents. The file system tools allow the agent to *write to disk and read back only what is needed*, keeping the active context small. Sub-agents provide **context isolation** — the main agent stays clean while a child agent goes deep on a sub-problem. The planning tool keeps the agent on track across many steps.

---

## 3. Python SDK Reference (`deepagents` v0.4.12)

**Install:**
```bash
pip install deepagents
# or
uv add deepagents
```

**Official docs:** https://docs.langchain.com/oss/python/deepagents/overview  
**API reference:** https://reference.langchain.com/python/deepagents/  
**GitHub:** https://github.com/langchain-ai/deepagents  
**PyPI:** https://pypi.org/project/deepagents/

### 3.1 Quickstart

```python
from deepagents import create_deep_agent

# Zero-config — uses claude-sonnet-4-5-20250929 by default
agent = create_deep_agent()
result = agent.invoke({
    "messages": [{"role": "user", "content": "Research LangGraph and write a summary"}]
})
```

`create_deep_agent()` returns a **compiled LangGraph graph**. Use it with streaming, LangGraph Studio, checkpointers, or any LangGraph feature.

### 3.2 Full API — `create_deep_agent()`

```python
from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent

agent = create_deep_agent(
    model=init_chat_model("openai:gpt-4o"),   # Any LangChain chat model
    tools=[my_custom_tool],                    # Additional tools
    system_prompt="You are a research assistant.",  # Appended to default prompt
    subagents=[...],                           # Custom sub-agents (see §3.4)
    middleware=[...],                          # AgentMiddleware extensions
    skills=["/path/to/skills/"],               # Skill directories
)
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | `LanguageModelLike \| str` | `"claude-sonnet-4-5-20250929"` | Any LLM that supports tool calling |
| `tools` | `list[BaseTool]` | `[]` | Custom tools added on top of built-ins |
| `system_prompt` | `str` | `""` | Appended to the deep agent's default prompt |
| `subagents` | `list[SubAgent]` | `[default_subagent]` | Custom sub-agents the main agent can spawn |
| `middleware` | `list[AgentMiddleware]` | `[]` | Middleware for extending agent behavior |
| `skills` | `list[str]` | `[]` | Paths to skill files loaded into the agent |

### 3.3 Built-in Tools

The following tools are automatically included in every deep agent:

| Tool | Purpose |
|---|---|
| `write_todos` | Plan and track tasks — write a list of todos, mark them done |
| `read_file` | Read a file from the virtual file system |
| `write_file` | Write content to a file |
| `edit_file` | Edit a section of a file in place |
| `ls` | List directory contents |
| `glob` | Find files matching a pattern |
| `grep` | Search file contents for a pattern |
| `execute` | Run shell commands (sandboxed) |
| `task` | Spawn a sub-agent with an isolated context window |

### 3.4 Sub-Agents

Sub-agents are the main scaling mechanism. The main agent spawns them via the `task` tool to:
- Isolate context (prevents context pollution in the parent)
- Specialize in a sub-problem
- Run deeply on one piece without exposing everything to the main agent

**Define custom sub-agents:**

```python
from deepagents import create_deep_agent, SubAgent

researcher = SubAgent(
    name="researcher",
    description="Expert at web research and summarizing information",
    system_prompt="You are an expert researcher. Search the web and produce thorough reports.",
    tools=[tavily_search_tool],
    model="openai:gpt-4o",
)

coder = SubAgent(
    name="coder",
    description="Expert at writing and debugging Python and TypeScript code",
    system_prompt="You are an expert software engineer. Write clean, tested code.",
    tools=[execute_tool],
)

agent = create_deep_agent(
    subagents=[researcher, coder],
    system_prompt="You are Arc, a deep agent for complex tasks.",
)
```

**Skills inheritance:**
- The **general-purpose sub-agent** (always present) inherits all skills from the main agent.
- **Custom sub-agents** do NOT inherit main-agent skills — you must pass `skills=[...]` explicitly to each one that needs them.

### 3.5 Middleware

```python
from langchain.agents import AgentMiddleware
from deepagents import create_deep_agent

class LoggingMiddleware(AgentMiddleware):
    tools = [my_logging_tool]

agent = create_deep_agent(middleware=[LoggingMiddleware()])
```

### 3.6 MCP Support

The Deep Agents SDK supports the **Model Context Protocol (MCP)** via `langchain-mcp-adapters`:

```python
pip install langchain-mcp-adapters
```

---

## 4. TypeScript SDK Reference (`deepagents` v0.0.1)

**Install:**
```bash
npm install deepagents
# or
yarn add deepagents
# or
pnpm add deepagents
```

**Official docs:** https://docs.langchain.com/oss/javascript/deepagents/quickstart  
**GitHub:** https://github.com/langchain-ai/deepagentsjs

### 4.1 Quickstart

```typescript
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent();
const result = await agent.invoke({
  messages: [{ role: "user", content: "Research LangGraph and write a summary" }],
});
```

### 4.2 Full API — `createDeepAgent()`

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { createDeepAgent, type SubAgent } from "deepagents";

const agent = createDeepAgent({
  model: new ChatAnthropic({ model: "claude-sonnet-4-20250514", temperature: 0 }),
  tools: [myCustomTool],
  systemPrompt: "You are Arc, a deep agent for complex open-ended tasks.",
  subagents: [researchAgent, coderAgent],
  middleware: [new MyMiddleware()],
  skills: ["/skills/"],
});
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | `LanguageModelLike \| string` | `"claude-sonnet-4-5-20250929"` | LangChain chat model or model string |
| `tools` | `StructuredTool[]` | `[]` | Additional tools |
| `systemPrompt` | `string` | `""` | Appended to the default system prompt |
| `subagents` | `SubAgent[]` | `[default_subagent]` | Custom sub-agents |
| `middleware` | `AgentMiddleware[]` | `[]` | Middleware extensions |
| `skills` | `string[]` | `[]` | Skill source paths |

### 4.3 SubAgent Interface (TypeScript)

```typescript
interface SubAgent {
  name: string;                              // How the main agent refers to it
  description: string;                       // Shown to the main agent for routing
  systemPrompt: string;                      // The sub-agent's own prompt
  tools?: StructuredTool[];                  // Sub-agent's tool set
  model?: LanguageModelLike | string;        // Optional model override
  middleware?: AgentMiddleware[];            // Sub-agent middleware
  interruptOn?: Record<string, boolean | InterruptOnConfig>;  // HITL hooks
  skills?: string[];                         // Explicit skills (not inherited)
}
```

### 4.4 Streaming

```typescript
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({ systemPrompt: "You are Arc." });

for await (const chunk of agent.stream({
  messages: [{ role: "user", content: "Plan and build a feature" }],
})) {
  console.log(chunk);
}
```

---

## 5. LangGraph Integration (v1.1.3)

`create_deep_agent()` / `createDeepAgent()` returns a **compiled LangGraph `StateGraph`**. This means you get all LangGraph features for free.

### 5.1 Key LangGraph Concepts

**StateGraph:** The core primitive. Nodes are computation steps; edges are control flow. State is typed (TypedDict in Python, interface in TypeScript) and persisted.

```python
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

class AgentState(TypedDict):
    messages: list
    todos: list[str]
    context_files: dict[str, str]
```

**Checkpointing / Durable Execution:**
```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
agent = create_deep_agent().compile(checkpointer=checkpointer)

# Resume from exactly where you left off after failure
result = agent.invoke(input, config={"configurable": {"thread_id": "arc-session-1"}})
```

**Human-in-the-loop:**
```python
from langgraph.types import interrupt

def approval_node(state):
    response = interrupt({"question": "Approve this action?", "action": state["pending_action"]})
    return {"approved": response == "yes"}
```

**Streaming modes (v1.1.3):**
```python
# Stream values (full state at each step)
for chunk in agent.stream(input, stream_mode="values"):
    print(chunk)

# Stream updates (delta at each step — preferred for large states)
for chunk in agent.stream(input, stream_mode="updates"):
    print(chunk)

# Stream tokens
async for chunk in agent.astream(input, stream_mode="messages"):
    print(chunk)
```

**Type-safe streaming (v1.1.3 new feature — opt-in):**
```python
agent = create_deep_agent().compile(version="v2")  # opt-in type-safe mode
```

**StateSchema (new in v1.1.3):**
```python
from langgraph.graph import StateSchema
from langgraph.types import ReducedValue, UntrackedValue

class ArcState(StateSchema):
    messages: list                  # Tracked, reduces with append
    scratchpad: UntrackedValue[str] # Ephemeral, not in checkpoints
    plan: ReducedValue[list, lambda a, b: a + b]  # Custom reducer
```

### 5.2 Persistence Backends

```python
# Local development
from langgraph.checkpoint.memory import MemorySaver
checkpointer = MemorySaver()

# Production (PostgreSQL)
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string(os.environ["DATABASE_URL"])
```

---

## 6. LangChain Integration

LangChain provides the model integrations and tool primitives used by Deep Agents.

**Model initialization (provider-agnostic):**
```python
from langchain.chat_models import init_chat_model

model = init_chat_model("openai:gpt-4o")          # OpenAI
model = init_chat_model("anthropic:claude-opus-4") # Anthropic
model = init_chat_model("google_genai:gemini-2.5-pro") # Google
```

**Tool definition:**
```python
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """Search the web for current information."""
    # implementation
    return results
```

**MCP tool adapters:**
```python
from langchain_mcp_adapters.client import MultiServerMCPClient

async with MultiServerMCPClient({"filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/"]}}) as client:
    tools = client.get_tools()
    agent = create_deep_agent(tools=tools)
```

---

## 7. Next.js 15 Frontend

Arc's frontend is built with **Next.js 15** (App Router) + **React 19** + **Framer Motion 12**.

### 7.1 Key Next.js 15 Features Used

| Feature | Usage in Arc |
|---|---|
| App Router | File-based routing under `app/` |
| React Server Components | Data-fetching nodes (agent status, history) |
| Server Actions | Trigger agent runs from the UI |
| Streaming / Suspense | Stream agent token output to the UI in real time |
| Turbopack | Default bundler — `next dev --turbopack` |
| Partial Prerendering (PPR) | Fast initial paint + dynamic agent state |
| Async Request APIs | `cookies()`, `headers()` are async in v15 |

### 7.2 Framer Motion 12

```tsx
"use client";
import { motion, AnimatePresence } from "framer-motion";

// Fade-in message bubble
export function AgentMessage({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg bg-zinc-900 p-4 text-white"
    >
      {content}
    </motion.div>
  );
}

// Staggered list of tool calls
export function ToolCallList({ calls }: { calls: string[] }) {
  return (
    <motion.ul
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      initial="hidden"
      animate="show"
    >
      {calls.map((c) => (
        <motion.li
          key={c}
          variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
        >
          {c}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

**Important:** All Framer Motion components must be in `"use client"` files. Only import from `framer-motion` or `motion` (both are maintained and interchangeable at v12).

---

## 8. Environment Variables

Every Arc environment requires:

```env
# LLM Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Web search (for research sub-agent)
TAVILY_API_KEY=tvly-...

# LangSmith observability (strongly recommended)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=arc

# Backend API
BACKEND_URL=http://localhost:8000

# Database (production only)
DATABASE_URL=postgresql://...
```

---

## 9. Architecture of Arc

```
┌─────────────────────────────────────────────────────────────────┐
│                        Arc Architecture                          │
├──────────────────────────┬──────────────────────────────────────┤
│  Frontend (Next.js 15)   │  Backend (Python / FastAPI)          │
│                          │                                       │
│  app/                    │  backend/                             │
│  ├─ page.tsx             │  ├─ agent.py          ← deep agent   │
│  ├─ layout.tsx           │  ├─ tools/            ← custom tools │
│  └─ components/          │  ├─ subagents/        ← sub-agents   │
│     ├─ AgentChat.tsx     │  ├─ skills/           ← skill files  │
│     ├─ ToolCallLog.tsx   │  └─ main.py           ← FastAPI app  │
│     └─ StatusBar.tsx     │                                       │
│                          │  deepagents SDK (v0.4.12)            │
│  deepagents (TS v0.0.1)  │  langgraph (v1.1.3)                  │
│  framer-motion (v12)     │  langchain (latest)                   │
└──────────────────────────┴──────────────────────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   LangSmith         │
                          │   (observability)   │
                          └────────────────────┘
```

**Data flow for a single user request:**
1. User types a message in the Next.js UI
2. A Next.js Server Action sends it to the Python FastAPI backend
3. The backend's `create_deep_agent()` graph is invoked
4. The main agent calls `write_todos` to plan
5. Complex sub-tasks are delegated via `task` to sub-agents
6. Results are written to files; the main agent reads back what it needs
7. The final response is streamed back to the frontend via SSE
8. Framer Motion animates each token/tool-call into the UI

---

## 10. Development Rules for Arc

When working on this codebase, always follow these rules:

1. **The agent is the source of truth** — All business logic lives in the agent graph, not in the API layer.
2. **Use `write_todos` first** — Any complex task the agent starts must begin with a call to `write_todos`. This is non-negotiable.
3. **Sub-agents for isolation** — Any subtask that involves deep work (e.g., web research, code generation) must be delegated to a sub-agent, not run inline.
4. **Files as memory** — Large tool results must be written to files immediately. The agent must never hold more than ~20k tokens of tool output in active context.
5. **Stream everything** — All agent invocations from the frontend must use streaming. Never block on a full response.
6. **LangSmith always on** — Set `LANGCHAIN_TRACING_V2=true` in all environments including development.
7. **Provider-agnostic models** — Always use `init_chat_model("provider:model-name")` syntax. Never hardcode a specific SDK import.
8. **`"use client"` for animations** — All Framer Motion code must be in client components. Server components handle data only.

---

## 11. Key Links

| Resource | URL |
|---|---|
| Deep Agents Python docs | https://docs.langchain.com/oss/python/deepagents/overview |
| Deep Agents Python API ref | https://reference.langchain.com/python/deepagents/ |
| Deep Agents Python GitHub | https://github.com/langchain-ai/deepagents |
| Deep Agents TS GitHub | https://github.com/langchain-ai/deepagentsjs |
| Deep Agents TS quickstart | https://docs.langchain.com/oss/javascript/deepagents/quickstart |
| LangGraph Python docs | https://docs.langchain.com/oss/python/langgraph/overview |
| LangGraph JS docs | https://docs.langchain.com/oss/javascript/langgraph/overview |
| LangGraph GitHub | https://github.com/langchain-ai/langgraph |
| LangChain Python docs | https://docs.langchain.com/oss/python/langchain/overview |
| LangSmith | https://smith.langchain.com |
| LangGraph Studio | https://docs.langchain.com/oss/python/langgraph/studio |
| Next.js 15 docs | https://nextjs.org/docs |
| Framer Motion docs | https://www.framer.com/motion/ |

---

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---|---|---|---|
| Backend (FastAPI) | `cd backend && python3 -m uvicorn src.main:app --reload --port 8000` | 8000 | Requires `ANTHROPIC_API_KEY` (or another LLM provider key) env var |
| Frontend (Next.js) | `cd frontend && npm run dev` | 3000 | Turbopack-based dev server |

### Gotchas

- **`pyproject.toml` hatch build config**: The backend's `pyproject.toml` needs `[tool.hatch.build.targets.wheel] packages = ["src"]` for editable installs to work. Without it, `pip install -e ".[dev]"` fails because hatchling can't auto-detect the package layout.
- **`next.config.mjs` PPR**: The `experimental.ppr` option requires `next@canary`. On stable Next.js 15.x, it must be commented out or removed to avoid build/lint errors.
- **ESLint config**: The frontend needs an `eslint.config.mjs` file for `next lint` to work non-interactively. Without it, the CLI prompts for setup interactively and blocks.
- **Backend module-level agent init**: The `arc_agent` singleton in `src/agent.py` is built at import time. The backend server will start successfully with dummy API keys, but actual LLM calls will fail without valid keys.
- **PATH for pip-installed tools**: Tools installed via `pip install --user` (e.g., `uvicorn`, `ruff`, `pytest`) end up in `~/.local/bin`. Ensure this is on `PATH`.
- **No lock files**: Neither `package-lock.json` nor `uv.lock` exist. Dependency resolution happens fresh on each install.

### Lint / Test / Build commands

See `README.md` for full setup. Quick reference:

- **Backend lint**: `cd backend && ruff check .` (auto-fix: `ruff check --fix .`)
- **Backend tests**: `cd backend && python3 -m pytest`
- **Frontend lint**: `cd frontend && npx next lint`
- **Frontend build**: `cd frontend && npm run build`

### Required secrets for end-to-end agent usage

At minimum `ANTHROPIC_API_KEY` must be set as an environment variable. See `.env.example` for the full list. Copy to `.env` and fill in values.
