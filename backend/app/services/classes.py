"""What a counsellor sees about each student who joined their class: only the fields listed in
SHARED, built from the student's own progress. Never the skill list, survey answers, CV or chats.
The same list is shown to the student before they join (frontend JoinClass)."""

import datetime as dt

from app import store
from app.reference import Reference
from app.services import progress

SHARED = ("display_name", "destination", "readiness", "courses_finished", "skills_proven", "last_active", "target_date",
          "status")


def _last_active(profile: dict, events: list[dict]) -> str:
    stamps = [profile["updated_at"]] + [e["created_at"] for e in events]
    return max(dt.datetime.fromisoformat(s) for s in stamps).astimezone(progress.MALAYSIA).date().isoformat()


def student_row(ref: Reference, profile: dict) -> dict:
    summary = progress.summary(ref, profile)
    role_id = profile.get("target_role_id")
    proven = profile.get("skill_levels") or {}
    return {
        "display_name": (profile.get("display_name") or "").replace("(demo)", "").strip() or None,
        "destination": ref.roles[role_id]["title"] if role_id in ref.roles else None,
        "readiness": summary["readiness"],
        "courses_finished": len(profile.get("completed_courses") or []),
        "skills_proven": [{"name": ref.skills[s]["name"], "level": level} for s, level in sorted(proven.items()) if s in ref.skills],
        "last_active": _last_active(profile, store.list_events(profile["id"])),
        "target_date": summary["target_date"],
        "status": summary["status"],
    }


def dashboard(ref: Reference, klass: dict) -> dict:
    rows = []
    for profile_id in store.member_ids(klass["id"]):
        profile = store.get_profile(profile_id)
        if profile is not None:
            rows.append(student_row(ref, profile))
    counts = {s: sum(1 for r in rows if r["status"] == s) for s in ("on_track", "ahead", "behind", "done")}
    counts["no_date"] = sum(1 for r in rows if r["status"] is None)
    return {"id": klass["id"], "name": klass["name"], "code": klass["code"], "created_at": klass["created_at"],
            "students": rows, "counts": counts, "shared": list(SHARED)}
