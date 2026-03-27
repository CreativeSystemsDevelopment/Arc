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
4. **Persistence**: Neon PostgreSQL (cloud) - FALLBACK TO LOCAL

## Current Mode
WARNING: Running in LOCAL FALLBACK MODE - Cloud storage is unavailable.
Skills and memories are stored locally and will not sync across devices.

## Important Notes

- Always use absolute paths for file operations (start with `/`)
- Research before implementing (use researcher subagent)
- Write reflections after significant work
- Use write_todos for complex multi-step tasks
