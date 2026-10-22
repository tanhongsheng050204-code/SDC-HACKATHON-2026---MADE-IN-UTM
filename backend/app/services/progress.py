"""Progress over time toward the destination role: on track, ahead or behind a target date.

Every course finished (or unticked), skill proven and destination chosen is stored as a dated
event with the readiness toward the destination after it. With a target date the expected
readiness today is a straight line from where the person started (when they chose the
destination or set the date, whichever is later) to 100% on the target date. Within 5 points of
that line is "on track". With weekly study hours, the finish estimate is the course hours left
divided by those hours. Both are simple sums of the person's own numbers, explained in the app.
"""

import datetime as dt
import math

from app import store
from app.reference import Reference
from app.services.matching import effective_skills, fit_and_gap
from app.services import pathway

TOLERANCE = 0.05
MALAYSIA = dt.timezone(dt.timedelta(hours=8))


def today() -> dt.date:
    return dt.datetime.now(MALAYSIA).date()


def _local_date(stamp: str) -> dt.date:
    return dt.datetime.fromisoformat(stamp).astimezone(MALAYSIA).date()


def readiness(ref: Reference, profile: dict, role_id: str | None) -> float | None:
    if not role_id or role_id not in ref.roles:
        return None
    value, _, _ = fit_and_gap(ref.roles[role_id], effective_skills(ref, profile))
    return round(value, 4)


def record(ref: Reference, profile_id: str, kind: str, subject: str | None = None, detail: int | None = None) -> None:
    """Store an event with the readiness toward the profile's destination as it is now."""
    profile = store.get_profile(profile_id)
    if profile is None:
        return
    role_id = profile.get("target_role_id")
    store.add_event(profile_id, kind, subject, detail, role_id, readiness(ref, profile, role_id))


def _start(events: list[dict], role_id: str) -> dict | None:
    """Where the plan starts: the later of choosing this destination and setting the target date."""
    starts = [e for e in events if e["kind"] in ("destination_set", "plan_set") and e["role_id"] == role_id
              and e["readiness"] is not None]
    if not starts:
        return None
    last = starts[-1]
    return {"date": _local_date(last["created_at"]).isoformat(), "readiness": last["readiness"]}


def expected_by(start_date: dt.date, start_readiness: float, target: dt.date, on: dt.date) -> float:
    if target <= start_date:
        return 1.0
    share = min(1.0, max(0.0, (on - start_date).days / (target - start_date).days))
    return round(start_readiness + (1.0 - start_readiness) * share, 4)


def status_for(ready: float, expected: float) -> str:
    if ready >= 0.9999:
        return "done"
    if ready >= expected + TOLERANCE:
        return "ahead"
    if ready < expected - TOLERANCE:
        return "behind"
    return "on_track"


def _week_hours(ref: Reference, events: list[dict], now: dt.date) -> dict:
    """Course hours ticked as finished this week (Monday to Sunday, Malaysia time)."""
    monday = now - dt.timedelta(days=now.weekday())
    hours = {c["id"]: c["hours"] for c in ref.courses}
    total = 0
    for e in events:
        if _local_date(e["created_at"]) < monday or e["subject"] not in hours:
            continue
        if e["kind"] == "course_finished":
            total += hours[e["subject"]]
        elif e["kind"] == "course_unfinished":
            total -= hours[e["subject"]]
    return {"starts": monday.isoformat(), "hours_done": max(0, total)}


def summary(ref: Reference, profile: dict) -> dict:
    role_id = profile.get("target_role_id")
    events = store.list_events(profile["id"])
    now = today()
    base = {"role_id": role_id, "target_date": profile.get("target_date"), "weekly_hours": profile.get("weekly_hours"),
            "today": now.isoformat(), "week": {**_week_hours(ref, events, now), "target": profile.get("weekly_hours")}}
    if not role_id or role_id not in ref.roles:
        return {**base, "readiness": None, "hours_left": None, "total_hours": None, "start": None,
                "expected": None, "status": None, "finish_estimate": None, "points": []}
    plan = pathway.build(ref, profile, role_id, summarize=False)
    ready = plan["readiness"]
    start = _start(events, role_id)
    expected = status = None
    if profile.get("target_date") and start:
        expected = expected_by(dt.date.fromisoformat(start["date"]), start["readiness"],
                               dt.date.fromisoformat(profile["target_date"]), now)
        status = status_for(ready, expected)
    elif ready >= 0.9999:
        status = "done"
    finish = None
    if profile.get("weekly_hours") and plan["hours_left"]:
        finish = (now + dt.timedelta(weeks=math.ceil(plan["hours_left"] / profile["weekly_hours"]))).isoformat()
    points = [{"date": _local_date(e["created_at"]).isoformat(), "readiness": e["readiness"], "kind": e["kind"],
               "subject": e["subject"]}
              for e in events if e["role_id"] == role_id and e["readiness"] is not None]
    return {**base, "readiness": ready, "hours_left": plan["hours_left"], "total_hours": plan["total_hours"],
            "start": start, "expected": expected, "status": status, "finish_estimate": finish, "points": points}
