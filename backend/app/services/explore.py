"""What-if tools: your own AI future, tipping points, skills you might learn, and how a forecast
is built.

Everything here reuses the matching and scenario formulas unchanged; it only varies one input at
a time so the person can see cause and effect:

- adoption: any AI-adoption speed between MIN_ADOPTION and MAX_ADOPTION, not just the three
  preset scenarios (slow 0.5, baseline 1.0, accelerated 1.6). Values other than the presets are
  the person's own assumption, and the response says so.
- add: skills the person does not have yet, to see how fit and rankings would move.
- tipping points: the adoption speeds at which the person's current job changes outlook band,
  or at which a different role becomes their top match.
- xray: the chain from the published figure to the outlook shown for a role.
- case: what speaks for a role and what could go wrong, each with its source.
"""

from app.reference import Reference
from app.services import pathway, tasks
from app.services.matching import FIT_WEIGHT, OUTLOOK_WEIGHT, _ranked, effective_skills, fit_and_gap
from app.services.scenario import AI_SWING, INDEX_CEILING, INDEX_FLOOR, label_for, outlook, signals_from_snapshot, year_fraction

MIN_ADOPTION, MAX_ADOPTION, STEP = 0.5, 2.0, 0.05
TOP_N = 5


def _adoptions() -> list[float]:
    n = round((MAX_ADOPTION - MIN_ADOPTION) / STEP)
    return [round(MIN_ADOPTION + i * STEP, 2) for i in range(n + 1)]


def _ranking(ref: Reference, skills: set[str], interests: set[int], adoption: float, fraction: float) -> list[dict]:
    signals = signals_from_snapshot(ref.latest_snapshot)
    by_role = {rid: outlook(sig, "custom", adoption, fraction) for rid, sig in signals.items()}
    rows = []
    for rank, (rid, why) in enumerate(_ranked(ref, skills, interests, by_role), start=1):
        rows.append({"role_id": rid, "title": ref.roles[rid]["title"], "rank": rank, "fit": why["fit"],
                     "score": why["score"], "index": by_role[rid].index, "label": by_role[rid].label})
    return rows


def _preset_name(ref: Reference, adoption: float) -> str | None:
    return next((sid for sid, s in ref.scenarios.items() if abs(float(s["adoption"]) - adoption) < 1e-9), None)


def explore(ref: Reference, profile: dict, adoption: float = 1.0, add: list[str] | None = None,
            year: int | None = None) -> dict:
    adoption = round(min(MAX_ADOPTION, max(MIN_ADOPTION, adoption)), 2)
    add = [s for s in dict.fromkeys(add or []) if s in ref.skills]
    snapshot = ref.latest_snapshot
    year, fraction = year_fraction(snapshot, year)
    interests = set(profile.get("interests") or [])
    before = effective_skills(ref, profile)
    after = before | set(add)

    now = {r["role_id"]: r for r in _ranking(ref, before, interests, adoption, fraction)}
    ranking = []
    for row in _ranking(ref, after, interests, adoption, fraction):
        old = now[row["role_id"]]
        ranking.append({**row, "rank_before": old["rank"], "fit_before": old["fit"]})

    return {
        "adoption": adoption,
        "preset": _preset_name(ref, adoption),
        "year": year,
        "added_skills": [{"skill_id": s, "name": ref.skills[s]["name"]} for s in add],
        "ranking": ranking,
        "tipping": tipping_points(ref, profile, after, interests, fraction),
        "assumption": ("Adoption speeds other than 0.5, 1.0 and 1.6 are your own assumption, run through the "
                       "same formula as the three scenarios. Estimates, not predictions."),
        "source": {"snapshot_id": snapshot["snapshot_id"], "imported": snapshot["imported"]},
    }


def tipping_points(ref: Reference, profile: dict, skills: set[str], interests: set[int], fraction: float) -> dict:
    current = profile.get("current_role_id")
    points = []
    for a in _adoptions():
        rows = _ranking(ref, skills, interests, a, fraction)
        mine = next((r for r in rows if r["role_id"] == current), None)
        points.append({"adoption": a, "top": rows[0]["role_id"], "top5": [r["role_id"] for r in rows[:TOP_N]],
                       "current_label": mine["label"] if mine else None,
                       "current_index": mine["index"] if mine else None})

    current_changes, top_changes = [], []
    for prev, cur in zip(points, points[1:]):
        if current and prev["current_label"] != cur["current_label"]:
            current_changes.append({"adoption": cur["adoption"], "from": prev["current_label"], "to": cur["current_label"]})
        if prev["top"] != cur["top"]:
            top_changes.append({"adoption": cur["adoption"], "from": ref.roles[prev["top"]]["title"],
                                "to": ref.roles[cur["top"]]["title"]})
    in_every = set(points[0]["top5"]).intersection(*(set(p["top5"]) for p in points))
    return {
        "range": [MIN_ADOPTION, MAX_ADOPTION],
        "current_role": ref.roles[current]["title"] if current in ref.roles else None,
        "current_changes": current_changes,
        "top_changes": top_changes,
        "always_top5": [ref.roles[r]["title"] for r in sorted(in_every)],
        "series": [{"adoption": p["adoption"], "current_index": p["current_index"], "top": ref.roles[p["top"]]["title"]}
                   for p in points],
    }


