"""Future Card: a read-only summary of one person's move to one role, shared by a random link.

It is rebuilt from the live profile each time it is opened, so it never goes stale and it
disappears when the profile is deleted. It shows the display name the person chose (if any),
the target role, readiness, outlook and the plan in brief: never the profile ID or the full
skill list.
"""

from app.reference import Reference
from app.services import matching, pathway


def view(ref: Reference, profile: dict, card: dict) -> dict:
    role_id = card["role_id"]
    role_match = next(r for r in matching.match(ref, profile, "baseline")["roles"] if r["role_id"] == role_id)
    plan = pathway.build(ref, profile, role_id, summarize=False)
    return {
        "card_id": card["id"],
        "created_at": card["created_at"],
        "display_name": profile["display_name"],
        "role": {"role_id": role_id, "title": role_match["title"], "summary": role_match["summary"]},
        "readiness": plan["readiness"],
        "outlook": role_match["outlook"]["baseline"],
        "estimate_range": role_match["estimate_range"],
        "robust_pick": role_match["robust_pick"],
        "next_skills": [s["name"] for s in role_match["missing"][:3]],
        "steps": len(plan["steps"]),
        "hours": plan.get("hours_left", 0),
        "first_step": plan["steps"][0]["course"]["title"] if plan["steps"] else None,
        "sdgs": role_match["sdgs"],
        "source": role_match["citation"],
    }
