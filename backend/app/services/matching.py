"""Future-role matching and skills gap, with an explainable score.

fit   = share of a role's skill weight the person already covers (core skills weigh 3)
score = FIT_WEIGHT * fit + OUTLOOK_WEIGHT * outlook (normalised 0..1 for the chosen scenario)
        + a small preference boost (filled in by the survey; zero until then)

Each role carries the breakdown of its score, so the UI can show "why this rank". SDG links are
shown with every role as the system's explanation; people no longer pick SDGs to rank by.

Roles declining under the chosen scenario are "at risk" and always rank below the others, so a
close fit to a shrinking job never outranks a reachable growing one.

A "robust pick" is a role in the top ROBUST_TOP_N under every scenario and never declining: a
recommendation that does not depend on which future happens.

Outlooks are estimates: each role also carries the range across all scenarios.
"""

import datetime as dt

from app.reference import Reference
from app.services.scenario import Outlook, outlook, outlooks, signals_from_snapshot, year_fraction

FIT_WEIGHT, OUTLOOK_WEIGHT = 0.6, 0.4
PREFERENCE_BOOST = 0.05  # at most; same size as the SDG boost it replaced
ALSO_LIKE_N, ALSO_LIKE_MATCH, ALSO_LIKE_MIN_FIT = 3, 0.5, 0.25
ENTRY_BOOST = 0.05  # for graduates, on roles open to people without experience; shown in "why"
ROBUST_TOP_N = 5


def requirements(ref: Reference, role_id: str, current_id: str | None = None) -> dict:
    """What it takes to be hired beyond skills: the education employers usually ask for (MASCO 2020
    group) and any licence the law or an official body requires. A licence counts as held only for
    the person's own job."""
    data = ref.entry_requirements
    usual = data["usual_by_group"][ref.roles[role_id]["masco_major"]]
    licence = data["licences"].get(role_id)
    return {"usual": usual["text"], "skill_level": usual["skill_level"], "usual_source": data["masco_source"],
            "licence": licence, "needs_licence": bool(licence) and role_id != current_id}


def being_checked(role: dict) -> bool:
    """A role added to the catalogue whose drafted data the team has not signed off yet."""
    return bool(role.get("added")) and not role.get("reviewed_by")


def effective_skills(ref: Reference, profile: dict) -> set[str]:
    """Skills the person reported, skills taught by courses they marked as finished, and skills
    proven at Basic level or above in the skill tree."""
    done = set(profile.get("completed_courses") or [])
    earned = {s for c in ref.courses if c["id"] in done for s in c["skills"]}
    proven = {s for s, level in (profile.get("skill_levels") or {}).items() if level >= 1}
    return set(profile["skills"]) | earned | proven


def fit_and_gap(role: dict, skills: set[str]) -> tuple[float, list[dict], list[dict]]:
    total = sum(rs["weight"] for rs in role["skills"])
    covered = [rs for rs in role["skills"] if rs["skill_id"] in skills]
    missing = sorted(
        (rs for rs in role["skills"] if rs["skill_id"] not in skills), key=lambda rs: -rs["weight"]
    )
    fit = sum(rs["weight"] for rs in covered) / total if total else 0.0
    return round(fit, 4), covered, missing


def preference_match(prefs: dict[str, float], context: dict[str, float]) -> float:
    """-1..1: how well a role's work context fits the person's stated preferences."""
    weight = sum(abs(p) for p in prefs.values())
    if not weight:
        return 0.0
    return round(sum(p * context.get(d, 0.0) for d, p in prefs.items()) / weight, 4)


def _matched_preferences(ref: Reference, prefs: dict[str, float], context: dict[str, float]) -> list[dict]:
    out = []
    for d in ref.work_dimensions:
        p = prefs.get(d["id"], 0.0)
        if p * context.get(d["id"], 0.0) >= 0.5:
            pole = d["plus" if p > 0 else "minus"]
            out.append({"dim": d["id"], "label": pole["en"], "labels": pole})
    return out


