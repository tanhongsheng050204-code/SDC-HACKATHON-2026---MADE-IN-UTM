"""Open jobs in Malaysia for one role, from freehire.me, each linking to the original posting.

The search (data/role_openings.json) also matches descriptions, so its total is reported as
"postings that mention" the role; the list only keeps postings whose title names the role, newest
first. Results are cached for CACHE_SECONDS so a page view never waits on freehire twice, and an
outage returns an empty, clearly labelled answer instead of an error.
"""

import json
import re
import threading
import time
from functools import lru_cache
from urllib.parse import urlencode, urlsplit

import httpx

from app.config import get_settings
from app.trends.mypostings import API_URL, COUNTRY, SITE_URL

CACHE_SECONDS = 6 * 3600
SHOWN = 3
PAGE = 100  # newest postings scanned for a matching title
_cache: dict[str, tuple[float, dict]] = {}
_all: dict[str, tuple[float, list[dict]]] = {}  # every titled posting per role, for job alerts
_lock = threading.Lock()


@lru_cache(maxsize=1)
def lookups() -> dict[str, dict]:
    path = get_settings().data_dir / "role_openings.json"
    return json.loads(path.read_text(encoding="utf-8"))["roles"]


def _posting(job: dict) -> dict:
    return {"title": job["title"].strip(), "company": job.get("company"), "location": job.get("location"),
            "posted": (job.get("posted_at") or "")[:10] or None, "url": job["url"]}


def _safe_link(job: dict) -> bool:
    """Only plain web links reach the page: a third-party URL is never trusted as a javascript: link."""
    return urlsplit(str(job.get("url") or "")).scheme in ("http", "https")


def _titled(lookup: dict, jobs: list[dict]) -> list[dict]:
    """Malaysian postings whose title names the role, newest first."""
    names = re.compile(r"\b(" + "|".join(re.escape(w) for w in lookup["titles"]) + r")\b", re.I)
    local = [j for j in jobs if COUNTRY.lower() in (j.get("countries") or []) and _safe_link(j)]
    return [j for j in local if names.search(j["title"])]


def summarise(lookup: dict, total: int, jobs: list[dict]) -> dict:
    return {"mentions": total, "openings": [_posting(j) for j in _titled(lookup, jobs)[:SHOWN]],
            "all": [_posting(j) for j in _titled(lookup, jobs)]}


def _fetch(lookup: dict, client: httpx.Client) -> dict:
    params = {"q": lookup["query"], "countries": COUNTRY, "limit": PAGE, "sort": "posted_at", "order": "desc"}
    response = client.get(f"{API_URL}/jobs/search", params=params)
    response.raise_for_status()
    body = response.json()
    return summarise(lookup, int(body["meta"]["total"]), body["data"])


def for_role(role_id: str, *, client: httpx.Client | None = None, now: float | None = None) -> dict:
    lookup = lookups()[role_id]
    now = time.time() if now is None else now
    with _lock:
        cached = _cache.get(role_id)
    if cached and now - cached[0] < CACHE_SECONDS:
        return cached[1]
    base = {"role_id": role_id, "query": lookup["query"], "source": "freehire.me (Malaysian job postings)",
            "search_url": f"{SITE_URL}?{urlencode({'q': lookup['query'], 'countries': COUNTRY})}",
            "checked": time.strftime("%Y-%m-%d %H:%M", time.localtime(now))}
    own_client = client is None
    client = client or httpx.Client(timeout=10)
    try:
        fetched = _fetch(lookup, client)
        with _lock:
            _all[role_id] = (now, fetched.pop("all"))
        result = {**base, "available": True, **fetched}
    except (httpx.HTTPError, KeyError, ValueError):
        return {**base, "available": False, "mentions": None, "openings": []}  # not cached: retry next time
    finally:
        if own_client:
            client.close()
    with _lock:
        _cache[role_id] = (now, result)
    return result


def all_titled(role_id: str, *, client: httpx.Client | None = None) -> list[dict] | None:
    """Every recent Malaysian posting whose title names the role (for job alerts), or None when
    freehire is unavailable. Shares the six-hour cache with for_role()."""
    result = for_role(role_id, client=client)
    if not result.get("available"):
        return None
    with _lock:
        cached = _all.get(role_id)
    return list(cached[1]) if cached else [o for o in result["openings"]]
