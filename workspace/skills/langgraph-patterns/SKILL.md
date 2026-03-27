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

### PostgreSQL (Production)

```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver.from_conn_string(
    "postgresql://user:password@localhost:5432/db"
)
```

## Thread Management

```python
# Start a new thread
config = {"configurable": {"thread_id": "session-123"}}
result = agent.invoke(input, config=config)

# Resume existing thread
result = agent.invoke(new_input, config=config)  # Same thread_id
```

## State Reducers

```python
from typing import Annotated
from operator import add

class AgentState(TypedDict):
    messages: Annotated[list, add]  # Append reducer
    counter: int  # Replace reducer (default)
```

## Human-in-the-Loop Pattern

```python
from langgraph.types import interrupt

def human_approval_node(state):
    result = interrupt({
        "question": "Approve this action?",
        "action": state["pending_action"]
    })
    return {"approved": result == "yes"}
```
