"""Gemini client: one cached, timeout-bounded client per process.

Every caller must have an offline fallback: the app has to work with no key.
"""

import json
from functools import lru_cache

from app.config import get_settings


@lru_cache(maxsize=4)  # default, proof checks, grounded search
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


GROUNDED_TIMEOUT_SECONDS = 180  # a job-ad search takes about 25 s; an emerging-role search up to 2 minutes


def generate_grounded_json(prompt: str) -> tuple[dict, list[dict]]:
    """One Gemini call with Google Search grounding. Returns the parsed JSON object and the web
    sources Google says it used ({"title", "uri"}; the title is usually the site's domain).
    JSON mode cannot be combined with search, so the object is cut out of the text. Raises on any
    failure."""
    from google.genai import types

    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    # Keep the client in a variable for the whole call: a client that is only a temporary closes its
    # connection when garbage-collected, mid-request, which broke parallel searches.
    client = _client(settings.gemini_api_key, GROUNDED_TIMEOUT_SECONDS * 1_000)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())],
                                           temperature=0.2),
    )
    text = response.text or ""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("The search answer contained no JSON object")
    result = json.loads(text[start:end + 1])
    if not isinstance(result, dict):
        raise ValueError("The search answer was not a JSON object")
    metadata = response.candidates[0].grounding_metadata if response.candidates else None
    sources = [{"title": c.web.title or "", "uri": c.web.uri or ""}
               for c in (getattr(metadata, "grounding_chunks", None) or []) if c.web]
    return result, sources
