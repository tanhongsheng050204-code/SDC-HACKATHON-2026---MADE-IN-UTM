"""Developer attention: is a skill being used more this year than last, outside job ads?

Four public, keyless sources, each measured for the same twelve months and the twelve before:

  Stack Overflow   questions asked with the skill's tag(s)        (api.stackexchange.com)
  GitHub           repositories created with the skill's topic    (api.github.com/search)
  npm              downloads of the skill's package(s)            (api.npmjs.org)
  PyPI             downloads of the skill's package(s)            (pypistats.org)

Why it is not a raw count: Stack Overflow traffic falls every year and package downloads rise every
year, so the raw direction says nothing about one skill. Each skill's growth is therefore compared
with the **median growth of the skills measured in the same source** - the same trick the AI research
channel uses - and clipped to [-1, 1]. A skill growing with the platform scores about 0.

Mapping: data/skill_sources.json lists the tag, topic and package for each skill, checked against
the live APIs. A skill with no canonical tag or package is absent on purpose: it gets no attention
reading rather than a guessed one.

Limits: one tag can double count a question that carries two tags; npm and PyPI measure installs,
not people; pypistats keeps about six months, so its window is 90 days against the 90 before.
Those are why this channel is weighted well below job postings and AI research.
"""

import datetime as dt
import math
import statistics
import time
from collections.abc import Callable

import httpx

SO_API = "https://api.stackexchange.com/2.3"
GH_API = "https://api.github.com/search/repositories"
NPM_API = "https://api.npmjs.org/downloads/range"
PYPI_API = "https://pypistats.org/api/packages"
SITE = "stackoverflow"
USER_AGENT = "Laluan-hackathon/0.1 (Future-Ready Workforce prototype)"

WINDOW_MONTHS = 12
WINDOW_LAG_DAYS = 30  # the last month is still being filled in
PYPI_WINDOW_DAYS = 90  # pypistats keeps about six months of daily data
GITHUB_SPACING_SECONDS = 6.5  # search is limited to 10 requests a minute without a token
MOMENTUM_RANGE = (-1.0, 1.0)
MIN_SKILLS_PER_SOURCE = 3  # a median needs a few skills to be a median
MIN_VOLUME = {"stackoverflow": 50, "github": 20, "npm": 100_000, "pypi": 50_000}
THRESHOLD = 0.15


class SourceUnavailable(RuntimeError):
    pass


