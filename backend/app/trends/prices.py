"""Prices: what a ringgit buys, from OpenDOSM's monthly consumer price index.

Source: OpenDOSM (DOSM) public API, dataset `cpi_headline`, division `overall`: the monthly
all-items CPI since 1980. One request, official, updated every month.

Why it is here: DOSM pay medians are 2025 ringgit, and every plan in Laluan runs to 2030. A pay
figure that ignores prices quietly overstates what a future salary buys. This block carries the
inflation reading and a deflator, so the app can show a group median in 2030 money next to the
published median.

It never changes a score: pay is a group median from a survey, not a forecast, and ranking on
projected real pay would compare guesses rather than jobs. It is context, dated like every other
number.

Rates are read month against the same month a year (or three years) earlier, never from yearly
averages: the newest year is only partly published, and averaging it would understate inflation.
"""

import datetime as dt
import statistics
from collections.abc import Callable

import httpx

API_URL = "https://api.data.gov.my/data-catalogue/"
DATASET = "cpi_headline"
DIVISION = "overall"
AVERAGE_YEARS = 3  # the inflation rate used for the projection
BASE_YEAR = 2025  # the year of the DOSM pay medians
HORIZON_YEAR = 2030  # the forecast horizon


class SourceUnavailable(RuntimeError):
    pass


def _monthly(rows: list[dict]) -> list[tuple[dt.date, float]]:
    """The all-items index, one point per month, oldest first."""
    out = {}
    for row in rows:
        if row.get("division") != DIVISION or row.get("index") in (None, ""):
            continue
        out[dt.date.fromisoformat(str(row["date"])[:10])] = float(row["index"])
    return sorted(out.items())


def _same_month(series: list[tuple[dt.date, float]], latest: dt.date, years: int) -> float | None:
    wanted = dt.date(latest.year - years, latest.month, 1)
    return next((value for month, value in series if month == wanted), None)


def summarise(rows: list[dict], today: dt.date) -> dict:
    """Latest inflation, a three-year average and the deflator from the pay year to the horizon."""
    series = _monthly(rows)
    if len(series) < 12 * (AVERAGE_YEARS + 1):
        raise SourceUnavailable(f"{DATASET} returned {len(series)} usable months, need more")
    latest_month, latest_index = series[-1]
    year_ago = _same_month(series, latest_month, 1)
    three_ago = _same_month(series, latest_month, AVERAGE_YEARS)
    if not year_ago or not three_ago:
        raise SourceUnavailable(f"{DATASET} is missing a comparison month for {latest_month}")
    yoy = latest_index / year_ago - 1
    average = (latest_index / three_ago) ** (1 / AVERAGE_YEARS) - 1
    by_year: dict[int, list[float]] = {}
    for month, value in series:
        by_year.setdefault(month.year, []).append(value)
    index = {year: round(statistics.mean(values), 2) for year, values in sorted(by_year.items()) if values}
    if BASE_YEAR not in index:
        raise SourceUnavailable(f"{DATASET} has no {BASE_YEAR} index")
    years_ahead = HORIZON_YEAR - BASE_YEAR
    deflator = (1 + average) ** years_ahead
    return {
        "source": "OpenDOSM Consumer Price Index, Malaysia (all items, monthly)",
        "source_url": f"https://open.dosm.gov.my/data-catalogue/{DATASET}",
        "retrieved": today.isoformat(),
        "dataset": DATASET,
        "division": DIVISION,
        "latest_month": latest_month.isoformat()[:7],
        "base_year": BASE_YEAR,
        "horizon_year": HORIZON_YEAR,
        "inflation_yoy_pct": round(yoy * 100, 2),
        "average_inflation_pct": round(average * 100, 2),
        "years_averaged": AVERAGE_YEARS,
        "deflator": round(deflator, 4),
        "index": {str(year): index[year] for year in sorted(index)[-(AVERAGE_YEARS + 5):]},
        "note": (f"Prices {BASE_YEAR} to {HORIZON_YEAR} at the {AVERAGE_YEARS}-year average of "
                 f"{average * 100:.1f}% a year; the projection is an assumption, not a forecast of inflation"),
    }


def real_value(amount: float, prices: dict | None) -> int | None:
    """A 2025 amount in horizon-year money, or None when there is no price block."""
    if not prices or not prices.get("deflator"):
        return None
    return int(round(amount * float(prices["deflator"])))


def collect(today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=45)
    try:
        progress("Prices: reading OpenDOSM cpi_headline (all items)")
        response = client.get(API_URL, params={"id": DATASET, "limit": 20000})
        response.raise_for_status()
        return summarise(response.json(), today)
    finally:
        if own_client:
            client.close()
