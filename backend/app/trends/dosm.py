"""Malaysian job-market signal: how fast employment grows in each occupation group.

Source: OpenDOSM (Department of Statistics Malaysia) public API, dataset `wages_occupation` from
the annual Salaries & Wages Survey. Its `recipients` column is the number of salaried employees
(thousands) per MASCO major group. The latest year is compared with WINDOW_YEARS earlier, as growth
above or below all employees, so a growing workforce does not look like rising demand for every
group. Nine groups only, so every role in a group gets the same reading.
"""

import datetime as dt
from collections.abc import Callable

import httpx

API_URL = "https://api.data.gov.my/data-catalogue/"
DATASET = "wages_occupation"
WINDOW_YEARS = 3

# OpenDOSM occupation names -> MASCO 2020 major group ids (as in roles.json and salaries.json).
MASCO = {"managers": "1", "professionals": "2", "technicians": "3", "clerical": "4",
         "service_sales": "5", "agriculture": "6", "craft": "7", "operators": "8", "elementary": "9"}


def summarise(rows: list[dict]) -> dict:
    """Employees per group in the latest year and WINDOW_YEARS before it."""
    both = [r for r in rows if r.get("sex") == "both"]
    latest = max(int(r["date"][:4]) for r in both)
    prior = latest - WINDOW_YEARS
    by_year = {(int(r["date"][:4]), r["occupation"]): float(r["recipients"]) for r in both}

    def pair(name: str) -> dict:
        return {"recent": by_year[(latest, name)], "prior": by_year[(prior, name)]}

    return {"years": [prior, latest], "overall": pair("overall"),
            "groups": {masco: pair(name) for name, masco in MASCO.items()}}


def collect(today: dt.date, *, client: httpx.Client | None = None,
            progress: Callable[[str], None] = lambda _: None) -> dict:
    own_client = client is None
    client = client or httpx.Client(timeout=30)
    try:
        progress("Malaysian employment: reading OpenDOSM wages_occupation")
        response = client.get(API_URL, params={"id": DATASET, "filter": "both@sex", "limit": 1000})
        response.raise_for_status()
        summary = summarise(response.json())
    finally:
        if own_client:
            client.close()
    return {"source": "OpenDOSM Salaries & Wages Survey (employees by occupation)",
            "source_url": f"https://open.dosm.gov.my/data-catalogue/{DATASET}",
            "retrieved": str(today), "dataset": DATASET, **summary}
