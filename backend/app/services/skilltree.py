"""The skill tree for one target role: the role's skills plus everything they build on.

Order comes from data/skill_prereqs.json (fixed and team-reviewed, so the tree doesn't change
between visits). A node is unlocked once each prerequisite is a skill the person has (from their
CV, a finished course, or a proven level). Levels 1-3 (Basic, Working, Advanced) are earned only
through proof checks (app/services/proofcheck.py).
"""


from app.reference import Reference
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


def _depth(ref: Reference, skill_id: str, memo: dict[str, int]) -> int:
    if skill_id not in memo:
        prereqs = ref.skill_prereqs.get(skill_id, [])
        memo[skill_id] = 1 + max((_depth(ref, p, memo) for p in prereqs), default=-1)
    return memo[skill_id]


def _course(ref: Reference, skill_id: str) -> dict | None:
    course = next((c for c in ref.courses if skill_id in c["skills"]), None)
    return {"id": course["id"], "title": course["title"], "url": course["url"]} if course else None


def is_unlocked(ref: Reference, profile: dict, skill_id: str) -> bool:
    have = effective_skills(ref, profile)
    return all(p in have for p in ref.skill_prereqs.get(skill_id, []))


def build(ref: Reference, profile: dict, role_id: str) -> dict:
    role = ref.roles[role_id]
    have = effective_skills(ref, profile)
    levels = profile.get("skill_levels") or {}
    cv = set(profile.get("skills") or [])
    memo: dict[str, int] = {}
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
            "in_role": any(rs["skill_id"] == skill_id for rs in role["skills"]),
            "course": _course(ref, skill_id),
        })
    nodes.sort(key=lambda n: (n["depth"], n["name"]))
    return {"role": {"role_id": role_id, "title": role["title"]}, "nodes": nodes}
