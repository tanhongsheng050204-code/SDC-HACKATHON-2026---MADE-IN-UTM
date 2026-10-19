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
    response = client.get(ARXIV_URL, params={"search_query": search, "max_results": 0})
    if response.status_code == 429 or "Rate exceeded" in response.text[:200]:
        raise SourceUnavailable("arXiv rate limit")
    response.raise_for_status()
    match = _TOTAL.search(response.text)
    if not match:
        raise SourceUnavailable("arXiv response had no total")
    return int(match.group(1))


def _openalex_count(client: httpx.Client, query: str, start: dt.date, end: dt.date,
                    mailto: str | None) -> int:
    params = {"search": f'"{query}"', "per-page": 1,
              "filter": f"from_publication_date:{start},to_publication_date:{end}"}
    if mailto:
        params["mailto"] = mailto
    response = client.get(OPENALEX_URL, params=params)
    response.raise_for_status()
    return int(response.json()["meta"]["count"])


def collect(capabilities: list[dict], today: dt.date, *, client: httpx.Client | None = None,
            mailto: str | None = None, progress: Callable[[str], None] = lambda _: None,
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
            progress(f"arXiv unavailable ({error}); switching to OpenAlex")
            source, counts = "openalex", {}
            for cap in capabilities:
                progress(f"OpenAlex: {cap['name']}")
                counts[cap["id"]] = {name: _openalex_count(client, cap["query"], start, end, mailto)
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
