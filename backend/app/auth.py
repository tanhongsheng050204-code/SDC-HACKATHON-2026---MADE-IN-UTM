"""Who is calling: verifies the Supabase login token the browser sends.

Login happens in the browser (Supabase Auth with Google). The backend only checks the token and
reads the Supabase user id (`sub`) from it. No header means an anonymous visitor, which is still
allowed for anonymous and demo profiles; a bad or expired header is refused, never ignored, so a
stale session can't quietly act as anonymous on an owned profile.
"""

from functools import lru_cache

import jwt
from fastapi import Header, HTTPException

from app.config import get_settings

AUDIENCE = "authenticated"


@lru_cache(maxsize=2)
def _jwks(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def user_from_token(token: str) -> str:
    """The Supabase user id in a valid token. Raises jwt.InvalidTokenError otherwise."""
    settings = get_settings()
    if settings.supabase_jwt_secret:
        claims = jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience=AUDIENCE)
    elif settings.supabase_url:
        key = _jwks(f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json").get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=["RS256", "ES256"], audience=AUDIENCE)
    else:
        raise jwt.InvalidTokenError("Login is not configured on this server")
    if not claims.get("sub"):
        raise jwt.InvalidTokenError("Token has no user")
    return str(claims["sub"])


def current_user(authorization: str = Header(default="")) -> str | None:
    """FastAPI dependency: the caller's user id, or None for an anonymous visitor."""
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Please log in again")
    try:
        return user_from_token(token)
    except jwt.PyJWKClientError:
        # The key server is unreachable: not the person's fault, so don't sign them out.
        raise HTTPException(503, "Login check is unavailable right now. Try again shortly.") from None
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Please log in again") from None
