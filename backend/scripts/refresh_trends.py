"""Refresh trend data from the command line (same as the admin button).

    python scripts/refresh_trends.py                         # reuse today's raw counts if they exist
    python scripts/refresh_trends.py --force                 # collect again
    python scripts/refresh_trends.py --approve-as "Your name"  # you reviewed the output: publish it

Without --approve-as the snapshot waits in data/signals/pending/ for review in the app.

Schedule it (cron, GitHub Actions or Windows Task Scheduler) to keep the forecast current.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.trends import refresh, review  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="collect again even if today's counts exist")
    parser.add_argument("--approve-as", metavar="NAME", help="publish straight away, recorded as reviewed by NAME")
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
              f"   (demand {s['demand_points']:+.1f}, Malaysia {s.get('local_points', 0):+.1f}, AI {s['ai_points']:+.1f})")
    if args.approve_as:
        review.approve(snapshot["snapshot_id"], args.approve_as)
        print(f"
Published, reviewed by {args.approve_as}.")
    else:
        print("
Waiting for review: approve or reject it under Admin on the Future roles screen.")
