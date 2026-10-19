"""Build a dated signal snapshot from a CSV of real figures (task 2.2).

CSV columns: role_id, net_growth_pct, automation_exposure, ai_complementarity, note
Fill it from the source (e.g. WEF Future of Jobs Report 2025 tables) and write the table or page
each figure came from in `note`.

    python scripts/build_snapshot.py data/raw/wef_2025.csv \
        --source "WEF Future of Jobs Report 2025" \
        --source-url https://www.weforum.org/publications/the-future-of-jobs-report-2025/ \
        --published 2025-01-07 --horizon-year 2030 --slug wef-foj-2025
"""

import argparse
import csv
import datetime as dt
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--published", required=True)
    parser.add_argument("--horizon-year", type=int, required=True)
    parser.add_argument("--slug", required=True)
    args = parser.parse_args()

    roles = {r["id"] for r in json.loads((DATA_DIR / "roles.json").read_text(encoding="utf-8"))}
    signals = []
    with args.csv_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["role_id"] not in roles:
                raise SystemExit(f"Unknown role_id {row['role_id']!r}: add it to roles.json first")
            signals.append({
                "role_id": row["role_id"],
                "net_growth_pct": float(row["net_growth_pct"]),
                "automation_exposure": float(row["automation_exposure"]),
                "ai_complementarity": float(row["ai_complementarity"]),
                "note": row.get("note") or None,
            })

    today = dt.date.today().isoformat()
    snapshot_id = f"{today}-{args.slug}"
    out = DATA_DIR / "signals" / f"{snapshot_id}.json"
    if out.exists():
        raise SystemExit(f"{out} already exists; snapshots are immutable")
    out.write_text(json.dumps({
        "snapshot_id": snapshot_id,
        "source": args.source,
        "source_url": args.source_url,
        "published": args.published,
        "imported": today,
        "horizon_year": args.horizon_year,
        "illustrative": False,
        "signals": signals,
    }, indent=2), encoding="utf-8")
    print(f"Wrote {out} with {len(signals)} signals")


if __name__ == "__main__":
    main()
