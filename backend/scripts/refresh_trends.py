"""Refresh trend data from the command line (same as the admin button).

    python scripts/refresh_trends.py            # reuse today's raw counts if they exist
    python scripts/refresh_trends.py --force    # collect again

Schedule it (cron, GitHub Actions or Windows Task Scheduler) to keep the forecast current.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.trends import refresh  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="collect again even if today's counts exist")
    args = parser.parse_args()
    refresh._log = print  # show progress on the console
    snapshot = refresh.run(force=args.force)
    print(f"\nNew snapshot: {snapshot['snapshot_id']}")
    print(f"Research source: {snapshot['inputs'][0]['source']}")
    for cap, m in snapshot["capability_momentum"].items():
        print(f"  {cap:26} {m:+.2f}")
    print("Role changes vs baseline:")
    for s in sorted(snapshot["signals"], key=lambda s: s["net_growth_pct"] - s["baseline_growth_pct"]):
        print(f"  {s['role_id']:30} {s['baseline_growth_pct']:+6.1f} -> {s['net_growth_pct']:+6.1f}"
              f"   (demand {s['demand_points']:+.1f}, AI {s['ai_points']:+.1f})")
