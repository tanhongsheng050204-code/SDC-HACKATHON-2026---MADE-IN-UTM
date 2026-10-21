"""RunPod Serverless: an open model for CV reading and Whisper for voice input.

Same pattern as llm.py: one timeout-bounded call that raises on any failure, so every caller
keeps its fallback. Timeouts are short on purpose: a cold start (10-60 s) should fall back to
the next option instead of leaving the person waiting.
"""

import base64
import json
from concurrent.futures import ThreadPoolExecutor

import httpx

from app.config import get_settings

_BASE = "https://api.runpod.ai/v2"
_CALLS = ThreadPoolExecutor(max_workers=4, thread_name_prefix="runpod")


def _post(url: str, **kwargs) -> httpx.Response:
    """httpx.post with a deadline on the whole call. RunPod holds the connection open while a
    worker cold-starts, so httpx's own timeout (per read) can let a request run for minutes.
    On the deadline this raises TimeoutError and the caller falls back; the abandoned request
    finishes in the background and warms the worker for the next person."""
    seconds = get_settings().runpod_timeout_seconds
    return _CALLS.submit(httpx.post, url, timeout=seconds, **kwargs).result(timeout=seconds)


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_settings().runpod_api_key}"}


def cv_model_available() -> bool:
    settings = get_settings()
    return bool(settings.runpod_api_key and settings.runpod_llm_endpoint)


def voice_available() -> bool:
    settings = get_settings()
    return bool(settings.runpod_api_key and settings.runpod_whisper_endpoint)


def generate_json(prompt: str) -> dict:
    """One chat call to the open model (a vLLM worker's OpenAI-compatible route) that returns
    parsed JSON. Raises on any failure."""
    settings = get_settings()
    if not cv_model_available():
        raise RuntimeError("RunPod CV model is not configured")
    response = _post(
        f"{_BASE}/{settings.runpod_llm_endpoint}/openai/v1/chat/completions",
        headers=_headers(),
        json={
            "model": settings.runpod_llm_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 800,
            "response_format": {"type": "json_object"},
        },
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    start, end = content.find("{"), content.rfind("}")  # some models wrap JSON in a code fence
    result = json.loads(content[start:end + 1] if start >= 0 else content)
    if not isinstance(result, dict):
        raise ValueError("The open model did not return a JSON object")
    return result


def transcribe(audio: bytes, language: str | None = None) -> str:
    """Speech to text with a faster-whisper worker. The audio is sent once and never stored.
    Raises on any failure."""
    settings = get_settings()
    if not voice_available():
        raise RuntimeError("RunPod voice is not configured")
    job = {"audio_base64": base64.b64encode(audio).decode("ascii"), "model": settings.runpod_whisper_model}
    if language:
        job["language"] = language
    response = _post(f"{_BASE}/{settings.runpod_whisper_endpoint}/runsync", headers=_headers(),
                     json={"input": job})
    response.raise_for_status()
    body = response.json()
    if body.get("status") != "COMPLETED":
        raise RuntimeError(f"Transcription {body.get('status', 'failed').lower()}")
    return str(body["output"]["transcription"]).strip()
