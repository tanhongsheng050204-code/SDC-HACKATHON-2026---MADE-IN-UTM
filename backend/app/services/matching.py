"""Future-role matching and skills gap, with an explainable score.

fit   = share of a role's skill weight the person already covers (core skills weigh 3)
score = FIT_WEIGHT * fit + OUTLOOK_WEIGHT * outlook (normalised 0..1 for the chosen scenario)
        + SDG_BOOST if the role serves an SDG the person chose

Each role carries the breakdown of its score, so the UI can show "why this rank". The SDG boost
is how a person's values visibly change their choices.

Roles declining under the chosen scenario are "at risk" and always rank below the others, so a
close fit to a shrinking job never outranks a reachable growing one.

A "robust pick" is a role in the top ROBUST_TOP_N under every scenario and never declining: a
recommendation that does not depend on which future happens.

Outlooks are estimates: each role also carries the range across all scenarios.
"""

from app.reference import Reference
from app.services.scenario import Outlook, outlooks, signals_from_snapshot

FIT_WEIGHT, OUTLOOK_WEIGHT = 0.6, 0.4
SDG_BOOST = 0.05
ROBUST_TOP_N = 5


def fit_and_gap(role: dict, skills: set[str]) -> tuple[float, list[dict], list[dict]]:
    total = sum(rs["weight"] for rs in role["skills"])
    covered = [rs for rs in role["skills"] if rs["skill_id"] in skills]
    missing = sorted(
        (rs for rs in role["skills"] if rs["skill_id"] not in skills), key=lambda rs: -rs["weight"]
    )
    fit = sum(rs["weight"] for rs in covered) / total if total else 0.0
    return round(fit, 4), covered, missing


def _breakdown(ref: Reference, role_id: str, skills: set[str], interests: set[int],
               outlook: Outlook) -> dict:
    fit, _, _ = fit_and_gap(ref.roles[role_id], skills)
    shared = sorted({t["sdg"] for t in ref.role_sdgs(role_id)} & interests)
    parts = {
        "fit_points": round(FIT_WEIGHT * fit, 4),
        "outlook_points": round(OUTLOOK_WEIGHT * outlook.normalised, 4),
        "sdg_points": SDG_BOOST if shared else 0.0,
    }
    return {"fit": fit, "score": round(sum(parts.values()), 4), "matched_sdgs": shared, **parts}


def _ranked(ref: Reference, skills: set[str], interests: set[int],
            by_role: dict[str, Outlook]) -> list[tuple[str, dict]]:
    rows = [(role_id, _breakdown(ref, role_id, skills, interests, by_role[role_id]))
            for role_id in ref.roles if role_id in by_role]
    return sorted(rows, key=lambda r: (by_role[r[0]].label == "declining", -r[1]["score"], r[0]))


def _skill_view(ref: Reference, rs: dict) -> dict:
    skill = ref.skills[rs["skill_id"]]
    return {"skill_id": skill["id"], "name": skill["name"], "weight": rs["weight"],
            "sdgs": [t["sdg"] for t in ref.skill_sdgs(skill["id"])]}


def _sdg_view(ref: Reference, tags: list[dict]) -> list[dict]:
    return [{**ref.sdgs[t["sdg"]], "target": t.get("target"), "reason": t["reason"]} for t in tags]


def match(ref: Reference, profile: dict, scenario_id: str) -> dict:
    snapshot = ref.latest_snapshot
    signals = signals_from_snapshot(snapshot)
    all_outlooks = outlooks(signals, ref.scenarios)
    skills = set(profile["skills"])
    interests = set(profile.get("interests") or [])
    ranks = {sid: {role_id: i + 1 for i, (role_id, _) in enumerate(_ranked(ref, skills, interests, by_role))}
             for sid, by_role in all_outlooks.items()}
    robust = {role_id for role_id in ref.roles
              if all(ranks[sid].get(role_id, 999) <= ROBUST_TOP_N
                     and all_outlooks[sid][role_id].label != "declining" for sid in ranks)}

    roles = []
    for role_id, why in _ranked(ref, skills, interests, all_outlooks[scenario_id]):
        role = ref.roles[role_id]
        _, covered, missing = fit_and_gap(role, skills)
        indexes = [o[role_id].index for o in all_outlooks.values()]
        roles.append({
            "role_id": role_id,
            "title": role["title"],
            "family": role["family"],
            "summary": role["summary"],
            "rank": ranks[scenario_id][role_id],
            "rank_change_vs_baseline": ranks["baseline"][role_id] - ranks[scenario_id][role_id],
            "score": why["score"],
            "fit": why["fit"],
            "why": why,
            "outlook": {sid: {"index": o[role_id].index, "label": o[role_id].label}
                        for sid, o in all_outlooks.items()},
            "estimate_range": {"low": min(indexes), "high": max(indexes),
                               "horizon_year": snapshot["horizon_year"]},
            "robust_pick": role_id in robust,
            "at_risk": all_outlooks[scenario_id][role_id].label == "declining",
            "is_current_role": role_id == profile.get("current_role_id"),
            "covered": [_skill_view(ref, rs) for rs in covered],
            "missing": [_skill_view(ref, rs) for rs in missing],
            "sdgs": _sdg_view(ref, ref.role_sdgs(role_id)),
            "citation": {"snapshot_id": snapshot["snapshot_id"], "imported": snapshot["imported"],
                         "note": signals[role_id].note},
        })
    return {
        "scenario": ref.scenarios[scenario_id],
        "signal_source": {
            "snapshot_id": snapshot["snapshot_id"],
            "source": snapshot["source"],
            "source_url": snapshot["source_url"],
            "published": snapshot["published"],
            "imported": snapshot["imported"],
            "horizon_year": snapshot["horizon_year"],
            "illustrative": snapshot["illustrative"],
        },
        "roles": roles,
    }
