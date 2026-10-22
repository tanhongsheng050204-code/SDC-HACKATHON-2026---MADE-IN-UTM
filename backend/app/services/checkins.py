"""Counsellor check-ins: an agenda built from the student's shared progress, and actions the
counsellor proposes that change nothing until the student accepts them.

Nothing about the conversation itself is stored: no notes, recording or transcript. A student is
addressed by a key made from the class and profile IDs, so the profile ID never reaches the
counsellor's browser.
"""

import datetime as dt
import hashlib

from app import store
from app.reference import Reference
from app.services import classes, pathway, plancheck

KINDS = ("target_date", "weekly_hours", "next_course", "prove_skill", "practise")
MAX_OPEN = 10
SINCE_DAYS = 14


def key(class_id: str, profile_id: str) -> str:
    return hashlib.sha256(f"{class_id}:{profile_id}".encode()).hexdigest()[:16]


def member(class_id: str, member_key: str) -> dict | None:
    for profile_id in store.member_ids(class_id):
        if key(class_id, profile_id) == member_key:
            return store.get_profile(profile_id)
    return None


def _options(ref: Reference, profile: dict) -> dict:
    """What a counsellor can propose for this student: courses on their own pathway not finished
    yet, and the destination's skills not yet proven at Basic level or above."""
    role_id = profile.get("target_role_id")
    if not role_id or role_id not in ref.roles:
        return {"courses": [], "skills": []}
    plan = pathway.build(ref, profile, role_id, summarize=False)
    courses = [{"id": s["course"]["id"], "title": s["course"]["title"], "hours": s["course"]["hours"]}
               for s in plan["steps"] if not s["done"]]
    proven = profile.get("skill_levels") or {}
    skills = [{"id": rs["skill_id"], "name": ref.skills[rs["skill_id"]]["name"]}
              for rs in ref.roles[role_id]["skills"] if proven.get(rs["skill_id"], 0) < 1 and rs["skill_id"] in ref.skills]
    return {"courses": courses, "skills": skills}


def agenda(ref: Reference, klass: dict, profile: dict) -> dict:
    actions = store.actions_for(klass["id"], profile["id"])
    last = max((a["created_at"] for a in actions), default=None)
    since = dt.datetime.fromisoformat(last) if last else dt.datetime.now(dt.UTC) - dt.timedelta(days=SINCE_DAYS)
    recent = [e for e in store.list_events(profile["id"]) if dt.datetime.fromisoformat(e["created_at"]) > since]
    options = _options(ref, profile)
    return {
        "key": key(klass["id"], profile["id"]),
        "student": classes.student_row(ref, profile),
        "since": since.date().isoformat(),
        "since_last_checkin": last is not None,
        "recent": {"courses_finished": sum(1 for e in recent if e["kind"] == "course_finished"),
                   "skills_proven": sum(1 for e in recent if e["kind"] == "skill_proven")},
        "next_course": options["courses"][0] if options["courses"] else None,
        "checks": plancheck.check(ref, profile),
        "options": options,
        "actions": [_public(ref, a) for a in actions],
    }


def _label(ref: Reference, action: dict) -> str | None:
    """The course, skill or role an action names, by its title (dates and hours need none)."""
    value = action.get("value")
    if action["kind"] == "next_course":
        return next((c["title"] for c in ref.courses if c["id"] == value), None)
    if action["kind"] == "prove_skill":
        return ref.skills.get(value, {}).get("name")
    if action["kind"] == "practise":
        return ref.roles.get(value, {}).get("title")
    return None


def _public(ref: Reference, action: dict) -> dict:
    return {**{k: action.get(k) for k in ("id", "kind", "value", "status", "created_at", "decided_at", "class_name", "counsellor")},
            "label": _label(ref, action)}


def validate(ref: Reference, profile: dict, kind: str, value: str | None) -> str | None:
    """The cleaned value, or raises ValueError with a message the counsellor sees."""
    if kind not in KINDS:
        raise ValueError("Unknown action")
    if kind == "target_date":
        try:
            day = dt.date.fromisoformat(value or "")
        except ValueError as error:
            raise ValueError("Choose a date") from error
        from app.services.progress import today
        if day <= today():
            raise ValueError("Choose a date after today")
        return day.isoformat()
    if kind == "weekly_hours":
        if not (value or "").isdigit() or not 1 <= int(value) <= 40:
            raise ValueError("Choose 1 to 40 hours a week")
        return str(int(value))
    if kind == "practise":
        if not profile.get("target_role_id"):
            raise ValueError("The student has no destination yet")
        return profile["target_role_id"]
    options = _options(ref, profile)
    allowed = {c["id"] for c in options["courses"]} if kind == "next_course" else {s["id"] for s in options["skills"]}
    if value not in allowed:
        raise ValueError("Choose one from the student's own pathway")
    return value


def open_count(class_id: str, profile_id: str) -> int:
    return sum(1 for a in store.actions_for(class_id, profile_id) if a["status"] == "proposed")


def for_student(ref: Reference, profile_id: str) -> list[dict]:
    return [_public(ref, a) for a in store.actions_for_profile(profile_id)]
