"""Request logging, security headers and optional error tracking, none of which records personal data.

Each request is logged as one JSON line: method, the route *template* (/api/profiles/{profile_id},
never the ID itself), status and duration. No IP address, query string, header or body.

Sentry is switched on only when SENTRY_DSN is set. Events are stripped before they leave: no
request body, headers, cookies, query string or user, no local variables, no breadcrumbs, and the
exception text goes through deid.scrub().
"""

import json
import logging
import re
import time

from fastapi import FastAPI, Request

from app.config import Settings

log = logging.getLogger("laluan.request")

# The API only returns JSON, so its pages may load nothing and sit in no frame. /docs loads
# Swagger from a CDN, so it keeps the browser defaults.
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), geolocation=(), payment=(), microphone=(self)",
}


def _setup_logger() -> None:
    if log.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False


def install(app: FastAPI) -> None:
    _setup_logger()

    @app.middleware("http")
    async def log_and_protect(request: Request, call_next):
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            route = request.scope.get("route")
            path = getattr(route, "path", None) or "(unmatched)"
            log.info(json.dumps({"method": request.method, "route": path, "status": status,
                                 "ms": round((time.perf_counter() - started) * 1000)}))
        for name, value in HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith("/api"):
            response.headers.setdefault("Content-Security-Policy", API_CSP)
        return response


_IDS = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{20,}")


def scrub_event(event: dict, _hint: dict | None = None) -> dict:
    """What Sentry may keep of an error: where it happened and a scrubbed message, nothing personal."""
    from app.services.deid import scrub

    request = event.get("request") or {}
    url = _IDS.sub("{id}", (request.get("url") or "").split("?")[0])
    event["request"] = {"method": request.get("method"), "url": url}
    event.pop("user", None)
    event.pop("breadcrumbs", None)
    event.pop("server_name", None)
    event.pop("extra", None)
    for exc in (event.get("exception") or {}).get("values") or []:
        if isinstance(exc.get("value"), str):
            exc["value"] = scrub(exc["value"])
        for frame in (exc.get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
    if isinstance(event.get("message"), str):
        event["message"] = scrub(event["message"])
    return event


def init_sentry(settings: Settings) -> bool:
    if not settings.sentry_dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:
        logging.getLogger(__name__).warning("SENTRY_DSN is set but sentry-sdk is not installed")
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        send_default_pii=False,
        include_local_variables=False,
        max_breadcrumbs=0,
        traces_sample_rate=0,
        before_send=scrub_event,
    )
    return True
