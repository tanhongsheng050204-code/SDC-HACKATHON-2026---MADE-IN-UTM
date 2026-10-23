"""Malaysian labour market, month by month: OpenDOSM Labour Force Survey.

Source: OpenDOSM (Department of Statistics Malaysia) public API, dataset `lfs_month`: the national
labour force every month since 2010, with the number employed, the number unemployed, the
unemployment rate and the participation rate.

What this adds: until now the snapshot's Malaysian channel moved once a year (wages_occupation,
nine coarse occupation groups, three-year steps). This series is monthly and official, so the
market-wide part of every outlook can be refreshed every month instead of once a year.

Scoring, and why it is small:

    points = clip( (employment growth year on year - its own five-year median)
                   - 2 x (change in the unemployment rate over twelve months), +/-3 )

A national figure says how the job market is doing, not which job is doing better, so the same
small adjustment is added to every role: it moves the level of every outlook and leaves the
ranking alone. That is deliberate - the role-specific channels (job postings, Malaysian
employment by occupation, AI research) are the ones allowed to reorder roles.

Stale data scores nothing: if the newest month is older than MAX_AGE_DAYS the block is still
reported (so the Sources page can show the gap) but `points` is 0.
"""

import datetime as dt
import statistics
from collections.abc import Callable

import httpx

API_URL = "https://api.data.gov.my/data-catalogue/"
DATASET = "lfs_month"
SERIES_MONTHS = 36  # kept for the chart and the snapshot
BASELINE_MONTHS = 60  # five years, for the "what is normal for Malaysia" growth rate
MAX_AGE_DAYS = 120  # a month not published yet should not look like a collapse
CLIMATE_CAP = 3.0  # points, market-wide
UNEMPLOYMENT_WEIGHT = 2.0  # one point of unemployment rate counts as two points of employment growth


class SourceUnavailable(RuntimeError):
    pass


def _month(row: dict) -> dt.date:
    return dt.date.fromisoformat(str(row["date"])[:10])


def _points(rows: list[dict]) -> list[dict]:
    """The series in a small shape, oldest first, skipping rows with no employment figure."""
    out = []
    for row in sorted(rows, key=lambda r: str(r["date"])):
        employed = row.get("lf_employed")
        if employed in (None, ""):
            continue
        out.append({"month": str(row["date"])[:7], "employed": float(employed),
                    "unemployment_rate": float(row.get("u_rate") or 0.0),
                    "participation_rate": float(row.get("p_rate") or 0.0)})
    return out


def _yearly_growth(points: list[dict]) -> list[float]:
    """Year-on-year employment growth for every month that has the same month a year earlier."""
    return [round((points[i]["employed"] / points[i - 12]["employed"] - 1) * 100, 2)
            for i in range(12, len(points)) if points[i - 12]["employed"]]


def summarise(rows: list[dict], today: dt.date) -> dict:
    """Latest month, the change against a year earlier, and the market-wide adjustment."""
    points = _points(rows)
    if len(points) < 13:
        raise SourceUnavailable(f"{DATASET} returned {len(points)} usable months, need at least 13")
    latest, year_ago = points[-1], points[-13]
    growth = round((latest["employed"] / year_ago["employed"] - 1) * 100, 2) if year_ago["employed"] else 0.0
    # What counts as normal here: the median yearly growth before the last twelve months.
    earlier = _yearly_growth(points)[:-12]
    baseline = round(statistics.median(earlier), 2) if earlier else 0.0
    u_change = round(latest["unemployment_rate"] - year_ago["unemployment_rate"], 2)
    raw = (growth - baseline) - UNEMPLOYMENT_WEIGHT * u_change
    age_days = (today - dt.date(int(latest["month"][:4]), int(latest["month"][5:7]), 1)).days
    stale = age_days > MAX_AGE_DAYS
    return {
        "source": "OpenDOSM Labour Force Survey, Malaysia (monthly)",
        "source_url": f"https://open.dosm.gov.my/data-catalogue/{DATASET}",
        "retrieved": today.isoformat(),
        "dataset": DATASET,
        "latest_month": latest["month"],
        "age_days": age_days,
        "stale": stale,
        "employed_thousand": round(latest["employed"], 1),
        "employment_growth_yoy_pct": growth,
        "baseline_growth_pct": baseline,
        "unemployment_rate_pct": latest["unemployment_rate"],
        "unemployment_change_pp": u_change,
        "participation_rate_pct": latest["participation_rate"],
        "raw_points": round(raw, 2),
        "points": 0.0 if stale else round(max(-CLIMATE_CAP, min(CLIMATE_CAP, raw)), 1),
        "months_used": len(points),
        "series": points[-SERIES_MONTHS:],
    }


def collect(today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=45)
    try:
        progress("Malaysian labour market: reading OpenDOSM lfs_month")
        response = client.get(API_URL, params={"id": DATASET, "limit": 5000})
        response.raise_for_status()
        return summarise(response.json(), today)
    finally:
        if own_client:
            client.close()
