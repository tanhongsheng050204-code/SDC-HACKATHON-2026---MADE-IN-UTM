"""Real Malaysian job ads for a role, from freehire.me: the same source and search terms as a role
page's openings (data/role_openings.json). Each ad keeps its original link (mostly JobStreet), and
its full text is fetched, because search results cut descriptions at about 1,000 characters,
usually before the requirements.

Used by the skill evidence (app/evidence/search.py) and by scripts/build_qualifications.py. No
language model is involved, so a link or a sentence can never be invented.
"""

import html
import json
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import httpx

from app.config import get_settings
from app.trends.mypostings import API_URL, COUNTRY

PAGES = 3          # search pages of 100 postings scanned for titles that name the role
PARALLEL = 6       # full ads fetched at once
# Title words a posting must contain where the openings search is broad (e.g. "solar" also finds
# solar sales and finance jobs).
TITLE_WORDS = {"renewable_energy_technician": ["technician", "installer", "wireman", "juruteknik"],
               "engineering_technician": ["drafter", "draughtsman", "draftsman", "bim", "cad"],
               "accounts_clerk": ["clerk", "assistant", "payroll", "kerani"],
               "bank_teller": ["teller", "cashier", "counter"]}


@lru_cache(maxsize=1)
def lookups() -> dict[str, dict]:
    path = get_settings().data_dir / "role_openings.json"
    return json.loads(path.read_text(encoding="utf-8"))["roles"]


def sentences(description: str) -> list[str]:
    """An ad as sentences and list items, without HTML."""
    raw = re.sub(r"<(br|/p|/li|li|/h\d|/div)[^>]*>", "\n", description or "", flags=re.I)
    raw = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    parts = re.split(r"\n|(?<=[.!?])\s+(?=[A-Z])|•", raw)
    return [re.sub(r"\s+", " ", p).strip(" -*·") for p in parts if p and p.strip()]


def _tags(job: dict) -> list[str]:
    """freehire's own skill tags for an ad (a list, or a list written as text)."""
    tags = job.get("skills") or []
    if isinstance(tags, str):
        tags = re.findall(r"'([^']+)'", tags)
    return [str(t) for t in tags if str(t).strip()]


def for_role(role_id: str, max_ads: int, *, client: httpx.Client | None = None) -> list[dict]:
    """The newest ads whose title names a catalogue role, each with its full text and link."""
    lookup = lookups()[role_id]
    return search(lookup["query"], TITLE_WORDS.get(role_id) or lookup["titles"], max_ads, client=client)


def for_title(title: str, max_ads: int, *, client: httpx.Client | None = None) -> list[dict]:
    """Ads for a job title outside the catalogue (an emerging role): every main word of the title
    must be in the ad's title, so "AI Security Engineer" does not match any engineer."""
    words = [w for w in re.findall(r"[a-z0-9+#]+", title.lower()) if len(w) > 2 and w not in {"and", "the", "for"}]
    return search(f'"{title}"', words, max_ads, every_word=True, client=client)


def search(query: str, words: list[str], max_ads: int, *, every_word: bool = False,
           client: httpx.Client | None = None) -> list[dict]:
    """The newest Malaysian postings for a full-text query whose title contains the given words
    (any of them, or every one), each with its full text and link."""
    words = [w.lower() for w in words]
    match = all if every_word else any
    own_client = client is None
    client = client or httpx.Client(timeout=30)
    try:
        found = []
        for page in range(PAGES):
            data = client.get(f"{API_URL}/jobs/search", params={"q": query, "countries": COUNTRY, "limit": 100,
                                                                "offset": page * 100, "sort": "posted_at", "order": "desc"}).json()["data"]
            found += [j for j in data if words and match(re.search(rf"\b{re.escape(w)}\b", j["title"].lower()) for w in words)
                      and str(j.get("url", "")).startswith("https://")]
            if len(data) < 100 or len(found) >= max_ads:
                break
        found = found[:max_ads]

        def full(job: dict) -> dict:
            try:
                detail = client.get(f"{API_URL}/jobs/{job['public_slug']}").json()["data"]
                return {**job, "description": detail.get("description") or job.get("description")}
            except (httpx.HTTPError, KeyError, ValueError):
                return job

        with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
            jobs = list(pool.map(full, found))
    finally:
        if own_client:
            client.close()
    return [{"title": j["title"].strip(), "company": j.get("company"), "url": j["url"],
             "posted": (j.get("posted_at") or "")[:10], "description": j.get("description") or "",
             "tags": _tags(j)} for j in jobs]
