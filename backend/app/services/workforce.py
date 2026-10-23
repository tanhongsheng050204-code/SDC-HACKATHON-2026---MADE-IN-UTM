"""HR workforce view: an anonymous CSV of roles and skills in, aggregate risk and reskilling moves out.

The training budget adds up the course fees of those moves from the catalogue's dated prices:
what HRD Corp lists as claimable, what to ask the provider about, and paid courses with no price
yet (named, never guessed). Most catalogue courses are free or free to audit, so the larger cost
is usually staff time: learning hours at the DOSM median hourly pay of each person's current
occupation group (monthly median / WORK_HOURS_PER_MONTH), a group figure, not anyone's salary.

For each group in a declining role there are two options: upskill in place (the same role,
AI-assisted: app/services/upgrade.py) and the nearest move (the role that is not declining with the
best skill fit today, never a long shot chosen for its growth). Groups in stable roles where AI is
likely to automate GET_AHEAD_SHARE of the tasks get the upskill-in-place option in a separate,
lower-priority "get ahead" list, so HR can plan before the role declines.

Aggregate only, never a ranking of individual employees: the tool supports reskilling decisions and
must not be used for hiring or firing (brief, section 6). Files with columns that identify people
(name, email, IC, phone) are rejected outright. Skills are matched with the dictionary only, so a
large file never triggers language-model calls.
"""

import csv
import io
import re
from collections import Counter, defaultdict

from app.reference import Reference
from app.services import matching, pathway, skills, tasks, upgrade

MAX_ROWS = 5000
WORK_HOURS_PER_MONTH = 173.33  # 40 hours a week x 52 weeks / 12 months
GET_AHEAD_SHARE = 0.4          # stable roles where AI is likely to automate this share of the tasks
FORBIDDEN = re.compile(r"name|e-?mail|\bic\b|nric|passport|phone|mobile|address|staff.?id|employee.?id", re.I)


class WorkforceError(ValueError):
    pass


def _role_index(ref: Reference) -> dict[str, str]:
    index = {}
    for role_id, role in ref.roles.items():
        index[skills.normalize(role_id.replace("_", " "))] = role_id
        index[skills.normalize(role["title"])] = role_id
    return index


def check_columns(columns: list[str]) -> None:
    """Refuse files with columns that identify people (shared with the class view)."""
    personal = [c for c in columns if FORBIDDEN.search(c)]
    if personal:
        raise WorkforceError(f"Remove columns that identify people before uploading: {', '.join(personal)}")


def read_skills(cell: str) -> list[str]:
    """Skill IDs in one CSV cell ("Excel; SQL | Python"), dictionary matching only."""
    aliases = skills._alias_index()
    return sorted({aliases[t] for t in (skills.normalize(s) for s in re.split(r"[;|]", cell)) if t in aliases})


def parse(ref: Reference, text: str) -> tuple[list[dict], list[str]]:
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff").strip()))  # Excel's "CSV UTF-8" starts with a BOM
    columns = [c.strip().lower() for c in (reader.fieldnames or [])]
    if "role" not in columns or "skills" not in columns:
        raise WorkforceError("The CSV needs a 'role' column and a 'skills' column")
    check_columns(columns)
    roles = _role_index(ref)
    people, problems = [], []
    for n, raw in enumerate(reader, start=2):
        if n - 1 > MAX_ROWS:
            raise WorkforceError(f"At most {MAX_ROWS} rows")
        row = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        role_id = roles.get(skills.normalize(row.get("role", "")))
        if not role_id:
            problems.append(f"Row {n}: unknown role '{row.get('role', '')}'")
            continue
        people.append({"role_id": role_id, "skills": read_skills(row.get("skills", ""))})
    if not people:
        raise WorkforceError("No rows could be read")
    return people, problems


