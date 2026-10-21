"""Your job, with AI: the person's own role, AI-assisted, as the first option before moving roles.

Most working adults keep their job and learn to run AI tools inside it. This shows, for the
person's current role: what changes in each of its O*NET tasks (AI does it and you check it, AI
speeds it up, or it stays yours), the AI skills to add (data/ai_upgrade.json, drafted from our
capability and task data and reviewed by the team), a pathway that counts every skill they already
have, and approved emerging roles that start from this job.

It is never ranked and has no outlook of its own: there is no published forecast for an
"AI-assisted" version of a job, so the card shows the current role's outlook and nothing invented.
"""

from app import store
from app.reference import Reference
from app.services import pathway, tasks
from app.services.matching import effective_skills, fit_and_gap

# What happens to each kind of task once the person runs the AI tools themselves.
TASK_CHANGE = {"automate": "check", "assist": "faster", "human": "yours"}


def upgraded_role(ref: Reference, role_id: str) -> dict | None:
    """The role with its AI skills added (weight 2, important), or None when it has none."""
    entry = ref.ai_upgrade.get(role_id) or {}
    ai = [s["skill_id"] for s in entry.get("ai_skills", []) if s["skill_id"] in ref.skills]
    if not ai:
        return None
    role = ref.roles[role_id]
    return {**role, "skills": [*role["skills"], *({"skill_id": s, "weight": 2, "source": "ai_upgrade"} for s in ai)]}


def for_profile(ref: Reference, profile: dict, role_id: str | None = None) -> dict | None:
    role_id = role_id or profile.get("current_role_id")
    if not role_id or role_id not in ref.roles:
        return None
    upgraded = upgraded_role(ref, role_id)
    if upgraded is None:
        return None
    have = effective_skills(ref, profile)
    readiness, _, _ = fit_and_gap(upgraded, have)
    plan = pathway.build(ref, profile, role_id, summarize=False, role_override=upgraded)
    task_view = tasks.for_role(ref, role_id)
    why = {s["skill_id"]: s["why"] for s in ref.ai_upgrade[role_id]["ai_skills"]}
    leads_to = [{"capability_id": cid, "title": card["title"]}
                for cid, card in store.latest_approved_evidence("emerging").items()
                if card.get("stepping_stone") == role_id]
    return {
        "role_id": role_id,
        "title": ref.roles[role_id]["title"],
        "readiness": readiness,
        "ai_skills": [{"skill_id": s, "name": ref.skills[s]["name"], "why": why[s], "have": s in have} for s in why
                      if s in ref.skills],
        "tasks": [{"id": t["id"], "text": t["text"], "label": t["label"], "change": TASK_CHANGE[t["label"]]}
                  for t in task_view["tasks"]],
        "task_shares": task_view["shares"],
        "steps": plan["steps"],
        "total_hours": plan["total_hours"],
        "hours_left": plan.get("hours_left", 0),
        "leads_to": leads_to,
        "reviewed_by": ref.ai_upgrade[role_id].get("reviewed_by"),
    }
