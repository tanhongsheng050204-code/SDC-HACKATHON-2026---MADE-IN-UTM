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
from urllib.parse import urlencode

import httpx

from app.config import get_settings
from app.trends.mypostings import API_URL, COUNTRY, SITE_URL

CACHE_SECONDS = 6 * 3600
SHOWN = 3
PAGE = 100  # newest postings scanned for a matching title
_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()


@lru_cache(maxsize=1)
def lookups() -> dict[str, dict]:
    path = get_settings().data_dir / "role_openings.json"
    return json.loads(path.read_text(encoding="utf-8"))["roles"]


def _posting(job: dict) -> dict:
    return {"title": job["title"].strip(), "company": job.get("company"), "location": job.get("location"),
            "posted": (job.get("posted_at") or "")[:10] or None, "url": job["url"]}


def summarise(lookup: dict, total: int, jobs: list[dict]) -> dict:
    names = re.compile(r"\b(" + "|".join(re.escape(w) for w in lookup["titles"]) + r")\b", re.I)
    local = [j for j in jobs if COUNTRY.lower() in (j.get("countries") or [])]
    titled = [j for j in local if names.search(j["title"])]
    return {"mentions": total, "openings": [_posting(j) for j in titled[:SHOWN]]}


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
        result = {**base, "available": True, **_fetch(lookup, client)}
    except (httpx.HTTPError, KeyError, ValueError):
        return {**base, "available": False, "mentions": None, "openings": []}  # not cached: retry next time
    finally:
        if own_client:
            client.close()
    with _lock:
        _cache[role_id] = (now, result)
    return result
