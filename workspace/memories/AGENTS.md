# Arc Memory: Project Conventions

## Code Style

### Python
- Use type hints everywhere
- Ruff for linting (line length: 100)
- pytest for testing
- Follow PEP 8

### TypeScript/React
- Strict mode enabled
- No `any` types
- Functional components with hooks

## Architecture Decisions

1. **Backend**: FastAPI + Deep Agents SDK
2. **Frontend**: Next.js 15 App Router + Framer Motion
3. **Models**: OpenRouter with Kimi K2.5 default
4. **Persistence**: FilesystemBackend + MemorySaver

## Common Commands

```bash
# Backend
cd backend && uvicorn src.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# LangGraph Studio
cd backend && langgraph dev --allow-blocking
```

## Important Notes

- Always use absolute paths for file operations (start with `/`)
- Research before implementing (use researcher subagent)
- Write reflections after significant work
- Use write_todos for complex multi-step tasks
