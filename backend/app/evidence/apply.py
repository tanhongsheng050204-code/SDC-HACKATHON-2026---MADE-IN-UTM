"""Apply approved skill evidence to the catalogue roles when reference data loads.

Pure: no imports from the rest of the app, so reference.py can call it without a cycle. Each role
gains the skills its approved evidence added (weight 1, marked "evidence") and an `evidence`
summary for the role page and skill tree. Roles without approved evidence are unchanged.
"""

import copy


def apply(roles: dict[str, dict], approved: dict[str, dict]) -> dict[str, dict]:
    out = {}
    for role_id, role in roles.items():
        body = approved.get(role_id)
        if not body:
            out[role_id] = role
            continue
        role = copy.deepcopy(role)
        have = {rs["skill_id"] for rs in role["skills"]}
        summary = body["summary"]
        role["skills"] += [{"skill_id": a["skill_id"], "weight": 1, "source": "evidence"}
                           for a in summary["added"] if a["skill_id"] not in have]
        own = {rs["skill_id"] for rs in role["skills"]}
        role["evidence"] = {
            "searched": body["searched"], "widened": body["widened"],
            "reviewed_by": body.get("reviewed_by"), "reviewed_at": body.get("reviewed_at"),
            "skills": {sid: s for sid, s in summary["skills"].items() if sid in own},
        }
        out[role_id] = role
    return out
