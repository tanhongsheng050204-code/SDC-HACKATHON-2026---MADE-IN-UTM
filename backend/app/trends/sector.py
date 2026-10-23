"""Where Malaysian employment is moving between sectors: OpenDOSM `employment_sector`.

Source: OpenDOSM (DOSM) public API, dataset `employment_sector`: the share of Malaysian employment
in agriculture, industry and services, once a year since 2001. One request, official.

What it adds: the snapshot already carries growth by occupation group (nine MASCO groups) and the
national monthly labour force, but nothing about the structural shift between sectors. Over the last
five years services rose from 63.6% to 65.0% of employment while agriculture fell from 9.9% to 8.9%
and industry from 26.5% to 26.1%. Roles inherit their sector's shift (data/role_sectors.json).

Scoring: `points = clip(2 x the change in the sector's share, +/-4)`, so a one-point rise in the
sector's share is worth two points. Only three sectors exist, so this separates three groups of
roles, not twenty-three - which is why the cap is small.
"""

import datetime as dt
from collections.abc import Callable

import httpx

API_URL = "https://api.data.gov.my/data-catalogue/"
DATASET = "employment_sector"
SECTORS = ("agriculture", "industry", "services")
WINDOW_YEARS = 5
SECTOR_CAP = 4.0
SCALE = 2.0  # points per percentage point of share
SERIES_YEARS = 10


class SourceUnavailable(RuntimeError):
    pass


def summarise(rows: list[dict], today: dt.date) -> dict:
    """Each sector's share now, five years earlier, and the points a role in it receives."""
    by_year: dict[int, dict[str, float]] = {}
    for row in rows:
        if row.get("sex") != "both" or row.get("proportion") in (None, ""):
            continue
        by_year.setdefault(int(str(row["date"])[:4]), {})[row["sector"]] = float(row["proportion"])
    years = sorted(year for year, shares in by_year.items() if len(shares) == len(SECTORS))
    if len(years) <= WINDOW_YEARS:
        raise SourceUnavailable(f"{DATASET} returned {len(years)} usable years, need more")
    latest = years[-1]
    prior = latest - WINDOW_YEARS
    if prior not in by_year:
        prior = min(years, key=lambda y: abs(y - (latest - WINDOW_YEARS)))
    shares = {}
    for sector in SECTORS:
        change = round(by_year[latest][sector] - by_year[prior][sector], 2)
        shares[sector] = {"latest_pct": by_year[latest][sector], "prior_pct": by_year[prior][sector],
                          "change_pp": change,
                          "points": round(max(-SECTOR_CAP, min(SECTOR_CAP, change * SCALE)), 1)}
    return {
        "source": "OpenDOSM employment by sector, Malaysia (annual share of employment)",
        "source_url": f"https://open.dosm.gov.my/data-catalogue/{DATASET}",
        "retrieved": today.isoformat(),
        "dataset": DATASET,
        "years": [prior, latest],
        "shares": shares,
        "points": {sector: values["points"] for sector, values in shares.items()},
        "series": [{"year": year, **{s: by_year[year][s] for s in SECTORS}}
                   for year in years[-SERIES_YEARS:]],
    }


def collect(today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=45)
    try:
        progress("Malaysian sectors: reading OpenDOSM employment_sector")
        response = client.get(API_URL, params={"id": DATASET, "limit": 5000})
        response.raise_for_status()
        return summarise(response.json(), today)
    finally:
        if own_client:
            client.close()
