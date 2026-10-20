"""Gemini client: one cached, timeout-bounded client per process.

Every caller must have an offline fallback: the app has to work with no key.
"""

import json
from functools import lru_cache

from app.config import get_settings


@lru_cache(maxsize=2)
def _client(api_key: str, timeout_ms: int):
    from google import genai

    return genai.Client(api_key=api_key, http_options={"timeout": timeout_ms})


def gemini_client():
    """Return a retained, timeout-bounded client for the current process."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return _client(settings.gemini_api_key, settings.gemini_timeout_seconds * 1_000)


def generate_json(prompt: str, timeout_seconds: int | None = None) -> dict | list:
    """One structured Gemini call that returns parsed JSON. Raises on any failure.
    `timeout_seconds` overrides the default for slow, longer jobs (e.g. writing proof-check questions)."""
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    client = gemini_client() if timeout_seconds is None else _client(settings.gemini_api_key, timeout_seconds * 1_000)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config={"response_mime_type": "application/json", "temperature": 0.2},
    )
    return json.loads(response.text)