def _breakdown(ref: Reference, role_id: str, skills: set[str], outlook: Outlook, prefs: dict[str, float],
               audience: str | None = None) -> dict:
    fit, _, _ = fit_and_gap(ref.roles[role_id], skills)
    context = ref.roles[role_id].get("work_context", {})
    match = preference_match(prefs, context)
    parts = {
        "fit_points": round(FIT_WEIGHT * fit, 4),
        "outlook_points": round(OUTLOOK_WEIGHT * outlook.normalised, 4),
        "preference_points": round(PREFERENCE_BOOST * max(0.0, match), 4),
        "entry_points": ENTRY_BOOST if audience == "graduate" and ref.roles[role_id].get("entry_level") else 0.0,
    }
    return {"fit": fit, "score": round(sum(parts.values()), 4), "preference_match": match,
            "matched_preferences": _matched_preferences(ref, prefs, context) if parts["preference_points"] else [],
            **parts}


def _ranked(ref: Reference, skills: set[str], by_role: dict[str, Outlook],
            prefs: dict[str, float], audience: str | None = None, exclude: str | None = None) -> list[tuple[str, dict]]:
    rows = [(role_id, _breakdown(ref, role_id, skills, by_role[role_id], prefs, audience))
            for role_id in ref.roles if role_id in by_role and role_id != exclude]
    return sorted(rows, key=lambda r: (by_role[r[0]].label == "declining", -r[1]["score"], r[0]))


def _skill_view(ref: Reference, rs: dict) -> dict:
    skill = ref.skills[rs["skill_id"]]
    return {"skill_id": skill["id"], "name": skill["name"], "weight": rs["weight"],
            "sdgs": [t["sdg"] for t in ref.skill_sdgs(skill["id"])],
            "added_from_ads": rs.get("source") == "evidence"}


def pay(ref: Reference, role_id: str) -> dict:
    """The DOSM median for the role's occupation group: a group figure, never a job offer."""
    group = next(g for g in ref.salaries["groups"] if g["id"] == ref.roles[role_id]["masco_major"])
    return {"group": group["name"], "median_rm": group["median_rm"], "mean_rm": group["mean_rm"],
            "year": ref.salaries["year"], "source": ref.salaries["source"], "table": ref.salaries["table"],
            "source_url": ref.salaries["source_url"]}


def pay_change(ref: Reference, role_id: str, current_id: str | None) -> int | None:
    """Difference in group medians; None without a current role or within the same group (DOSM
    has no finer figure, so we don't invent one)."""
    if current_id not in ref.roles or ref.roles[current_id]["masco_major"] == ref.roles[role_id]["masco_major"]:
        return None
    return pay(ref, role_id)["median_rm"] - pay(ref, current_id)["median_rm"]


def _skills_source(ref: Reference, role_id: str) -> dict:
    """Where a role's skill list comes from: the team's list, checked against an O*NET occupation."""
    entry = ref.tasks["roles"].get(role_id, {})
    return {"onet_code": entry.get("onet_code"), "onet_note": entry.get("onet_note")}


def _current_role_card(ref: Reference, role_id: str, skills: set[str], all_outlooks: dict, scenario_id: str,
                       snapshot: dict, signals: dict) -> dict:
    """A switcher's current role, kept out of the ranking but still shown: where they are now."""
    role = ref.roles[role_id]
    fit, covered, missing = fit_and_gap(role, skills)
    return {
        "role_id": role_id, "title": role["title"], "family": role["family"], "summary": role["summary"],
        "fit": fit, "is_current_role": True, "being_checked": being_checked(role),
        "requirements": requirements(ref, role_id, role_id),
        "outlook": {sid: {"index": o[role_id].index, "label": o[role_id].label} for sid, o in all_outlooks.items()},
        "at_risk": all_outlooks[scenario_id][role_id].label == "declining",
        "covered": [_skill_view(ref, rs) for rs in covered], "missing": [_skill_view(ref, rs) for rs in missing],
        "sdgs": ref.sdg_view(ref.role_sdgs(role_id)),
        "citation": {"snapshot_id": snapshot["snapshot_id"], "imported": snapshot["imported"], "note": signals[role_id].note},
    }


