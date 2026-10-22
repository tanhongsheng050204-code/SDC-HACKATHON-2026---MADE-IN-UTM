"""Plan checks: rules (no AI) that spot a plan that cannot work as set, from the person's own
numbers and the published data. Each check names its numbers, so the app can say exactly why:

- hours_short: the course hours left, spread over the weeks to the target date, need more hours a
  week than the person said they have.
- no_hours: a target date with no weekly hours, so Laluan cannot tell whether it fits.
- date_passed: the target date is gone and the plan is not finished.
- declining / declining_fast: the destination is Declining under Baseline, or only under Accelerated.
- licence: the destination needs a licence, which courses alone do not give.
- long_shot: none of the destination's core skills yet; a stepping stone is named when there is one.
"""

import datetime as dt
import math

from app.reference import Reference
from app.services import matching, progress

WARN, INFO = "warn", "info"


def check(ref: Reference, profile: dict) -> list[dict]:
    role_id = profile.get("target_role_id")
    if not role_id or role_id not in ref.roles:
        return []
    found: list[dict] = []
    summary = progress.summary(ref, profile)
    left = summary["hours_left"] or 0
    target = profile.get("target_date")
    weekly = profile.get("weekly_hours")
    today = progress.today()
    if target and left > 0:
        day = dt.date.fromisoformat(target)
        if day <= today:
            found.append({"kind": "date_passed", "level": WARN, "target_date": target})
        else:
            weeks = max(1, math.ceil((day - today).days / 7))
            need = math.ceil(left / weeks)
            if weekly is None:
                found.append({"kind": "no_hours", "level": INFO, "need": need, "hours_left": left, "target_date": target})
            elif need > weekly:
                found.append({"kind": "hours_short", "level": WARN, "need": need, "weekly_hours": weekly,
                              "hours_left": left, "target_date": target})
    result = matching.match(ref, profile, "baseline")
    rows = {r["role_id"]: r for r in result["roles"]}
    row = rows.get(role_id)
    if row is not None:
        labels = {s: row["outlook"][s]["label"] for s in ("baseline", "accelerated")}
        if labels["baseline"] == "declining":
            found.append({"kind": "declining", "level": WARN, "index": row["outlook"]["baseline"]["index"]})
        elif labels["accelerated"] == "declining":
            found.append({"kind": "declining_fast", "level": INFO, "index": row["outlook"]["accelerated"]["index"]})
        licence = row["requirements"].get("licence")
        if row["requirements"]["needs_licence"] and licence:
            found.append({"kind": "licence", "level": WARN, "licence": licence["name"],
                          "months": licence.get("route_months")})
        elif row["long_shot"]:
            stone = row.get("stepping_stone")
            found.append({"kind": "long_shot", "level": INFO, "fit": row["fit"],
                          "stepping_stone": stone["title"] if stone else None})
    return found
