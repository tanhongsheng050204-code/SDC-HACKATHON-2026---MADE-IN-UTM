"""Malaysian pay and jobs by occupation group, from the Department of Statistics Malaysia (DOSM).

Source: "Annual Salaries & Wages by Occupation & Sex" on OpenDOSM (CC BY 4.0), a direct CSV
download updated once a year. It gives, for each MASCO major occupation group, the number of
salaried Malaysian employees and their median and mean monthly pay. We use it for two things a
role card needs and the WEF figures cannot give: typical pay in Malaysia, and whether the number
of people employed in that kind of work in Malaysia has grown since 2019, before the pandemic.

The groups are broad (nine MASCO major groups), so every role shows which group it was matched to.
"""

import csv
import datetime as dt
import io
import json
from pathlib import Path

import httpx

CSV_URL = "https://storage.dosm.gov.my/labour/wages_occupation.csv"
PAGE_URL = "https://open.dosm.gov.my/data-catalogue/wages_occupation"
TREND_FROM = 2019  # the last year before the pandemic; 2020-21 would exaggerate any recovery

GROUPS = {
    "managers": "Managers",
    "professionals": "Professionals",
    "technicians": "Technicians and associate professionals",
    "clerical": "Clerical support workers",
    "service_sales": "Service and sales workers",
    "agriculture": "Skilled agricultural, forestry and fishery workers",
    "craft": "Craft and related trades workers",
    "operators": "Plant and machine operators and assemblers",
    "elementary": "Elementary occupations",
}


def download(timeout: float = 30.0) -> str:
    response = httpx.get(CSV_URL, timeout=timeout, follow_redirects=True)
    response.raise_for_status()
    return response.text


def summarise(csv_text: str, retrieved: dt.date) -> dict:
    """Latest year's pay per group, and the change in employees since TREND_FROM."""
    rows = [r for r in csv.DictReader(io.StringIO(csv_text)) if r["sex"] == "both" and r["occupation"] in GROUPS]
    by_group: dict[str, dict[int, dict]] = {}
    for r in rows:
        by_group.setdefault(r["occupation"], {})[int(r["date"][:4])] = r
    latest = max(year for years in by_group.values() for year in years)
    earlier = TREND_FROM
    groups = {}
    for group, years in by_group.items():
        now, then = years.get(latest), years.get(earlier)
        if not now:
            continue
        change = None
        if then and float(then["recipients"]) > 0:
            change = round((float(now["recipients"]) / float(then["recipients"]) - 1) * 100, 1)
        groups[group] = {
            "label": GROUPS[group],
            "median_rm": int(float(now["wages_median"])),
            "mean_rm": int(float(now["wages_mean"])),
            "employees_thousands": float(now["recipients"]),
            "employees_change_pct": change,
        }
    return {
        "source": "Department of Statistics Malaysia (DOSM), Annual Salaries & Wages by Occupation & Sex",
        "source_url": PAGE_URL, "csv_url": CSV_URL, "licence": "CC BY 4.0",
        "year": latest, "trend_from": earlier, "retrieved": retrieved.isoformat(),
        "note": "Malaysian citizen employees; monthly pay excludes bonuses. Groups are MASCO major groups.",
        "groups": groups,
    }


def refresh(data_dir: Path, today: dt.date | None = None) -> dict:
    """Download the CSV, keep the raw copy under data/raw/dosm/, and rewrite data/malaysia_pay.json."""
    today = today or dt.date.today()
    text = download()
    raw = data_dir / "raw" / "dosm" / f"wages_occupation_{today}.csv"
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_text(text, encoding="utf-8")
    summary = summarise(text, today)
    (data_dir / "malaysia_pay.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
