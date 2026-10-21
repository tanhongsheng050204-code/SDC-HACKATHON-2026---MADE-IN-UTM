"""Build data/day_in_job.json: "a day in this job" for every role, in EN / BM / 中文 (Phase 3, C1).

Gemini drafts each text from our own data only (O*NET tasks, work context, main skills, DOSM pay
group, SDG reason; see app/evidence/day.py). The output is committed and listed in REVIEW_LOG.md
for the team; a native speaker checks the BM and 中文. Needs GEMINI_API_KEY in backend/.env.

    python scripts/build_day_in_job.py              # every role
    python scripts/build_day_in_job.py admin_assistant data_analyst

Re-running replaces the text of the roles it drafts; the others are kept as they are.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.evidence import day  # noqa: E402
from app.reference import get_reference  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("roles", nargs="*", help="role ids (default: every role)")
    args = parser.parse_args()

    ref = get_reference()
    unknown = [r for r in args.roles if r not in ref.roles]
    if unknown:
        raise SystemExit(f"Unknown role ids: {', '.join(unknown)}")
    out_path = DATA_DIR / "day_in_job.json"
    previous = json.loads(out_path.read_text(encoding="utf-8"))["roles"] if out_path.exists() else {}

    roles, failed = dict(previous), []
    for role_id in args.roles or list(ref.roles):
        try:
            roles[role_id] = day.draft(ref, role_id)
            print(f"{role_id}: drafted")
        except Exception as error:
            failed.append(role_id)
            print(f"{role_id}: failed ({type(error).__name__}: {error})")

    out_path.write_text(json.dumps({
        "note": ("AI-drafted (Gemini) from our own data only: O*NET tasks, work context, main skills, "
                 "DOSM pay group and SDG reason. Team: read each text, have a native speaker check BM and "
                 "中文, and fill reviewed_by (REVIEW_LOG.md). An approved job-ad version in the database "
                 "replaces a role's text here."),
        "model": get_settings().gemini_model,
        "roles": {r: roles[r] for r in ref.roles if r in roles},
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path.name}: {len(roles)} roles" + (f"; failed: {', '.join(failed)}" if failed else ""))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
