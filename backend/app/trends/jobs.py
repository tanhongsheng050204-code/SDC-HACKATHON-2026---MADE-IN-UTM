"""Job-market signal: how often each skill is mentioned in public job postings.

Source: the monthly Hacker News "Ask HN: Who is hiring?" threads, through the public Algolia
search API (each top-level comment is one job posting). The latest THREADS_PER_WINDOW threads are
compared with the threads from the same months one year earlier, as a share of all postings, so a
busier month does not look like rising demand. The source is tech-heavy; skills with no mentions
in either window are reported as "no data", never guessed.
"""

import datetime as dt
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

import httpx

ALGOLIA_URL = "https://hn.algolia.com/api/v1"
THREADS_PER_WINDOW = 3


def _hiring_threads(client: httpx.Client) -> list[dict]:
    response = client.get(f"{ALGOLIA_URL}/search_by_date",
                          params={"tags": "story,author_whoishiring", "hitsPerPage": 60})
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