def match(ref: Reference, profile: dict, scenario_id: str, year: int | None = None,
          adoption: float | None = None, extra_skills: frozenset[str] = frozenset()) -> dict:
    """`adoption` replaces the chosen scenario's AI adoption speed ("your own AI future"). The
    other scenarios stay as published, and robust picks are always judged on the three presets.
    `extra_skills` are tried on for this call only ("What if I learn...?"); nothing is saved."""
    snapshot = ref.latest_snapshot
    signals = signals_from_snapshot(snapshot)
    year, fraction = year_fraction(snapshot, year)
    presets = outlooks(signals, ref.scenarios, fraction)
    all_outlooks = dict(presets)
    if adoption is not None:
        all_outlooks[scenario_id] = {rid: outlook(sig, scenario_id, adoption, fraction) for rid, sig in signals.items()}
    own_skills = effective_skills(ref, profile)
    skills = own_skills | set(extra_skills)
    prefs = profile.get("preferences") or {}
    audience = profile.get("audience")
    current_id = profile.get("current_role_id")
    # A career switcher is leaving their current role: it gets its own card, never a top-5 slot.
    exclude = current_id if audience == "switcher" else None
    carry_from = {rs["skill_id"] for rs in ref.roles[current_id]["skills"]} if current_id in ref.roles else set()
    def rank_all(by_scenario: dict) -> dict:
        return {sid: {role_id: i + 1 for i, (role_id, _) in enumerate(_ranked(ref, skills, by_role, prefs, audience, exclude))}
                for sid, by_role in by_scenario.items()}

    ranks = rank_all(all_outlooks)
    preset_ranks = ranks if adoption is None else rank_all(presets)
    robust = {role_id for role_id in ref.roles if role_id != exclude
              if all(preset_ranks[sid].get(role_id, 999) <= ROBUST_TOP_N
                     and presets[sid][role_id].label != "declining" for sid in preset_ranks)}

    without_extra = ({role_id: i + 1 for i, (role_id, _) in
                      enumerate(_ranked(ref, own_skills, all_outlooks[scenario_id], prefs, audience, exclude))}
                     if extra_skills else {})
    roles = []
    for role_id, why in _ranked(ref, skills, all_outlooks[scenario_id], prefs, audience, exclude):
        role = ref.roles[role_id]
        _, covered, missing = fit_and_gap(role, skills)
        indexes = [o[role_id].index for o in all_outlooks.values()]
        roles.append({
            "role_id": role_id,
            "title": role["title"],
            "family": role["family"],
            "summary": role["summary"],
            "being_checked": being_checked(role),
            "requirements": requirements(ref, role_id, current_id),
            "rank": ranks[scenario_id][role_id],
            "rank_change_vs_baseline": ranks["baseline"][role_id] - ranks[scenario_id][role_id],
            "score": why["score"],
            "fit": why["fit"],
            "why": why,
            "outlook": {sid: {"index": o[role_id].index, "label": o[role_id].label}
                        for sid, o in all_outlooks.items()},
            "estimate_range": {"low": min(indexes), "high": max(indexes),
                               "horizon_year": snapshot["horizon_year"], "year": year},
            "robust_pick": role_id in robust,
            "at_risk": all_outlooks[scenario_id][role_id].label == "declining",
            "is_current_role": role_id == profile.get("current_role_id"),
            "covered": [_skill_view(ref, rs) for rs in covered],
            "carry_over": [{"skill_id": rs["skill_id"], "name": ref.skills[rs["skill_id"]]["name"]}
                           for rs in covered if rs["skill_id"] in carry_from and role_id != current_id],
            "missing": [_skill_view(ref, rs) for rs in missing],
            "sdgs": ref.sdg_view(ref.role_sdgs(role_id)),
            "evidence": role.get("evidence"),  # approved job-ad citations per skill, or None
            "citation": {"snapshot_id": snapshot["snapshot_id"], "imported": snapshot["imported"],
                         "note": signals[role_id].note},
            "skills_source": _skills_source(ref, role_id),
            "pay": pay(ref, role_id),
            "pay_change_rm": pay_change(ref, role_id, current_id),
            **({"rank_without_extra": without_extra[role_id]} if extra_skills else {}),
        })
    _add_routes(ref, profile, roles, scenario_id)
    also_like = sorted((r for r in roles if r["rank"] > ROBUST_TOP_N and not r["at_risk"]
                        and r["why"]["preference_match"] >= ALSO_LIKE_MATCH and r["fit"] >= ALSO_LIKE_MIN_FIT),
                       key=lambda r: (-r["why"]["preference_match"], r["rank"]))[:ALSO_LIKE_N]
    current_role = None
    if current_id in ref.roles and current_id in all_outlooks[scenario_id]:
        current_role = next((r for r in roles if r["role_id"] == current_id), None) or _current_role_card(
            ref, current_id, skills, all_outlooks, scenario_id, snapshot, signals)
    first_year = max(int(str(snapshot["published"])[:4]), min(dt.date.today().year, snapshot["horizon_year"]))
    return {
        "scenario": (ref.scenarios[scenario_id] if adoption is None else
                     {**ref.scenarios[scenario_id], "adoption": adoption, "custom": True,
                      "label": f"Your AI future: {adoption:g}× adoption",
                      "description": "Your own AI adoption speed. 1× is the published forecast; the three presets are 0.5×, 1× and 1.6×."}),
        "year": year,
        "year_range": [first_year, snapshot["horizon_year"]],
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
        "current_role": current_role,
        # For someone with a current job: the non-declining move with the fewest learning hours, so a
        # long plan at the top of the list is never the only answer.
        "shortest_route": _shortest_route(roles, current_id, scenario_id),
        "also_like": [{"role_id": r["role_id"], "title": r["title"], "rank": r["rank"], "fit": r["fit"],
                       "preference_match": r["why"]["preference_match"],
                       "matched_preferences": r["why"]["matched_preferences"]} for r in also_like],
    }