def windows(today: dt.date) -> dict[str, tuple[dt.date, dt.date]]:
    end = today - dt.timedelta(days=WINDOW_LAG_DAYS)
    start = end - dt.timedelta(days=WINDOW_MONTHS * 365 // 12)
    return {"recent": (start, end), "prior": (start - dt.timedelta(days=365), end - dt.timedelta(days=365))}


def _epoch(day: dt.date) -> int:
    return int(dt.datetime(day.year, day.month, day.day, tzinfo=dt.timezone.utc).timestamp())


def _so_total(client: httpx.Client, tag: str, start: dt.date, end: dt.date) -> int:
    response = client.get(f"{SO_API}/questions", params={"site": SITE, "tagged": tag,
                                                        "fromdate": _epoch(start), "todate": _epoch(end),
                                                        "filter": "total"})
    response.raise_for_status()
    return int(response.json().get("total") or 0)


def _gh_total(client: httpx.Client, topic: str, start: dt.date, end: dt.date) -> int:
    query = f"topic:{topic} created:{start.isoformat()}..{end.isoformat()}"
    response = client.get(GH_API, params={"q": query, "per_page": 1})
    if response.status_code in (403, 429):
        raise SourceUnavailable("GitHub search rate limit")
    response.raise_for_status()
    return int(response.json().get("total_count") or 0)


def _npm_total(client: httpx.Client, package: str, start: dt.date, end: dt.date) -> int:
    response = client.get(f"{NPM_API}/{start.isoformat()}:{end.isoformat()}/{package}")
    response.raise_for_status()
    return sum(int(day.get("downloads") or 0) for day in response.json().get("downloads", []))


def _pypi_daily(client: httpx.Client, package: str) -> dict[dt.date, int]:
    response = client.get(f"{PYPI_API}/{package}/overall", params={"mirrors": "false"})
    response.raise_for_status()
    return {dt.date.fromisoformat(row["date"]): int(row.get("downloads") or 0)
            for row in response.json().get("data", []) if row.get("category") == "without_mirrors"}


def _pypi_windows(client: httpx.Client, package: str, today: dt.date) -> dict[str, int]:
    """pypistats keeps about six months: compare the last 90 days with the 90 before them."""
    daily = _pypi_daily(client, package)
    if not daily:
        return {"recent": 0, "prior": 0}
    end = max(daily)
    recent_start = end - dt.timedelta(days=PYPI_WINDOW_DAYS)
    prior_start = end - dt.timedelta(days=2 * PYPI_WINDOW_DAYS)
    return {"recent": sum(v for d, v in daily.items() if d > recent_start),
            "prior": sum(v for d, v in daily.items() if prior_start < d <= recent_start)}


def _add(counts: dict, skill: str, name: str, pair: dict[str, int]) -> None:
    entry = counts.setdefault(skill, {"recent": 0, "prior": 0, "terms": []})
    entry["recent"] += pair["recent"]
    entry["prior"] += pair["prior"]
    entry["terms"].append(name)


def _collect_source(name: str, mapping: dict[str, dict], source: str, call,
                    progress: Callable[[str], None], unavailable: list[str]) -> dict:
    """Counts per skill for one source; a failure drops the whole source, never half of it."""
    counts: dict[str, dict] = {}
    try:
        for skill, spec in mapping.items():
            for term in spec.get(source, []):
                counts.setdefault(skill, {"recent": 0, "prior": 0, "terms": []})
                pair = call(term)
                counts[skill]["recent"] += pair["recent"]
                counts[skill]["prior"] += pair["prior"]
                counts[skill]["terms"].append(term)
        progress(f"Developer attention ({name}): {len(counts)} skills counted")
        return counts
    except (httpx.HTTPError, SourceUnavailable, KeyError, ValueError) as error:
        unavailable.append(f"{name} ({type(error).__name__})")
        progress(f"Developer attention: {name} unavailable, using the other sources")
        return {}


def collect(mapping: dict[str, dict], today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None,
            sleep: Callable[[float], None] = time.sleep) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=40, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    spans = windows(today)
    unavailable: list[str] = []
    try:
        counts = {}
        counts["stackoverflow"] = _collect_source(
            "Stack Overflow", mapping, "stackoverflow",
            lambda tag: {name: _so_total(client, tag, start, end) for name, (start, end) in spans.items()},
            progress, unavailable)
        counts["npm"] = _collect_source(
            "npm", mapping, "npm",
            lambda package: {"recent": _npm_total(client, package, *spans["recent"]),
                             "prior": _npm_total(client, package, *spans["prior"])},
            progress, unavailable)
        counts["pypi"] = _collect_source(
            "PyPI", mapping, "pypi", lambda package: _pypi_windows(client, package, today), progress, unavailable)
        counts["github"] = _collect_github(client, mapping, spans, progress, unavailable, sleep)
    finally:
        if own_client:
            client.close()
    return summarise(counts, today, unavailable)


def _collect_github(client: httpx.Client, mapping: dict[str, dict], spans: dict[str, tuple[dt.date, dt.date]],
                    progress: Callable[[str], None], unavailable: list[str],
                    sleep: Callable[[float], None]) -> dict:
    """GitHub search allows 10 requests a minute, so this one is spaced out and fails on its own."""
    counts: dict[str, dict] = {}
    try:
        first = True
        for skill, spec in mapping.items():
            for topic in spec.get("github", []):
                for name, (start, end) in spans.items():
                    if not first:
                        sleep(GITHUB_SPACING_SECONDS)
                    first = False
                    pair = counts.setdefault(skill, {"recent": 0, "prior": 0, "terms": []})
                    pair[name] += _gh_total(client, topic, start, end)
                    if topic not in pair["terms"]:
                        pair["terms"].append(topic)
        progress(f"Developer attention (GitHub): {len(counts)} skills counted")
        return counts
    except (httpx.HTTPError, SourceUnavailable, KeyError, ValueError) as error:
        unavailable.append(f"GitHub ({type(error).__name__})")
        progress("Developer attention: GitHub unavailable, using the other sources")
        return {}


def _relative(counts: dict[str, dict], min_volume: int) -> dict[str, float]:
    """Growth of each skill against the median skill of the same source, clipped to [-1, 1]."""
    growth = {skill: (c["recent"] + 1) / (c["prior"] + 1)
              for skill, c in counts.items() if c["recent"] + c["prior"] >= min_volume and c["prior"] > 0}
    if len(growth) < MIN_SKILLS_PER_SOURCE:
        return {}
    typical = statistics.median(growth.values())
    return {skill: round(max(MOMENTUM_RANGE[0], min(MOMENTUM_RANGE[1], math.log2(g / typical))), 4)
            for skill, g in growth.items()}


def summarise(counts: dict[str, dict], today: dt.date, unavailable: list[str] | None = None) -> dict:
    """Per-skill attention: the mean of the sources that measured it, with each reading kept."""
    momentum = {source: _relative(values, MIN_VOLUME[source]) for source, values in counts.items()}
    attention = {}
    for skill in {s for values in momentum.values() for s in values}:
        readings = {source: values[skill] for source, values in momentum.items() if skill in values}
        value = round(statistics.mean(readings.values()), 4)
        attention[skill] = {
            "value": value,
            "label": "rising" if value > THRESHOLD else "declining" if value < -THRESHOLD else "steady",
            "readings": readings,
            "terms": next((counts[source][skill]["terms"] for source in counts if skill in counts[source]), []),
            "counts": {source: {k: counts[source][skill][k] for k in ("recent", "prior")}
                       for source in counts if skill in counts[source]},
        }
    return {
        "source": "Stack Overflow questions, GitHub repositories, npm and PyPI downloads",
        "source_url": f"{SO_API}/questions",
        "retrieved": today.isoformat(),
        "windows": {name: [str(start), str(end)] for name, (start, end) in windows(today).items()},
        "pypi_window_days": PYPI_WINDOW_DAYS,
        "counts": counts,
        "momentum": momentum,
        "attention": attention,
        "unavailable": unavailable or [],
    }
