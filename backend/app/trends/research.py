"""AI-advancement signal: research papers per AI capability, this year against last year.

Primary source is the arXiv API. arXiv asks for at most one request every 3 seconds and answers
"429 Rate exceeded" when it is busy; if that happens the whole run switches to OpenAlex (an open
index of research that includes arXiv), so every capability in one run comes from one source.

Windows end WINDOW_LAG_DAYS ago because recent papers are still being indexed, and the recent
window is compared with the same months one year earlier so seasonal swings cancel out.
"""

import datetime as dt
import re
import time
from collections.abc import Callable

import httpx

ARXIV_URL = "https://export.arxiv.org/api/query"
OPENALEX_URL = "https://api.openalex.org/works"
ARXIV_SPACING_SECONDS = 3.1
WINDOW_DAYS = 182
WINDOW_LAG_DAYS = 60
SERIES_QUARTERS = 12  # history for the forecast
USER_AGENT = "Laluan-hackathon/0.1 (Future-Ready Workforce prototype)"
_TOTAL = re.compile(r"<opensearch:totalResults[^>]*>(\d+)<")


class SourceUnavailable(RuntimeError):
    pass


def windows(today: dt.date) -> dict[str, tuple[dt.date, dt.date]]:
    end = today - dt.timedelta(days=WINDOW_LAG_DAYS)
    start = end - dt.timedelta(days=WINDOW_DAYS)
    year = dt.timedelta(days=365)
    return {"recent": (start, end), "prior": (start - year, end - year)}


def _arxiv_count(client: httpx.Client, query: str, start: dt.date, end: dt.date) -> int:
    search = (f'abs:"{query}" AND submittedDate:[{start:%Y%m%d}0000 TO {end:%Y%m%d}2359]')
    # max_results=0 now makes arXiv answer 500; one result is the cheapest request that works.
    response = client.get(ARXIV_URL, params={"search_query": search, "max_results": 1})
    if response.status_code == 429 or "Rate exceeded" in response.text[:200]:
        raise SourceUnavailable("arXiv rate limit")
    response.raise_for_status()
    match = _TOTAL.search(response.text)
    if not match:
        raise SourceUnavailable("arXiv response had no total")
    return int(match.group(1))


def _openalex_count(client: httpx.Client, query: str, start: dt.date, end: dt.date,
                    mailto: str | None, api_key: str | None = None,
                    country: str | None = None) -> int:
    filters = [f"from_publication_date:{start}", f"to_publication_date:{end}"]
    if country:  # only work with at least one institution in that country
        filters.append(f"institutions.country_code:{country}")
    params = {"search": f'"{query}"', "per-page": 1, "filter": ",".join(filters)}
    if mailto:
        params["mailto"] = mailto
    if api_key:  # without one, searches share a small free daily budget per IP address
        params["api_key"] = api_key
    response = client.get(OPENALEX_URL, params=params)
    if response.status_code == 429:
        raise SourceUnavailable("OpenAlex budget or rate limit")
    response.raise_for_status()
    return int(response.json()["meta"]["count"])


def collect(capabilities: list[dict], today: dt.date, *, client: httpx.Client | None = None,
            mailto: str | None = None, api_key: str | None = None, progress: Callable[[str], None] = lambda _: None,
            sleep: Callable[[float], None] = time.sleep) -> dict:
    """Paper counts per capability for the recent and prior windows, with the source used."""
    own_client = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT},
                                    follow_redirects=True)
    spans = windows(today)
    try:
        source, counts = "arxiv", {}
        try:
            for i, cap in enumerate(capabilities):
                progress(f"arXiv: {cap['name']}")
                counts[cap["id"]] = {}
                for name, (start, end) in spans.items():
                    if i or name != "recent":
                        sleep(ARXIV_SPACING_SECONDS)
                    counts[cap["id"]][name] = _arxiv_count(client, cap["query"], start, end)
        except (SourceUnavailable, httpx.HTTPError) as error:
            reason = "rate limit" if isinstance(error, SourceUnavailable) else type(error).__name__
            progress(f"arXiv unavailable ({reason}); switching to OpenAlex")
            source, counts = "openalex", {}
            for cap in capabilities:
                progress(f"OpenAlex: {cap['name']}")
                counts[cap["id"]] = {name: _openalex_count(client, cap["query"], start, end, mailto, api_key)
                                     for name, (start, end) in spans.items()}
    finally:
        if own_client:
            client.close()
    return {
        "source": source,
        "source_url": ARXIV_URL if source == "arxiv" else OPENALEX_URL,
        "retrieved": today.isoformat(),
        "windows": {name: [str(start), str(end)] for name, (start, end) in spans.items()},
        "queries": {cap["id"]: cap["query"] for cap in capabilities},
        "counts": counts,
    }


