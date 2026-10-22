"""Why a destination was chosen, and what has changed since.

When someone picks a destination, Laluan keeps the facts it showed them at that moment (skill fit,
the Baseline outlook, plan hours, whether it was a long shot, and the forecast snapshot) and the
reasons they ticked from a fixed list. Later the same facts are worked out again, so the app can
say "you chose this because it was growing at +35%; under the newest forecast it is +20%".
"""

from app import store
from app.reference import Reference
from app.services import matching

REASONS = ("fits_skills", "growing", "short_plan", "enjoy", "pay", "robust")
SCENARIO = "baseline"


def facts(ref: Reference, profile: dict, role_id: str) -> dict | None:
    result = matching.match(ref, profile, SCENARIO)
    row = next((r for r in result["roles"] if r["role_id"] == role_id), None)
    if row is None:  # the person's own current role: not a move, nothing to compare
        return None
    outlook = row["outlook"][SCENARIO]
    return {"fit": row["fit"], "outlook_index": outlook["index"], "outlook_label": outlook["label"],
            "plan_hours": row["plan_hours"], "rank": row["rank"], "long_shot": row["long_shot"],
            "robust_pick": row["robust_pick"], "snapshot_id": result["signal_source"]["snapshot_id"]}


def record(ref: Reference, profile_id: str, role_id: str) -> None:
    profile = store.get_profile(profile_id)
    found = facts(ref, profile, role_id) if profile else None
    if found is not None:
        store.add_decision(profile_id, role_id, found)


def latest(profile: dict) -> dict | None:
    """The newest decision for the current destination, or None."""
    role_id = profile.get("target_role_id")
    rows = [d for d in store.list_decisions(profile["id"]) if d["role_id"] == role_id]
    return rows[-1] if rows else None


def compare(ref: Reference, profile: dict) -> dict | None:
    decision = latest(profile)
    if decision is None or decision["role_id"] not in ref.roles:
        return None
    then = decision["facts"]
    now = facts(ref, profile, decision["role_id"]) or then
    changed = [k for k in ("outlook_label", "rank", "long_shot", "robust_pick") if then.get(k) != now.get(k)]
    if abs((now["outlook_index"] or 0) - (then["outlook_index"] or 0)) >= 5:
        changed.append("outlook_index")
    if now["snapshot_id"] != then["snapshot_id"]:
        changed.append("snapshot_id")
    return {"id": decision["id"], "role_id": decision["role_id"], "title": ref.roles[decision["role_id"]]["title"],
            "chosen_at": decision["created_at"], "reasons": decision["reasons"], "then": then, "now": now,
            "changed": changed, "options": list(REASONS)}
