"""Download the latest Malaysian pay and jobs figures by occupation group from DOSM.

    python scripts/refresh_malaysia.py

Writes data/malaysia_pay.json (used by the app) and keeps the raw CSV in data/raw/dosm/.
DOSM updates the dataset once a year; see app/trends/malaysia.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.trends import malaysia  # noqa: E402

if __name__ == "__main__":
    summary = malaysia.refresh(get_settings().data_dir)
    print(f"DOSM {summary['year']} (employees compared with {summary['trend_from']}):")
    for group in summary["groups"].values():
        change = group["employees_change_pct"]
        print(f"  {group['label']:52} median RM {group['median_rm']:>5,}   employees "
              f"{'n/a' if change is None else f'{change:+.1f}%'}")
