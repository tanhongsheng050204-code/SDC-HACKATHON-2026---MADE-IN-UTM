"""The skill tree for one target role: the role's skills plus everything they build on.

Order comes from data/skill_prereqs.json (fixed and team-reviewed, so the tree doesn't change
between visits). A node is unlocked once each prerequisite is a skill the person has (from their
CV, a finished course, or a proven level). Levels 1-3 (Basic, Working, Advanced) are earned only
through proof checks (app/services/proofcheck.py).
"""


from app.reference import Reference
from app.services import pathway
from app.services.matching import effective_skills


def _closure(ref: Reference, skill_ids: list[str]) -> list[str]:
    seen: list[str] = []
    stack = list(skill_ids)
    while stack:
        skill_id = stack.pop()
        if skill_id not in seen:
            seen.append(skill_id)
            stack.extend(ref.skill_prereqs.get(skill_id, []))
    return seen


# A skill's difficulty tier (data/skills.json) is the lowest row it can sit on.
TIER_ROW = {"foundation": 0, "core": 1, "advanced": 2}


def _depth(ref: Reference, skill_id: str, memo: dict[str, int]) -> int:
    """The skill's row in the tree, counted from the bottom: the higher of its difficulty tier and one
    above each of its prerequisites. So a skill always sits above what it builds on, and an advanced
    skill never sits beside a foundation one even when no prerequisite links them."""
    if skill_id not in memo:
        prereqs = ref.skill_prereqs.get(skill_id, [])
        tier = TIER_ROW.get(ref.skills[skill_id].get("tier", "foundation"), 0)
        memo[skill_id] = max(tier, 1 + max((_depth(ref, p, memo) for p in prereqs), default=-1))
    return memo[skill_id]


def course_for(ref: Reference, skill_id: str) -> dict | None:
    teaching = [c for c in ref.courses if skill_id in c["skills"]]
    course = next((c for c in teaching if c.get("url")), teaching[0] if teaching else None)  # one people can open first
    return {k: course[k] for k in ("id", "title", "url", "hours", "cost")} if course else None


def is_unlocked(ref: Reference, profile: dict, skill_id: str) -> bool:
    have = effective_skills(ref, profile)
    return all(p in have for p in ref.skill_prereqs.get(skill_id, []))


def build(ref: Reference, profile: dict, role_id: str) -> dict:
    role = ref.roles[role_id]
    have = effective_skills(ref, profile)
    levels = profile.get("skill_levels") or {}
    cv = set(profile.get("skills") or [])
    done = set(profile.get("completed_courses") or [])
    # The pathway's ordered courses, pinned to the nodes they teach: one screen for both.
    plan = pathway.build(ref, profile, role_id, summarize=False)
    steps = {k["skill_id"]: (s["step"], s["course"]) for s in plan["steps"] for k in s["skills"]}
    memo: dict[str, int] = {}
    evidence = (role.get("evidence") or {}).get("skills", {})  # approved job-ad citations
    nodes = []
    for skill_id in _closure(ref, [rs["skill_id"] for rs in role["skills"]]):
        prereqs = ref.skill_prereqs.get(skill_id, [])
        nodes.append({
            "skill_id": skill_id,
            "name": ref.skills[skill_id]["name"],
            "level": int(levels.get(skill_id, 0)),
            "from_cv": skill_id in cv,
            "unlocked": all(p in have for p in prereqs),
            "prereqs": prereqs,
            "depth": _depth(ref, skill_id, memo),
            "tier": ref.skills[skill_id].get("tier", "foundation"),
            "in_role": any(rs["skill_id"] == skill_id for rs in role["skills"]),
            "course": ({k: steps[skill_id][1][k] for k in ("id", "title", "url", "hours", "cost")}
                       if skill_id in steps else course_for(ref, skill_id)),
            "step": steps[skill_id][0] if skill_id in steps else None,
            "course_done": skill_id in steps and steps[skill_id][1]["id"] in done,
            "evidence": evidence.get(skill_id),
            "added_from_ads": any(rs["skill_id"] == skill_id and rs.get("source") == "evidence" for rs in role["skills"]),
        })
    nodes.sort(key=lambda n: (n["depth"], n["name"]))
    return {"role": {"role_id": role_id, "title": role["title"]}, "nodes": nodes,
            "readiness": plan["readiness"], "hours_left": plan.get("hours_left", 0), "total_steps": len(plan["steps"])}
