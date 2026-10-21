"""The four-step journey that orders the app: where I stand, explore roles, build my skills,
apply and share.

A step is done when:
1. stand:   skills are saved, and workers and career switchers have named their current job;
2. explore: a target role is chosen (not just opened);
3. build:   at least one skill is proven, or one course is finished;
4. apply:   interview practice is finished, or a Future Card exists for the target role.

The next step is the first one not done; the app turns it into the one button on the Today screen.
"""

from app import store
from app.reference import Reference

STEPS = ("stand", "explore", "build", "apply")


def progress(ref: Reference, profile: dict) -> dict:
    target = profile.get("target_role_id")
    target = target if target in ref.roles else None
    needs_job = profile.get("audience") in ("worker", "switcher")
    done = {
        "stand": bool(profile["skills"]) and (not needs_job or bool(profile.get("current_role_id"))),
        "explore": target is not None,
        "build": any(level >= 1 for level in (profile.get("skill_levels") or {}).values())
                 or bool(profile.get("completed_courses")),
        "apply": bool(profile.get("practised_at")) or (target is not None and target in store.card_roles(profile["id"])),
    }
    nxt = next((s for s in STEPS if not done[s]), None)
    return {"steps": [{"id": s, "done": done[s]} for s in STEPS], "next": nxt, "target_role_id": target,
            "target_title": ref.roles[target]["title"] if target else None}
