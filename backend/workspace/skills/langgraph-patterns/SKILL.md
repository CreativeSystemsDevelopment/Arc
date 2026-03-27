---
name: langgraph-patterns
description: Common LangGraph patterns for state management, checkpointing, and agent workflows. Use when implementing checkpoint savers, state reducers, persistence, or thread management in LangGraph.
---

# LangGraph Patterns

## Checkpoint Savers

### MemorySaver (Development)
```python
from langgraph.checkpoint.memory import MemorySaver
checkpointer = MemorySaver()
agent = create_deep_agent(checkpointer=checkpointer)
```

### PostgreSQL (Production - Neon)
```python
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string(
    "postgresql://user:pass@host.neon.tech/dbname?sslmode=require"
)
```

## Thread Management

```python
# Start/resume a thread
config = {"configurable": {"thread_id": "session-123"}}
result = agent.invoke(input, config=config)
```
