from __future__ import annotations

from src import model_factory


def test_parse_model_spec_defaults_to_openrouter_for_bare_models():
    provider, model_name = model_factory.parse_model_spec("moonshotai/kimi-k2.5")

    assert provider == "openrouter"
    assert model_name == "moonshotai/kimi-k2.5"


def test_current_model_label_normalizes_bare_model_names():
    assert (
        model_factory.current_model_label("moonshotai/kimi-k2.5")
        == "openrouter:moonshotai/kimi-k2.5"
    )


def test_build_chat_model_ignores_openrouter_app_title(monkeypatch):
    captured: dict[str, object] = {}

    class DummyOpenRouter:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setenv("AGENT_MODEL", "moonshotai/kimi-k2.5")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_APP_TITLE", "Arc: Deep Zero")
    monkeypatch.setenv("OPENROUTER_APP_URL", "https://arc.atlas-platform.cloud")
    monkeypatch.setattr(model_factory, "ChatOpenRouter", DummyOpenRouter)

    model_factory.build_chat_model()

    assert captured["model_name"] == "moonshotai/kimi-k2.5"
    assert captured["app_title"] is None
    assert captured["app_url"] == "https://arc.atlas-platform.cloud"


def test_build_chat_model_uses_explicit_non_openrouter_provider(monkeypatch):
    captured: dict[str, object] = {}

    def fake_init_chat_model(model_name: str, **kwargs):
        captured["model_name"] = model_name
        captured["kwargs"] = kwargs
        return "mock-model"

    monkeypatch.setenv("AGENT_MODEL", "anthropic:claude-sonnet-4-20250514")
    monkeypatch.setattr(model_factory, "init_chat_model", fake_init_chat_model)

    model = model_factory.build_chat_model()

    assert model == "mock-model"
    assert captured["model_name"] == "claude-sonnet-4-20250514"
    assert captured["kwargs"] == {"model_provider": "anthropic", "max_retries": 10, "timeout": 120}
