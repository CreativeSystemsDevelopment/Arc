"""
Model construction helpers for Arc.

Arc defaults to OpenRouter, but user env files may provide either
`openrouter:provider/model` or just `provider/model`.
"""

from __future__ import annotations

import os
from typing import Any

import openrouter
from langchain.chat_models import init_chat_model
from langchain_openrouter import ChatOpenRouter

DEFAULT_MODEL_PROVIDER = "openrouter"
DEFAULT_MODEL_NAME = "moonshotai/kimi-k2.5"
DEFAULT_MODEL_LABEL = f"{DEFAULT_MODEL_PROVIDER}:{DEFAULT_MODEL_NAME}"


def parse_model_spec(raw_model: str | None) -> tuple[str, str]:
    """Return a normalized `(provider, model_name)` tuple."""
    model_spec = (raw_model or "").strip()
    if not model_spec:
        return DEFAULT_MODEL_PROVIDER, DEFAULT_MODEL_NAME

    if ":" in model_spec:
        provider, model_name = model_spec.split(":", 1)
        provider = provider.strip().lower()
        model_name = model_name.strip()
        if provider and model_name:
            return provider, model_name

    return DEFAULT_MODEL_PROVIDER, model_spec


def current_model_label(raw_model: str | None = None) -> str:
    """Return the normalized provider-qualified model label."""
    provider, model_name = parse_model_spec(raw_model or os.environ.get("AGENT_MODEL"))
    return f"{provider}:{model_name}"


def build_chat_model() -> Any:
    """Build the configured chat model with Arc's OpenRouter defaults."""
    provider, model_name = parse_model_spec(os.environ.get("AGENT_MODEL"))
    max_retries = int(os.environ.get("AGENT_MAX_RETRIES", "10"))
    timeout = int(os.environ.get("AGENT_TIMEOUT", "120"))

    if provider == DEFAULT_MODEL_PROVIDER:
        manual_client = openrouter.OpenRouter(
            api_key=os.environ.get("OPENROUTER_API_KEY"),
            http_referer=os.environ.get("OPENROUTER_APP_URL"),
            x_open_router_title=os.environ.get("OPENROUTER_APP_TITLE"),
            server_url=os.environ.get("OPENROUTER_API_BASE"),
            timeout_ms=timeout * 1000,
        )
        return ChatOpenRouter(
            model_name=model_name,
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY"),
            openrouter_api_base=os.environ.get("OPENROUTER_API_BASE"),
            app_url=os.environ.get("OPENROUTER_APP_URL"),
            # Use a manual OpenRouter client so LangChain avoids its broken
            # client construction path for async/tool-enabled calls.
            app_title=None,
            client=manual_client,
            max_retries=max_retries,
            request_timeout=timeout,
        )

    return init_chat_model(
        model_name,
        model_provider=provider,
        max_retries=max_retries,
        timeout=timeout,
    )
