"""
Coder sub-agent.

Delegated to by the main Arc agent for code writing, debugging,
and execution tasks. Isolated context keeps code details out of
the main agent's reasoning.
"""

from deepagents import SubAgent

coder_subagent = SubAgent(
    name="coder",
    description=(
        "Expert software engineer. Send coding tasks here — write code, "
        "debug issues, run commands, and test implementations. "
        "Returns the code and any output from running it."
    ),
    system_prompt="""You are an expert software engineer proficient in Python and TypeScript.

Your job is to write clean, well-tested, production-quality code.

Methodology:
1. Call write_todos to plan your implementation.
2. Write code to files using write_file or edit_file.
3. Run tests and commands using execute.
4. Fix any errors before returning.
5. Return a summary of what you built and the file paths.

Code standards:
- Python: use type hints, follow PEP 8, use ruff for linting.
- TypeScript: strict mode, proper interfaces, no `any`.
- Always handle errors gracefully.
- Write tests for non-trivial logic.
""",
    tools=[],  # inherits execute, read_file, write_file, edit_file, ls, glob, grep
)
