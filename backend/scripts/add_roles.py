"""Add roles to the catalogue in three reviewable steps (DECISIONS #42).

    python scripts/add_roles.py draft "path/to/Task Statements.txt"   # Gemini drafts each role
    python scripts/add_roles.py courses                                # finds and checks courses for new skills
    python scripts/add_roles.py apply                                  # merges the reviewed draft into data/

The roles come from data/raw/new_roles.json: id, title, family, sector, WEF category and the
occupation codes, chosen by the team. Each step writes to data/raw/new_roles_draft.json, which the
team reads before `apply`:

- draft: for each role, Gemini reads its O*NET 30.0 task statements, our skill catalogue (with
  which skills already have a course), the WEF category and the MASCO group, and drafts the
  summary, weighted skills, work context, entry-level flag, task labels, SDG tags with reasons,
  the team's automation-exposure and AI-complementarity estimates, which tracked AI capabilities
  expose or complement it, survey cards in EN / BM / 中文 and the job-ad search terms. It may
  propose at most two skills the catalogue lacks.
- courses: for each proposed new skill, a Gemini search with Google Search grounding looks for a
  free or low-cost course; the link is opened and checked like scripts/check_links.py. A new skill
  without a working course is dropped and the role keeps only catalogue skills, so every gap still
  has a course.
- apply: writes roles.json (reviewed_by null, so the app shows "New role, data being checked"),
  skills.json, courses.json, sdg_map.json, raw/onet_task_labels.json, survey_cards.json,
  role_openings.json, role_occupations.json, capabilities.json and raw/wef_foj2025_roles.csv.
  Then run, in order: build_snapshot.py, build_tasks.py, build_translations.py,
  build_sdg_translations.py, build_day_in_job.py <new ids>, build_ai_upgrade.py and
  build_ai_exposure.py --keep-usage.

Needs GEMINI_API_KEY in backend/.env.
"""

import argparse
import csv
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import _jsonfmt  # noqa: E402
from app.llm import generate_grounded_json, generate_json  # noqa: E402
from check_links import check  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
SPEC = DATA / "raw" / "new_roles.json"
DRAFT = DATA / "raw" / "new_roles_draft.json"
DIMS = ("people", "structured", "field", "shifts", "team")
LABELS = ("automate", "assist", "human")
MAX_NEW_SKILLS = 2