def xray(ref: Reference, role_id: str, scenario_id: str = "baseline", year: int | None = None) -> dict:
    """Each step from the published figure to the outlook shown, with the number it adds."""
    snapshot = ref.latest_snapshot
    row = next(s for s in snapshot["signals"] if s["role_id"] == role_id)
    adoption = float(ref.scenarios[scenario_id]["adoption"])
    year, fraction = year_fraction(snapshot, year)
    steps = []
    if snapshot.get("kind") == "trend-adjusted":
        steps.append({"label": "Published baseline", "value": row["baseline_growth_pct"],
                      "detail": f"Net job growth to {snapshot['horizon_year']} in the baseline snapshot "
                                f"{snapshot.get('baseline_snapshot_id')}"})
        steps.append({"label": "Job-posting demand", "value": row["demand_points"],
                      "detail": "Change in how often this role's skills appear in job posts, capped at ±15"})
        steps.append({"label": "AI research momentum", "value": row["ai_points"],
                      "detail": "Whether research on AI that helps or replaces this role is accelerating, capped at ±15"})
    else:
        steps.append({"label": "Published baseline", "value": row["net_growth_pct"], "detail": row.get("note") or snapshot["source"]})
    gap = row["ai_complementarity"] - row["automation_exposure"]
    swing = round((adoption - 1.0) * AI_SWING * gap, 1)
    steps.append({"label": f"AI adoption speed ({ref.scenarios[scenario_id]['label']}, {adoption:g}×)", "value": swing,
                  "detail": f"({adoption:g} − 1) × {AI_SWING:g} × (works with AI {row['ai_complementarity']:g} − "
                            f"exposed to automation {row['automation_exposure']:g}). The two scores are the team's estimates."})
    full = round(row["net_growth_pct"] + swing, 1)
    final = outlook(signals_from_snapshot(snapshot)[role_id], scenario_id, adoption, fraction)
    if fraction < 1:
        steps.append({"label": f"Up to {year} instead of {snapshot['horizon_year']}", "value": round(final.index - full, 1),
                      "detail": f"Scaled to {round(fraction * 100)}% of the way from {str(snapshot['published'])[:4]} "
                                f"to {snapshot['horizon_year']}"})
    clamped = min(max(final.index, INDEX_FLOOR), INDEX_CEILING)
    return {
        "role_id": role_id, "scenario": scenario_id, "year": year, "steps": steps,
        "result": {"index": final.index, "label": final.label,
                   "bands": "Emerging ≥ 50 · Growing ≥ 10 · Stable above −10 · Declining −10 or lower"},
        "ranking_points": {"normalised": final.normalised, "points": round(OUTLOOK_WEIGHT * final.normalised, 4),
                           "detail": f"{clamped:g} placed on a {INDEX_FLOOR:g} to {INDEX_CEILING:g} scale, × {OUTLOOK_WEIGHT:g}"},
        "source": {"snapshot_id": snapshot["snapshot_id"], "imported": snapshot["imported"], "url": snapshot["source_url"]},
    }


def _pay(ref: Reference, role_id: str) -> dict | None:
    group = ref.roles[role_id].get("masco_group")
    return ref.malaysia_pay["groups"].get(group) if group else None


