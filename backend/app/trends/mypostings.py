"""Malaysian job postings: how many open postings in Malaysia mention each skill.

Source: freehire.me (open source, MIT), a public, keyless API over job postings taken straight
from company career pages and job boards (JobStreet Malaysia among them). Each refresh counts the
open postings with countries=MY that mention each skill (data/my_posting_terms.json) and saves the
counts by date under data/raw/mypostings/.

A trend needs two counts: this run is compared with the newest saved run at least MIN_GAP_DAYS
older, as a share of all Malaysian postings so a busier market does not look like rising demand.
Until such a run exists, each skill shows its share today and no trend. freehire places a few
postings in the wrong country, and phrase searches also match descriptions, so this is a rough
reading of demand, like the other job-posting source.
"""

import datetime as dt
import json
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

API_URL = "https://freehire.me/api/v1"
SITE_URL = "https://freehire.me/jobs"
COUNTRY = "MY"
MIN_GAP_DAYS = 28
SOURCE = "freehire.me Malaysian job postings"


def _params(term: dict) -> dict:
    params = {"countries": COUNTRY, "limit": 1}
    if "tags" in term:
        params["skills"] = ",".join(term["tags"])
    else:
        params["q"] = f'"{term["phrase"]}"'
    return params


def _total(client: httpx.Client, params: dict) -> int:
    response = client.get(f"{API_URL}/jobs/search", params=params)
    response.raise_for_status()
    meta = response.json()["meta"]
    if meta.get("ignored_params"):  # freehire ignores unknown filters instead of refusing them
        raise ValueError(f"freehire ignored {meta['ignored_params']}")
    return int(meta["total"])


def collect(terms: dict[str, dict], today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=30)
    try:
        progress(f"Malaysian job postings: counting {len(terms)} skills on freehire.me")
        total = _total(client, {"countries": COUNTRY, "limit": 1})
        with ThreadPoolExecutor(max_workers=4) as pool:
            counts = list(pool.map(lambda term: _total(client, _params(term)), terms.values()))
    finally:
        if own_client:
            client.close()
    return {"source": SOURCE, "source_url": f"{SITE_URL}?countries={COUNTRY}", "retrieved": today.isoformat(),
            "country": COUNTRY, "terms": terms, "postings": total, "mentions": dict(zip(terms, counts, strict=True))}


def previous(raw_dir: Path, today: dt.date) -> dict | None:
    """The newest saved run at least MIN_GAP_DAYS before today, to compare with."""
    older = [p for p in raw_dir.glob("*.json")
             if (today - dt.date.fromisoformat(p.stem)).days >= MIN_GAP_DAYS]
    return json.loads(max(older).read_text(encoding="utf-8")) if older else None


def with_prior(current: dict, prior: dict | None) -> dict:
    """The run in the same shape as the Hacker News counts: recent and prior windows per skill."""
    mentions = {skill: {"recent": n, "prior": prior["mentions"].get(skill, 0) if prior else None}
                for skill, n in current["mentions"].items()}
    return {**current, "prior_retrieved": prior["retrieved"] if prior else None,
            "postings": {"recent": current["postings"], "prior": prior["postings"] if prior else None},
            "mentions": mentions}