def _read(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def _write(name: str, data, kind: str = "plain") -> None:
    _jsonfmt.write(DATA / name, data, kind)


def _append(name: str, closing: str, records: list[str]) -> None:
    """Add records just before a hand-kept file's closing text, leaving every other line alone."""
    path = DATA / name
    text = path.read_text(encoding="utf-8").rstrip()
    if not text.endswith(closing):
        raise SystemExit(f"{name} does not end as expected; add the records by hand")
    path.write_text(text[: -len(closing)].rstrip() + ",\n" + ",\n".join(records) + "\n" + closing + "\n",
                    encoding="utf-8")


def wef_growth() -> dict[str, float]:
    with (DATA / "raw" / "wef_foj2025_figure_2_3.csv").open(encoding="utf-8", newline="") as handle:
        return {row["occupation"]: float(row["net_growth_pct"]) for row in csv.DictReader(handle)}


def onet_tasks(path: Path, code: str) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return [{"task_id": int(row["Task ID"]), "text": row["Task"], "type": row["Task Type"]}
                for row in csv.DictReader(handle, delimiter="\t") if row["O*NET-SOC Code"] == code]


def _prompt(spec: dict, growth: float, tasks: list[dict], skills: list[dict], taught: set[str],
            anchors: list[dict], capabilities: list[dict], dims: list[dict], salaries: dict) -> str:
    group = next(g["name"] for g in salaries["groups"] if g["id"] == spec["masco_major"])
    return f"""You draft reference data for Laluan, a Malaysian career-guidance app about how AI changes jobs.
Use ONLY the facts below and general knowledge of the occupation in Malaysia. Do not invent statistics.

ROLE: {spec['title']} (id {spec['id']}), field "{spec['family']}", sector: {spec['sector']}.
WEF Future of Jobs 2025 category: {spec['wef_category']}, net job growth 2025-2030: {growth:+.1f}% (global employer survey).
MASCO 2020 major group {spec['masco_major']} ({group}).

O*NET 30.0 TASKS (id: text):
{chr(10).join(f"{t['task_id']}: {t['text']}" for t in tasks)}

SKILL CATALOGUE (id | name | category | has a course):
{chr(10).join(f"{s['id']} | {s['name']} | {s['category']} | {'yes' if s['id'] in taught else 'no'}" for s in skills)}

EXISTING ROLES FOR SCALE (id: automation_exposure, ai_complementarity):
{chr(10).join(f"{a['role_id']}: {a['automation_exposure']}, {a['ai_complementarity']}" for a in anchors)}

TRACKED AI CAPABILITIES (id: name):
{chr(10).join(f"{c['id']}: {c['name']}" for c in capabilities)}

WORK DIMENSIONS (-1 to +1; +1 means the first pole):
{chr(10).join(f"{d['id']}: +1 {d['plus']['en']} / -1 {d['minus']['en']}" for d in dims)}

Return one JSON object with exactly these keys:
"summary": one plain sentence, under 15 words, what the job does (like "Keys records into business systems and checks them for errors.").
"skills": 4 to 6 objects {{"skill_id", "weight"}}; weight 3 core, 2 important, 1 useful; prefer catalogue skills with a course; at most {MAX_NEW_SKILLS} new skills written as "new:<snake_case_id>".
"new_skills": for each new skill, {{"id", "name", "category" (one of digital, data, business, technical, ai, green, human), "aliases" (3-6 lowercase phrases), "why", "sdg": {{"sdg", "target", "reason"}}}}; [] if none.
"work_context": {{{", ".join(f'"{d}"' for d in DIMS)}}} each a number from -1 to 1.
"entry_level": true if people without experience are commonly hired in Malaysia.
"entry_level_reason": one sentence.
"automation_exposure", "ai_complementarity": numbers 0 to 1 on the same scale as the existing roles.
"exposure_reason": one sentence on what AI changes in this job.
"exposed_by", "complemented_by": lists of capability ids from the list above (may be empty).
"tasks": 6 to 8 of the O*NET tasks most typical of the job in Malaysia, each {{"task_id", "label" (automate = AI likely to do it, assist = AI helps the person, human = stays human), "reason" (one sentence, why)}}.
"sdgs": 1 or 2 objects {{"sdg" (number), "target" (like "8.5"), "reason" (one sentence on how this role serves the target)}}.
"survey_cards": 2 objects {{"dims" (1-2 dimension ids each set to 1 or -1), "text": {{"en", "ms", "zh"}} (a sentence about a typical moment in this work, second person, no job title)}}.
"openings": {{"query": a full-text job-ad search, OR between quoted phrases, Malaysian wording; "titles": 2-3 lowercase words a matching job title contains}}.
"""


def draft(task_file: Path) -> None:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    roles = {r["id"] for r in _read("roles.json")}
    skills, courses = _read("skills.json"), _read("courses.json")
    taught = {s for c in courses for s in c["skills"]}
    with (DATA / "raw" / "wef_foj2025_roles.csv").open(encoding="utf-8", newline="") as handle:
        anchors = list(csv.DictReader(handle))
    capabilities = _read("capabilities.json")["capabilities"]
    dims, salaries, growth = _read("work_dimensions.json"), _read("salaries.json"), wef_growth()
    out = json.loads(DRAFT.read_text(encoding="utf-8")) if DRAFT.exists() else {"roles": {}}
    for s in spec["roles"]:
        if s["id"] in roles:
            raise SystemExit(f"{s['id']} is already in roles.json")
        if s["wef_category"] not in growth:
            raise SystemExit(f"{s['id']}: {s['wef_category']!r} is not in WEF Figure 2.3")
        tasks = onet_tasks(task_file, s["onet"])
        if not tasks:
            raise SystemExit(f"{s['id']}: no O*NET tasks for {s['onet']}")
        if s["id"] in out["roles"]:  # drafted before: check it again, without a new model call
            body = {k: v for k, v in out["roles"][s["id"]].items() if k != "problems"}
        else:
            body = generate_json(_prompt(s, growth[s["wef_category"]], tasks, skills, taught, anchors,
                                         capabilities, dims, salaries), timeout_seconds=120)
        normalise(body)
        problems = validate(body, s, {t["task_id"] for t in tasks}, {x["id"] for x in skills}, taught,
                            {c["id"] for c in capabilities})
        out["roles"][s["id"]] = {**body, "problems": problems}
        print(f"{s['id']}: drafted" + (f" ({len(problems)} problems: {problems})" if problems else ""))
        DRAFT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalise(body: dict) -> None:
    """Small format slips the model makes: task ids as strings, "new:" kept on a new skill's id."""
    for t in body.get("tasks", []):
        t["task_id"] = int(t["task_id"])
    for n in body.get("new_skills", []):
        n["id"] = n["id"].removeprefix("new:")
    for t in body.get("sdgs", []) + [n["sdg"] for n in body.get("new_skills", [])]:
        t["sdg"], t["target"] = int(t["sdg"]), str(t["target"])


def validate(body: dict, spec: dict, task_ids: set[int], skill_ids: set[str], taught: set[str],
             capability_ids: set[str]) -> list[str]:
    problems = []
    new = {n["id"] for n in body.get("new_skills", [])}
    for rs in body.get("skills", []):
        sid = rs["skill_id"].removeprefix("new:")
        if rs["skill_id"].startswith("new:") and sid not in new:
            problems.append(f"new skill {sid} not described")
        elif not rs["skill_id"].startswith("new:") and sid not in skill_ids:
            problems.append(f"unknown skill {sid}")
        elif sid in skill_ids and sid not in taught:
            problems.append(f"skill {sid} has no course")
        if rs.get("weight") not in (1, 2, 3):
            problems.append(f"bad weight on {sid}")
    if len(new) > MAX_NEW_SKILLS or new & skill_ids:
        problems.append("too many or clashing new skills")
    if set(body.get("work_context", {})) != set(DIMS):
        problems.append("work_context dimensions")
    if any(t["task_id"] not in task_ids or t["label"] not in LABELS for t in body.get("tasks", [])):
        problems.append("task ids or labels")
    if any(not str(t["target"]).startswith(f"{t['sdg']}.") for t in body.get("sdgs", [])):
        problems.append("SDG target does not match goal")
    if not set(body.get("exposed_by", []) + body.get("complemented_by", [])) <= capability_ids:
        problems.append("unknown capability")
    if not all(0 <= body.get(k, -1) <= 1 for k in ("automation_exposure", "ai_complementarity")):
        problems.append("estimates out of range")
    return problems


COURSE_PROMPT = """Find ONE real online course, open to learners in Malaysia, that teaches this skill: "{name}" ({why}).
It must be free, free to audit, or low cost (under RM 300), from a known provider (Coursera, edX, FutureLearn,
Alison, OpenLearning, Khan Academy, LinkedIn Learning, Google, Microsoft Learn, Cisco, Autodesk, a Malaysian
university or an HRD Corp training provider). Use the course's own page, not a search or catalogue page.
Return JSON: {{"title", "provider", "url", "hours" (number), "level" (intro|intermediate|advanced),
"cost" (free|free_audit|paid), "price_rm" (number, 0 if free), "price_note" (one sentence from the page)}}."""


def courses() -> None:
    out = json.loads(DRAFT.read_text(encoding="utf-8"))
    for role_id, body in out["roles"].items():
        for skill in body.get("new_skills", []):
            if skill.get("course") or skill.get("dropped"):
                continue
            try:
                found, sources = generate_grounded_json(COURSE_PROMPT.format(name=skill["name"], why=skill["why"]))
                ok, why = check(found)
            except Exception as error:  # noqa: BLE001 - no course means the skill is dropped
                found, ok, why = None, False, f"{type(error).__name__}: {error}"
            if ok:
                skill["course"] = {**found, "checked": dt.date.today().isoformat(), "found_via": "Gemini with Google Search"}
                print(f"{role_id}/{skill['id']}: {found['title']} ({found['url']})")
            else:
                skill["dropped"] = f"no working course: {why}"[:300]
                print(f"{role_id}/{skill['id']}: dropped ({why[:120]})")
            DRAFT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def apply() -> None:
    spec = {s["id"]: s for s in json.loads(SPEC.read_text(encoding="utf-8"))["roles"]}
    draft_roles = json.loads(DRAFT.read_text(encoding="utf-8"))["roles"]
    bad = {r: b["problems"] for r, b in draft_roles.items() if b.get("problems")}
    if bad or set(draft_roles) != set(spec):
        raise SystemExit(f"Fix the draft first: problems {bad}, missing {set(spec) - set(draft_roles)}")
    growth = wef_growth()
    roles, skills, catalogue = _read("roles.json"), _read("skills.json"), _read("courses.json")
    sdg_map, new_cards, new_labels = _read("sdg_map.json"), [], []
    openings = _read("role_openings.json")
    occupations, capabilities = _read("role_occupations.json"), _read("capabilities.json")
    today = dt.date.today().isoformat()
    wef_rows = []
    for role_id, body in draft_roles.items():
        s = spec[role_id]
        kept = {}
        for n in body.get("new_skills", []):
            if not n.get("course"):
                continue
            kept[n["id"]] = n
            skills.append({"id": n["id"], "name": n["name"], "category": n["category"], "aliases": n["aliases"],
                           "added": today, "reviewed_by": None})
            sdg_map["skills"][n["id"]] = [n["sdg"]]
            c = n["course"]
            catalogue.append({"id": f"{n['id']}_course", "title": c["title"], "provider": c["provider"], "url": c["url"],
                              "skills": [n["id"]], "level": c["level"], "hours": c["hours"], "cost": c["cost"],
                              "checked": c["checked"], "price_rm": c["price_rm"], "price_note": c["price_note"],
                              "price_checked": c["checked"], "hrd_corp": "check" if c["cost"] == "paid" else "not_needed",
                              "reviewed_by": None})
        role_skills = [{"skill_id": rs["skill_id"].removeprefix("new:"), "weight": rs["weight"]}
                       for rs in body["skills"]
                       if not rs["skill_id"].startswith("new:") or rs["skill_id"].removeprefix("new:") in kept]
        roles.append({"id": role_id, "title": s["title"], "family": s["family"], "summary": body["summary"],
                      "skills": role_skills, "work_context": {d: round(float(body["work_context"][d]), 2) for d in DIMS},
                      "entry_level": bool(body["entry_level"]), "masco_major": s["masco_major"],
                      "added": today, "reviewed_by": None})
        sdg_map["roles"][role_id] = [{"sdg": t["sdg"], "target": str(t["target"]), "reason": t["reason"]} for t in body["sdgs"]]
        tasks = ",\n".join("        " + json.dumps({"task_id": t["task_id"], "label": t["label"], "reason": t["reason"]},
                                                   ensure_ascii=False) for t in body["tasks"])
        note = json.dumps(s.get("occupation_note"), ensure_ascii=False)
        new_labels.append(f'    "{role_id}": {{\n      "onet_code": "{s["onet"]}",\n      "onet_note": {note},\n'
                          f'      "tasks": [\n{tasks}\n      ]\n    }}')
        cards = [{"id": f"card-{role_id}-{i}", "role_ids": [role_id], "dims": c["dims"], "text": c["text"]}
                 for i, c in enumerate(body["survey_cards"], 1)]
        new_cards.append("\n" + _jsonfmt.survey_cards(cards)[2:-2])  # a blank line between roles, as in the file
        openings["roles"][role_id] = body["openings"]
        occupations["roles"][role_id] = {"soc": s["soc"], "onet": s["onet"], "isco08": s["isco08"], "note": s.get("occupation_note")}
        for cap in capabilities["capabilities"]:
            if cap["id"] in body.get("exposed_by", []):
                cap["exposes_roles"].append(role_id)
            if cap["id"] in body.get("complemented_by", []):
                cap["complements_roles"].append(role_id)
        wef_rows.append({"role_id": role_id, "net_growth_pct": growth[s["wef_category"]],
                         "automation_exposure": round(float(body["automation_exposure"]), 2),
                         "ai_complementarity": round(float(body["ai_complementarity"]), 2),
                         "note": (f"WEF FoJ 2025, Figure 2.3 (p. 21): {s['wef_category']} {growth[s['wef_category']]:+g}% "
                                  "net growth 2025-2030, global employer survey. Automation exposure and AI "
                                  "complementarity are the team's estimates (AI-drafted, to be reviewed), not WEF figures.")})
    _write("roles.json", roles)
    _write("skills.json", skills)
    _write("courses.json", catalogue)
    _write("sdg_map.json", sdg_map)
    _append("raw/onet_task_labels.json", "  }\n}", new_labels)  # after the last role, inside "roles"
    _append("survey_cards.json", "]", new_cards)
    _write("role_openings.json", openings)
    _write("role_occupations.json", occupations)
    _write("capabilities.json", capabilities, "capabilities")
    path = DATA / "raw" / "wef_foj2025_roles.csv"
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["role_id", "net_growth_pct", "automation_exposure", "ai_complementarity", "note"])
        writer.writerows(wef_rows)
    print(f"Added {len(draft_roles)} roles. Now run the build scripts listed at the top of this file.")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="step", required=True)
    sub.add_parser("draft").add_argument("task_statements", type=Path)
    sub.add_parser("courses")
    sub.add_parser("apply")
    args = parser.parse_args()
    {"draft": lambda: draft(args.task_statements), "courses": courses, "apply": apply}[args.step]()


if __name__ == "__main__":
    main()
