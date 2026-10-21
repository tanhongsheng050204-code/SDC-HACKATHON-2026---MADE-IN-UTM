"""What speaks for a role and what could go wrong, for one person, each point with its source.

Built only from data Laluan already holds (the profile, the role's skill list, the forecast in use,
O*NET task labels, the course catalogue and DOSM pay), so nothing here is written by a model.
"""

from app.reference import Reference
from app.services import pathway, tasks
from app.services.matching import effective_skills, fit_and_gap, pay, pay_change
from app.services.scenario import outlook, signals_from_snapshot

WEF = "WEF Future of Jobs 2025 (via the forecast in use)"


def case(ref: Reference, profile: dict, role_id: str) -> dict:
    role = ref.roles[role_id]
    fit, covered, missing = fit_and_gap(role, effective_skills(ref, profile))
    snapshot = ref.latest_snapshot
    signal = signals_from_snapshot(snapshot)[role_id]
    outs = {sid: outlook(signal, sid, float(s["adoption"])) for sid, s in ref.scenarios.items()}
    base, low, high = outs["baseline"], min(o.index for o in outs.values()), max(o.index for o in outs.values())
    plan = pathway.build(ref, profile, role_id, summarize=False)
    task_view = tasks.for_role(ref, role_id)
    target_pay = pay(ref, role_id)
    pay_diff = pay_change(ref, role_id, profile.get("current_role_id"))
    dosm = f"DOSM Salaries & Wages {target_pay['year']}, {target_pay['table'].split(' (')[0]}"
    name = lambda rs: ref.skills[rs["skill_id"]]["name"]  # noqa: E731
    pros, cons = [], []

    if covered:
        pros.append({"text": f"You already have {len(covered)} of {len(role['skills'])} skills it needs "
                             f"({round(fit * 100)}% of the skill weight): {', '.join(name(rs) for rs in covered[:4])}.",
                     "source": "Your profile and the role's skill list"})
    if base.index >= 10:
        pros.append({"text": f"Jobs are expected to grow about {base.index:+g}% to {snapshot['horizon_year']} in the baseline future.",
                     "source": WEF})
    if low > -10:
        pros.append({"text": f"It doesn't decline in any of the three AI futures ({low:+g}% to {high:+g}%).", "source": WEF})
    if plan["steps"]:
        free = sum(1 for s in plan["steps"] if s["course"]["cost"] in ("free", "free_audit"))
        pros.append({"text": f"The plan is {len(plan['steps'])} courses, about {plan['total_hours']} hours; "
                             f"{free} of them free or free to audit.", "source": "Laluan course catalogue"})
    shared = sorted({t["sdg"] for t in ref.role_sdgs(role_id)} & set(profile.get("interests") or []))
    if shared:
        pros.append({"text": f"It serves goals you chose: SDG {', '.join(map(str, shared))}.", "source": "UN SDGs and the Laluan SDG map"})
    if pay_diff and pay_diff > 0:
        pros.append({"text": f"Typical pay for its occupation group is RM {pay_diff:,} a month higher than for your current job's group "
                             f"(RM {target_pay['median_rm']:,} median).", "source": dosm})

    core_missing = [rs for rs in missing if rs["weight"] == 3]
    if core_missing:
        cons.append({"text": f"Core skills you still need: {', '.join(name(rs) for rs in core_missing)}.",
                     "source": "The role's skill list"})
    if low <= -10:
        cons.append({"text": f"It shrinks in at least one AI future (as low as {low:+g}% to {snapshot['horizon_year']}).", "source": WEF})
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
    if pay_diff and pay_diff < 0:
        cons.append({"text": f"Typical pay for its occupation group is RM {-pay_diff:,} a month lower than for your current job's group.",
                     "source": dosm})
    note = signal.note or ""
    if "No WEF category" in note:
        closest = note.split("closest is ", 1)[-1].split(" (", 1)[0] if "closest is " in note else "the closest category"
        cons.append({"text": f"WEF has no category for this exact role, so its forecast uses the closest one: {closest}.",
                     "source": "WEF Future of Jobs 2025, Figure 2.3"})
    return {"role_id": role_id, "pros": pros, "cons": cons}
