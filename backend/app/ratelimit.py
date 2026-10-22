"""Rate limits for endpoints that call an AI model or cost money: per IP address and per profile.

In memory, so it resets when the API restarts and assumes one instance (DECISIONS #38). A sliding
window of WINDOW_SECONDS: each bucket allows so many calls per IP and per profile in that window.
Over the limit, the API answers 429 with a plain message the app shows as it is.
"""

import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

WINDOW_SECONDS = 600  # ten minutes

# bucket: (calls per IP, calls per profile) in one window. None = not limited that way.
LIMITS: dict[str, tuple[int, int | None]] = {
    "coach": (60, 30),
    "interview": (60, 40),
    "cv": (20, None),            # CV text or file extraction and preview
    "voice": (30, None),
    "intake_turn": (60, None),   # the chat questionnaire
    "survey": (30, None),        # interpreting a free-text survey answer
    "checks": (30, None),        # proof-check questions (also limited per profile per hour)
    "identity": (30, 20),
    "search": (30, None),        # live job-ad and emerging-role web searches
    "feedback": (30, None),      # helpful buttons and problem reports
    "usage": (120, None),        # anonymous usage counts sent by the app
}

MESSAGE = "You're going a bit fast. Please wait a few minutes and try again."

_lock = threading.Lock()
_hits: dict[tuple[str, str, str], deque[float]] = {}


def client_ip(request: Request) -> str:
    """The caller's address. Behind Render's proxy the first X-Forwarded-For entry is the client;
    it can be faked, which is why AI endpoints are also limited per profile."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def _take(key: tuple[str, str, str], limit: int, now: float) -> float | None:
    """Record one call; return seconds to wait if the key is over its limit (and record nothing)."""
    hits = _hits.setdefault(key, deque())
    while hits and hits[0] <= now - WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= limit:
        return hits[0] + WINDOW_SECONDS - now
    hits.append(now)
    return None


def _prune(now: float) -> None:
    if len(_hits) < 5000:
        return
    for key in [k for k, v in _hits.items() if not v or v[-1] <= now - WINDOW_SECONDS]:
        del _hits[key]


def check(request: Request, bucket: str, profile_id: str | None = None) -> None:
    """Count one call to `bucket`, or raise 429 with Retry-After if this IP or profile is over."""
    per_ip, per_profile = LIMITS[bucket]
    now = time.monotonic()
    keys = [(bucket, "ip", client_ip(request), per_ip)]
    if profile_id and per_profile:
        keys.append((bucket, "profile", profile_id, per_profile))
    with _lock:
        _prune(now)
        for bucket_, kind, who, limit in keys:
            hits = _hits.get((bucket_, kind, who))
            if hits is not None:
                while hits and hits[0] <= now - WINDOW_SECONDS:
                    hits.popleft()
                if len(hits) >= limit:
                    wait = hits[0] + WINDOW_SECONDS - now
                    raise HTTPException(429, MESSAGE, headers={"Retry-After": str(max(1, math.ceil(wait)))})
        for bucket_, kind, who, limit in keys:
            _take((bucket_, kind, who), limit, now)


def reset() -> None:
    with _lock:
        _hits.clear()