def _plan_fees(plan: dict) -> dict:
    """Course fees for one person's plan, split by HRD Corp status; paid courses without a price are listed."""
    fees = {"total": 0.0, "claimable": 0.0, "ask": 0.0, "unpriced": set()}
    for step in plan["steps"]:
        course = step["course"]
        if course["cost"] != "paid":
            continue
        if course.get("price_rm") is None:
            fees["unpriced"].add(course["title"])
            continue
        fees["total"] += course["price_rm"]
        fees["claimable" if course.get("hrd_corp") == "claimable" else "ask"] += course["price_rm"]
    return fees


def analyse(ref: Reference, text: str, scenario_id: str) -> dict:
    people, problems = parse(ref, text)
    groups = Counter((p["role_id"], tuple(p["skills"])) for p in people)
    by_role: dict[str, dict] = {}
    moves: dict[tuple[str, str], dict] = defaultdict(lambda: {"people": 0, "hours": 0, "fit": 0.0, "fees": 0.0})
    budget = {"total": 0.0, "claimable": 0.0, "ask": 0.0, "unpriced": set(), "people_paid": 0, "time": 0.0}
    # Upskill in place, per role: for groups at risk (an option beside the move) and stable but exposed ("get ahead").
    in_place: dict[str, dict] = defaultdict(lambda: {"people": 0, "hours": 0, "fees": 0.0, "time": 0.0})
    exposed = {r: tasks.for_role(ref, r)["shares"]["automate"] >= GET_AHEAD_SHARE for r in ref.roles}
    sdg_people: Counter = Counter()
    # The training-grant plan: every course in the nearest moves, with how many people take it.
    course_use: dict[str, dict] = {}
    for (role_id, person_skills), count in groups.items():
        profile = {"skills": list(person_skills), "current_role_id": role_id}
        result = matching.match(ref, profile, scenario_id)
        current = next(r for r in result["roles"] if r["role_id"] == role_id)
        entry = by_role.setdefault(role_id, {
            "role_id": role_id, "title": ref.roles[role_id]["title"], "headcount": 0,
            "outlook": current["outlook"], "at_risk": current["at_risk"], "fit_sum": 0.0,
        })
        entry["headcount"] += count
        entry["fit_sum"] += current["fit"] * count
        hourly = matching.pay(ref, role_id)["median_rm"] / WORK_HOURS_PER_MONTH
        upgraded = upgrade.upgraded_role(ref, role_id)
        if upgraded and (current["at_risk"] or exposed[role_id]):
            stay = pathway.build(ref, profile, role_id, summarize=False, role_override=upgraded)
            slot = in_place[role_id]
            slot["people"] += count
            slot["hours"] += stay["total_hours"] * count
            slot["fees"] += _plan_fees(stay)["total"] * count
            slot["time"] += stay["total_hours"] * hourly * count
        if not current["at_risk"]:
            continue
        # The nearest move: best skill fit among roles that are not declining (fewest hours on a tie).
        candidates = [r for r in result["roles"] if not r["at_risk"] and r["role_id"] != role_id]
        target = max(candidates, key=lambda r: (r["fit"], -r.get("plan_hours", 0)))
        plan = pathway.build(ref, profile, target["role_id"], summarize=False)
        for step in plan["steps"]:
            course = step["course"]
            use = course_use.setdefault(course["id"], {"course": course, "people": 0, "roles": set()})
            use["people"] += count
            use["roles"].add(ref.roles[target["role_id"]]["title"])
        move = moves[(role_id, target["role_id"])]
        move["people"] += count
        move["hours"] += plan["total_hours"] * count
        move["fit"] += target["fit"] * count
        fees = _plan_fees(plan)
        move["fees"] += fees["total"] * count
        for key in ("total", "claimable", "ask"):
            budget[key] += fees[key] * count
        budget["unpriced"] |= fees["unpriced"]
        budget["people_paid"] += count if fees["total"] or fees["unpriced"] else 0
        budget["time"] += plan["total_hours"] * hourly * count
        for sdg in target["sdgs"]:
            sdg_people[sdg["number"]] += count

    rows = sorted(({**{k: v for k, v in r.items() if k != "fit_sum"},
                    "avg_fit": round(r["fit_sum"] / r["headcount"], 3)} for r in by_role.values()),
                  key=lambda r: (not r["at_risk"], -r["headcount"]))
    move_list = sorted(({
        "from_role": ref.roles[a]["title"], "to_role": ref.roles[b]["title"], "to_role_id": b,
        "people": m["people"], "avg_hours": round(m["hours"] / m["people"]),
        "avg_fit_now": round(m["fit"] / m["people"], 3),
        "fees_each_rm": round(m["fees"] / m["people"], 2),
        "sdgs": ref.sdg_view(ref.role_sdgs(b)),
    } for (a, b), m in moves.items()), key=lambda m: (-m["people"], m["avg_hours"]))
    at_risk = sum(r["headcount"] for r in rows if r["at_risk"])
    risk_roles = {r["role_id"] for r in rows if r["at_risk"]}

    def stay_row(role_id: str, m: dict) -> dict:
        return {"role_id": role_id, "title": ref.roles[role_id]["title"], "people": m["people"],
                "avg_hours": round(m["hours"] / m["people"]), "fees_each_rm": round(m["fees"] / m["people"], 2),
                "staff_time_rm": round(m["time"], -2),
                "ai_skills": [ref.skills[s["skill_id"]]["name"] for s in ref.ai_upgrade[role_id]["ai_skills"]]}
    return {
        "scenario": ref.scenarios[scenario_id],
        "employees": len(people),
        "at_risk": at_risk,
        "total_hours": sum(m["avg_hours"] * m["people"] for m in move_list),
        # Course fees for all the moves, from the catalogue's dated prices (an estimate, not a quote).
        "budget": {"total_rm": round(budget["total"], 2), "claimable_rm": round(budget["claimable"], 2),
                   "ask_provider_rm": round(budget["ask"], 2), "unpriced_courses": sorted(budget["unpriced"]),
                   "people_with_fees": budget["people_paid"],
                   "staff_time_rm": round(budget["time"], -2), "pay_year": ref.salaries["year"]},
        "roles": rows,
        "moves": move_list,
        # Option 1 for each group at risk: the same role, AI-assisted. "get_ahead": stable roles AI is
        # likely to change a lot, a lower priority.
        "in_place": sorted((stay_row(r, m) for r, m in in_place.items() if r in risk_roles), key=lambda x: -x["people"]),
        "get_ahead": sorted((stay_row(r, m) for r, m in in_place.items() if r not in risk_roles), key=lambda x: -x["people"]),
        "sdg_contribution": [{**ref.sdgs[n], "people": c} for n, c in sdg_people.most_common()],
        "grant_plan": grant_plan(course_use),
        "problems": problems[:20],
        "signal_source": {k: ref.latest_snapshot[k] for k in ("snapshot_id", "imported", "illustrative")},
    }


def grant_plan(course_use: dict[str, dict]) -> list[dict]:
    """One row per course in the nearest moves: who takes it, hours, its dated price and HRD Corp
    status, so HR can prepare its own HRD Corp application. Laluan does not submit claims; a paid
    course without a price stays unpriced, never guessed."""
    rows = []
    for use in course_use.values():
        c = use["course"]
        price = c.get("price_rm") if c["cost"] == "paid" else 0
        rows.append({
            "course_id": c["id"], "title": c["title"], "provider": c["provider"], "url": c["url"],
            "cost": c["cost"], "hrd_corp": c.get("hrd_corp") or "not_needed", "checked": c.get("checked"),
            "people": use["people"], "hours_each": c["hours"], "hours_total": c["hours"] * use["people"],
            "price_each_rm": price, "fees_total_rm": None if price is None else round(price * use["people"], 2),
            "for_roles": sorted(use["roles"]),
        })
    order = {"claimable": 0, "check": 1, "not_needed": 2}
    return sorted(rows, key=lambda r: (order.get(r["hrd_corp"], 3), -r["people"], r["title"]))