def case(ref: Reference, profile: dict, role_id: str, scenario_id: str = "baseline") -> dict:
    """What speaks for this role and what could go wrong, each from Laluan's own data."""
    role = ref.roles[role_id]
    skills = effective_skills(ref, profile)
    fit, covered, missing = fit_and_gap(role, skills)
    snapshot = ref.latest_snapshot
    signals = signals_from_snapshot(snapshot)
    outs = {sid: outlook(signals[role_id], sid, float(s["adoption"])) for sid, s in ref.scenarios.items()}
    base, low, high = outs["baseline"], min(o.index for o in outs.values()), max(o.index for o in outs.values())
    plan = pathway.build(ref, profile, role_id, summarize=False)
    task_view = tasks.for_role(ref, role_id)
    pay, pay_year = _pay(ref, role_id), ref.malaysia_pay["year"]
    current = profile.get("current_role_id")
    pay_now = _pay(ref, current) if current in ref.roles and current != role_id else None
    name = lambda rs: ref.skills[rs["skill_id"]]["name"]  # noqa: E731
    wef = "WEF Future of Jobs 2025 (via the forecast in use)"
    dosm = f"DOSM Salaries & Wages {pay_year}"
    pros, cons = [], []

    if covered:
        pros.append({"text": f"You already have {len(covered)} of {len(role['skills'])} skills it needs "
                             f"({round(fit * 100)}% of the skill weight): {', '.join(name(rs) for rs in covered[:4])}.",
                     "source": "Your profile and the role's skill list"})
    if base.index >= 10:
        pros.append({"text": f"Jobs are expected to grow about {base.index:+g}% to {snapshot['horizon_year']} in the baseline future.",
                     "source": wef})
    if low > -10:
        pros.append({"text": f"It doesn't decline in any of the three AI futures ({low:+g}% to {high:+g}%).", "source": wef})
    if plan["steps"]:
        free = sum(1 for s in plan["steps"] if s["course"]["cost"] in ("free", "free_audit"))
        pros.append({"text": f"The plan is {len(plan['steps'])} courses, about {plan['total_hours']} hours; "
                             f"{free} of them free or free to audit.", "source": "Laluan course catalogue"})
    shared = sorted({t["sdg"] for t in ref.role_sdgs(role_id)} & set(profile.get("interests") or []))
    if shared:
        pros.append({"text": f"It serves goals you chose: SDG {', '.join(map(str, shared))}.", "source": "UN SDGs and the Laluan SDG map"})
    if pay and pay_now and pay["median_rm"] > pay_now["median_rm"]:
        pros.append({"text": f"Typical pay is higher: RM {pay['median_rm']:,} vs RM {pay_now['median_rm']:,} a month "
                             f"(medians for {pay['label']} vs {pay_now['label']}).", "source": dosm})

    core_missing = [rs for rs in missing if rs["weight"] == 3]
    if core_missing:
        cons.append({"text": f"Core skills you still need: {', '.join(name(rs) for rs in core_missing)}.",
                     "source": "The role's skill list"})
    if base.label == "declining" or low <= -10:
        cons.append({"text": f"It shrinks in at least one AI future (as low as {low:+g}% to {snapshot['horizon_year']}).", "source": wef})
    if task_view["tasks"] and task_view["shares"]["automate"] >= 0.4:
        cons.append({"text": f"About {round(task_view['shares']['automate'] * 100)}% of its typical tasks are ones AI is "
                             f"likely to automate.", "source": "O*NET 30.0 tasks, labelled by the team"})
    paid = [s["course"] for s in plan["steps"] if s["course"]["cost"] == "paid"]
    if paid:
        known = sum(c.get("price_rm") or 0 for c in paid)
        unknown = sum(1 for c in paid if c.get("price_rm") is None)
        cost = f"RM {known:,.0f}" + (f" plus {unknown} price to confirm" if unknown else "")
        cons.append({"text": f"{len(paid)} course(s) in the plan are paid ({cost}); ask your employer about HRD Corp.",
                     "source": "Providers' pages, dated in the catalogue"})
    if plan["uncovered_skills"]:
        cons.append({"text": f"No course in our catalogue teaches {', '.join(ref.skills[s]['name'] for s in plan['uncovered_skills'])} yet.",
                     "source": "Laluan course catalogue"})
    if pay and pay["employees_change_pct"] is not None and (pay["employees_change_pct"] > 0) != (base.index > 0):
        cons.append({"text": f"Local and global signals disagree: in Malaysia, {pay['label'].lower()} employment changed "
                             f"{pay['employees_change_pct']:+g}% since {ref.malaysia_pay['trend_from']}, while the global forecast is "
                             f"{base.index:+g}%.", "source": f"{dosm} and {wef}"})
    if pay and pay_now and pay["median_rm"] < pay_now["median_rm"]:
        cons.append({"text": f"Typical pay is lower: RM {pay['median_rm']:,} vs RM {pay_now['median_rm']:,} a month (group medians).",
                     "source": dosm})
    note = signals[role_id].note or ""
    if "No WEF category" in note:
        closest = note.split("closest is ", 1)[-1].split(" (", 1)[0] if "closest is " in note else "the closest category"
        cons.append({"text": f"WEF has no category for this exact role, so its forecast uses the closest one: {closest}.",
                     "source": "WEF Future of Jobs 2025, Figure 2.3"})

    pay_jump = None
    if pay and pay_now:
        pay_jump = {"from_group": pay_now["label"], "from_rm": pay_now["median_rm"], "to_group": pay["label"],
                    "to_rm": pay["median_rm"], "difference_rm": pay["median_rm"] - pay_now["median_rm"], "year": pay_year,
                    "note": "Monthly medians for whole occupation groups, not for these exact roles. Excludes bonuses."}
    return {"role_id": role_id, "pros": pros, "cons": cons, "pay_jump": pay_jump}
