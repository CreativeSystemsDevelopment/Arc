from src.middleware import ARC_MIDDLEWARE


def test_arc_tool_middleware_exposes_async_hooks():
    for middleware in ARC_MIDDLEWARE:
        assert callable(getattr(middleware, "awrap_tool_call", None))