LONG_SHOT_FIT = 0.2       # below this skill fit a role is a long-term goal, not a next move
STEPPING_MIN_SHARED = 2   # a stepping stone already uses at least this many of the goal's core or important missing skills


def _add_routes(ref: Reference, profile: dict, roles: list[dict], scenario_id: str) -> None:
    """Each role gets its plan's hours; long shots also get a stepping stone: a closer role that is
    not declining and already uses at least two of the core or important skills the long shot needs
    (generic skills such as communication don't make one job lead to another)."""
    from app.services import pathway  # here, as pathway itself imports from this module

    for r in roles:
        r["plan_hours"] = pathway.build(ref, profile, r["role_id"], summarize=False)["total_hours"]
        # A licence the person does not hold takes years, not a few courses: a long-term goal however close the skills.
        r["long_shot"] = r["fit"] < LONG_SHOT_FIT or r["requirements"]["needs_licence"]
    for r in roles:
        r["stepping_stone"] = None
        if not r["long_shot"] or r["at_risk"]:  # no route towards a declining job
            continue
        need = {m["skill_id"] for m in r["missing"] if m["weight"] >= 2}
        best = None
        for s in roles:
            if s is r or s["is_current_role"] or s["long_shot"] or s["outlook"][scenario_id]["label"] == "declining":
                continue
            shared = len(need & {rs["skill_id"] for rs in ref.roles[s["role_id"]]["skills"]})
            if shared >= STEPPING_MIN_SHARED and (best is None or (shared, s["fit"]) > best[0]):
                best = ((shared, s["fit"]), s)
        if best:
            r["stepping_stone"] = {"role_id": best[1]["role_id"], "title": best[1]["title"]}


def _shortest_route(roles: list[dict], current_id: str | None, scenario_id: str) -> str | None:
    """Among roles that are growing or emerging (a stable job just as exposed to AI is not a step up)."""
    if not current_id:
        return None
    options = [r for r in roles if not r["is_current_role"] and r["plan_hours"] > 0
               and not r["requirements"]["needs_licence"]
               and r["outlook"][scenario_id]["label"] in ("growing", "emerging")]
    return min(options, key=lambda r: (r["plan_hours"], -r["score"]))["role_id"] if options else None
