"""Job-market signal: how often each skill is mentioned in public job postings.

Source: the monthly Hacker News "Ask HN: Who is hiring?" threads, through the public Algolia
search API (each top-level comment is one job posting). The latest THREADS_PER_WINDOW threads are
compared with the threads from the same months one year earlier, as a share of all postings, so a
busier month does not look like rising demand. The source is tech-heavy; skills with no mentions
in either window are reported as "no data", never guessed.
"""

import datetime as dt
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

import httpx

ALGOLIA_URL = "https://hn.algolia.com/api/v1"
THREADS_PER_WINDOW = 3
SERIES_MONTHS = 36  # history for the forecast: about 12 quarters of monthly threads
SERIES_WORKERS = 3
SERIES_RETRIES = 4


def _hiring_threads(client: httpx.Client, hits: int = 60) -> list[dict]:
    response = client.get(f"{ALGOLIA_URL}/search_by_date",
                          params={"tags": "story,author_whoishiring", "hitsPerPage": hits})
    response.raise_for_status()
    threads = [{"id": h["objectID"], "title": h["title"], "date": h["created_at"][:10]}
               for h in response.json()["hits"]
               if h["title"].lower().startswith("ask hn: who is hiring")]
    return sorted(threads, key=lambda t: t["date"], reverse=True)


def pick_threads(threads: list[dict]) -> dict[str, list[dict]]:
    """The latest threads, and the threads about one year before each of them."""
    recent = threads[:THREADS_PER_WINDOW]
    prior = []
    for thread in recent:
        target = dt.date.fromisoformat(thread["date"]) - dt.timedelta(days=365)
        closest = min(threads, key=lambda t: abs((dt.date.fromisoformat(t["date"]) - target).days))
        if abs((dt.date.fromisoformat(closest["date"]) - target).days) <= 20:
            prior.append(closest)
    return {"recent": recent, "prior": prior}


def _hits(client: httpx.Client, story_id: str, query: str | None) -> int:
    params = {"tags": f"comment,story_{story_id}", "hitsPerPage": 0}
    if query:
        # Whole words only, no typo tolerance: otherwise "excel" also counts "excellent".
        # Multi-word terms are quoted so they match as a phrase ("power bi", not "power" + "bi").
        params.update(query=f'"{query}"' if " " in query else query, queryType="prefixNone",
                      typoTolerance="false", advancedSyntax="true")
    response = client.get(f"{ALGOLIA_URL}/search", params=params)
    response.raise_for_status()
    return int(response.json()["nbHits"])


def collect(terms: dict[str, str], today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=30)
    try:
        progress("Job postings: finding hiring threads")
        chosen = pick_threads(_hiring_threads(client))
        if len(chosen["prior"]) < len(chosen["recent"]) or not chosen["recent"]:
            raise RuntimeError("Not enough hiring threads to compare with last year")
        jobs = [(window, t["id"], skill, term) for window, ts in chosen.items() for t in ts
                for skill, term in [(None, None), *terms.items()]]
        progress(f"Job postings: counting {len(terms)} skills in {sum(map(len, chosen.values()))} threads")
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda j: _hits(client, j[1], j[3]), jobs))
    finally:
        if own_client:
            client.close()
    totals = {"recent": 0, "prior": 0}
    mentions: dict[str, dict[str, int]] = {skill: {"recent": 0, "prior": 0} for skill in terms}
    for (window, _, skill, _), count in zip(jobs, results, strict=True):
        if skill is None:
            totals[window] += count
        else:
            mentions[skill][window] += count
    return {
        "source": "Hacker News 'Who is hiring?' threads (Algolia public API)",
        "source_url": ALGOLIA_URL,
        "retrieved": today.isoformat(),
        "threads": chosen,
        "terms": terms,
        "postings": totals,
        "mentions": mentions,
    }


def quarter(date: str) -> str:
    """'2025-08-01' -> '2025Q3'."""
    return f"{date[:4]}Q{(int(date[5:7]) - 1) // 3 + 1}"


def _quarter_hits(client: httpx.Client, story_ids: list[str], query: str | None,
                  sleep: Callable[[float], None] = time.sleep) -> int:
    """Comments matching the query across one quarter's threads (Algolia ORs tags in brackets).
    Algolia answers 403/429 to bursts, so wait and retry a few times before giving up."""
    params = {"tags": f"comment,({','.join(f'story_{i}' for i in story_ids)})", "hitsPerPage": 0}
    if query:
        params.update(query=f'"{query}"' if " " in query else query, queryType="prefixNone",
                      typoTolerance="false", advancedSyntax="true")
    for attempt in range(SERIES_RETRIES):
        response = client.get(f"{ALGOLIA_URL}/search", params=params)
        if response.status_code not in (403, 429) or attempt == SERIES_RETRIES - 1:
            break
        sleep(2 ** attempt * 2)
    response.raise_for_status()
    return int(response.json()["nbHits"])


def collect_series(terms: dict[str, str], today: dt.date, *, client: httpx.Client | None = None,
                   progress: Callable[[str], None] = lambda _: None,
                   sleep: Callable[[float], None] = time.sleep) -> dict:
    """Postings and skill mentions per quarter over the last SERIES_MONTHS months of hiring threads,
    for the forecast (app/trends/forecast.py). Shares, not raw counts, are what gets forecast."""
    own_client = client is None
    client = client or httpx.Client(timeout=30)
    start = today - dt.timedelta(days=SERIES_MONTHS * 365 // 12)
    try:
        progress("Job-posting history: finding hiring threads")
        threads = [t for t in _hiring_threads(client, hits=200) if t["date"] >= str(start)]
        if len(threads) < 12:
            raise RuntimeError("Not enough hiring threads for a history")
        by_quarter: dict[str, list[str]] = {}
        for t in threads:
            by_quarter.setdefault(quarter(t["date"]), []).append(t["id"])
        periods = sorted(by_quarter)
        jobs = [(q, skill, term) for q in periods for skill, term in [(None, None), *terms.items()]]
        progress(f"Job-posting history: counting {len(terms)} skills in {len(threads)} monthly threads")
        with ThreadPoolExecutor(max_workers=SERIES_WORKERS) as pool:
            results = list(pool.map(lambda j: _quarter_hits(client, by_quarter[j[0]], j[2], sleep), jobs))
    finally:
        if own_client:
            client.close()
    postings = dict.fromkeys(periods, 0)
    mentions: dict[str, dict[str, int]] = {skill: dict.fromkeys(periods, 0) for skill in terms}
    for (q, skill, _), count in zip(jobs, results, strict=True):
        if skill is None:
            postings[q] = count
        else:
            mentions[skill][q] = count
    return {
        "source": "Hacker News 'Who is hiring?' threads (Algolia public API)",
        "source_url": ALGOLIA_URL,
        "retrieved": today.isoformat(),
        "threads": len(threads),
        "periods": periods,
        "postings": postings,
        "mentions": mentions,
    }
