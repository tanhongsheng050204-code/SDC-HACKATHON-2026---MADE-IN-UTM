"""HR workforce view: an anonymous CSV of roles and skills in, aggregate risk and reskilling moves out.

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
from app.services import matching, pathway, skills

MAX_ROWS = 5000
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
    reader = csv.DictReader(io.StringIO(text.strip()))
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


def analyse(ref: Reference, text: str, scenario_id: str) -> dict:
    people, problems = parse(ref, text)
    groups = Counter((p["role_id"], tuple(p["skills"])) for p in people)
    by_role: dict[str, dict] = {}
    moves: dict[tuple[str, str], dict] = defaultdict(lambda: {"people": 0, "hours": 0, "fit": 0.0})
    sdg_people: Counter = Counter()
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
        if not current["at_risk"]:
            continue
        target = next(r for r in result["roles"] if not r["at_risk"] and r["role_id"] != role_id)
        plan = pathway.build(ref, profile, target["role_id"], summarize=False)
        move = moves[(role_id, target["role_id"])]
        move["people"] += count
        move["hours"] += plan["total_hours"] * count
        move["fit"] += target["fit"] * count
        for sdg in target["sdgs"]:
            sdg_people[sdg["number"]] += count

    rows = sorted(({**{k: v for k, v in r.items() if k != "fit_sum"},
                    "avg_fit": round(r["fit_sum"] / r["headcount"], 3)} for r in by_role.values()),
                  key=lambda r: (not r["at_risk"], -r["headcount"]))
    move_list = sorted(({
        "from_role": ref.roles[a]["title"], "to_role": ref.roles[b]["title"], "to_role_id": b,
        "people": m["people"], "avg_hours": round(m["hours"] / m["people"]),
        "avg_fit_now": round(m["fit"] / m["people"], 3),
        "sdgs": ref.sdg_view(ref.role_sdgs(b)),
    } for (a, b), m in moves.items()), key=lambda m: (-m["people"], m["avg_hours"]))
    at_risk = sum(r["headcount"] for r in rows if r["at_risk"])
    return {
        "scenario": ref.scenarios[scenario_id],
        "employees": len(people),
        "at_risk": at_risk,
        "total_hours": sum(m["avg_hours"] * m["people"] for m in move_list),
        "roles": rows,
        "moves": move_list,
        "sdg_contribution": [{**ref.sdgs[n], "people": c} for n, c in sdg_people.most_common()],
        "problems": problems[:20],
        "signal_source": {k: ref.latest_snapshot[k] for k in ("snapshot_id", "imported", "illustrative")},
    }
