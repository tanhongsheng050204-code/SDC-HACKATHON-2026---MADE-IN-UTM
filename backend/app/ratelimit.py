"""Rate limits for endpoints that call an AI model or cost money: per IP address and per profile.

Kept in the database (table rate_hits), so limits hold across restarts and across more than one
API instance; each hit stores a salted hash of the IP or profile, never the value, and is deleted
after the window. A sliding window of WINDOW_SECONDS: each bucket allows so many calls per IP and
per profile in that window.
Over the limit, the API answers 429 with a plain message the app shows as it is.
"""

import hashlib
import hmac
import math
import secrets
import time

from fastapi import HTTPException, Request

from app import store
from app.config import get_settings

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
    "join": (20, None),          # class codes looked up or joined, so codes can't be guessed
}

# Everyone together, per window: a backstop for the AI calls that cost money, because an address
# in X-Forwarded-For can be faked. Generous enough for a busy demo day (about one call a second).
GLOBAL: dict[str, int] = {"coach": 600, "interview": 600, "cv": 300, "voice": 300, "intake_turn": 600, "survey": 300,
                          "checks": 300, "identity": 300, "search": 300}

MESSAGE = "You're going a bit fast. Please wait a few minutes and try again."

_PROCESS_SALT = secrets.token_bytes(32)


def _hash(kind: str, who: str) -> str:
    """A keyed hash (HMAC-SHA256), so the table never holds an IP address or profile ID. The key is
    RATE_LIMIT_SALT, shared by every instance so limits hold across restarts; without it each
    process uses a random key of its own (limits then reset when the process restarts)."""
    key = get_settings().rate_limit_salt.encode() or _PROCESS_SALT
    return hmac.new(key, f"{kind}|{who}".encode(), hashlib.sha256).hexdigest()[:32]


def client_ip(request: Request) -> str:
    """The caller's address. Behind Render's proxy the first X-Forwarded-For entry is the client;
    it can be faked, which is why AI endpoints are also limited per profile."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def check(request: Request, bucket: str, profile_id: str | None = None) -> None:
    """Count one call to `bucket`, or raise 429 with Retry-After if this IP or profile is over."""
    per_ip, per_profile = LIMITS[bucket]
    keys = [(bucket, _hash("ip", client_ip(request)), per_ip)]
    if profile_id and per_profile:
        keys.append((bucket, _hash("profile", profile_id), per_profile))
    if bucket in GLOBAL:
        keys.append((bucket, "all", GLOBAL[bucket]))
    wait = store.rate_take(keys, time.time(), WINDOW_SECONDS)
    if wait is not None:
        raise HTTPException(429, MESSAGE, headers={"Retry-After": str(max(1, math.ceil(wait)))})


def reset() -> None:
    store.rate_reset()