def quarters(today: dt.date, n: int = SERIES_QUARTERS) -> list[tuple[str, dt.date, dt.date]]:
    """The last n calendar quarters that ended at least WINDOW_LAG_DAYS ago, oldest first."""
    cutoff = today - dt.timedelta(days=WINDOW_LAG_DAYS)
    year, q = cutoff.year, (cutoff.month - 1) // 3 + 1
    out = []
    while len(out) < n:
        start = dt.date(year, 3 * q - 2, 1)
        end = (dt.date(year + (q == 4), 1 if q == 4 else 3 * q + 1, 1) - dt.timedelta(days=1))
        if end <= cutoff:
            out.append((f"{year}Q{q}", start, end))
        year, q = (year - 1, 4) if q == 1 else (year, q - 1)
    return out[::-1]


def collect_series(capabilities: list[dict], today: dt.date, *, client: httpx.Client | None = None,
                   mailto: str | None = None, api_key: str | None = None,
                   progress: Callable[[str], None] = lambda _: None,
                   sleep: Callable[[float], None] = time.sleep) -> dict:
    """Papers per capability per quarter, for the forecast. arXiv first (one request every 3
    seconds, so about 5 minutes); if it refuses, the whole history comes from OpenAlex, whose free
    budget without an API key is small. One source for every capability and quarter."""
    own_client = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT},
                                    follow_redirects=True)
    spans = quarters(today)
    try:
        source, counts = "arxiv", {}
        try:
            for i, cap in enumerate(capabilities):
                progress(f"Research history (arXiv): {cap['name']}")
                counts[cap["id"]] = {}
                for j, (label, start, end) in enumerate(spans):
                    if i or j:
                        sleep(ARXIV_SPACING_SECONDS)
                    counts[cap["id"]][label] = _arxiv_count(client, cap["query"], start, end)
        except (SourceUnavailable, httpx.HTTPError) as error:
            reason = "rate limit" if isinstance(error, SourceUnavailable) else type(error).__name__
            progress(f"arXiv unavailable for the history ({reason}); switching to OpenAlex")
            source, counts = "openalex", {}
            for cap in capabilities:
                progress(f"Research history (OpenAlex): {cap['name']}")
                counts[cap["id"]] = {label: _openalex_count(client, cap["query"], start, end, mailto, api_key)
                                     for label, start, end in spans}
    finally:
        if own_client:
            client.close()
    return {
        "source": source,
        "source_url": ARXIV_URL if source == "arxiv" else OPENALEX_URL,
        "retrieved": today.isoformat(),
        "periods": [label for label, _, _ in spans],
        "queries": {cap["id"]: cap["query"] for cap in capabilities},
        "counts": counts,
    }


MALAYSIA = "MY"


def collect_malaysia(capabilities: list[dict], today: dt.date, *, client: httpx.Client | None = None,
                     mailto: str | None = None, api_key: str | None = None,
                     progress: Callable[[str], None] = lambda _: None) -> dict:
    """The same capability counts, restricted to papers with a Malaysian institution (OpenAlex only:
    arXiv has no country filter). Same shape as collect(), so builder.momentum reads it unchanged.

    This answers a different question from the global series: not "is this capability advancing?"
    but "is Malaysia working on it?". Sixteen requests, so it stays inside OpenAlex's free budget
    when no key is set; a 429 is reported and the snapshot is built without it.
    """
    own_client = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT},
                                    follow_redirects=True)
    spans = windows(today)
    counts = {}
    try:
        for cap in capabilities:
            progress(f"Malaysian research (OpenAlex): {cap['name']}")
            counts[cap["id"]] = {name: _openalex_count(client, cap["query"], start, end, mailto, api_key,
                                                       country=MALAYSIA)
                                 for name, (start, end) in spans.items()}
    finally:
        if own_client:
            client.close()
    return {
        "source": "OpenAlex, papers with a Malaysian institution",
        "source_url": OPENALEX_URL,
        "retrieved": today.isoformat(),
        "windows": {name: [str(start), str(end)] for name, (start, end) in spans.items()},
        "queries": {cap["id"]: cap["query"] for cap in capabilities},
        "counts": counts,
    }
