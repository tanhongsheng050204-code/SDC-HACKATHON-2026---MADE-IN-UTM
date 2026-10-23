"""Career-centre class view: an anonymous CSV of students' skills in, the cohort's picture out.

Totals only, like the HR view (app/services/workforce.py): which roles the class fits best, the
skills most students still need, and the courses that would help the most students. Any count
under SMALL is shown as "fewer than 3", so no student can be singled out of a small group.
Each student is matched as a graduate (entry-level roles get their visible boost).
"""

import csv
import io
from collections import Counter, defaultdict

from app.config import get_settings
from app.reference import Reference
from app.services import matching, skills, skilltree, workforce
from app.services.workforce import WorkforceError

SMALL = 3
HIDDEN = "fewer than 3"
TOP_GAPS, TOP_COURSES = 8, 5


def sample_path():
    return get_settings().data_dir / "sample_class.csv"


def _count(n: int) -> int | str:
    return n if n >= SMALL else HIDDEN


def programme_name(ref: Reference, raw: str) -> str:
    """The catalogue programme a free-text programme cell names (data/programmes.json aliases), so
    "BBA" and "Business Administration" count together; otherwise the text as written."""
    key = skills.normalize(raw)
    if not key:
        return "Not given"
    for prog in ref.programmes:
        if key in {skills.normalize(a) for a in prog["aliases"]} or key == skills.normalize(prog["name"]["en"]):
            return prog["name"]["en"]
    return raw.strip()[:60]


def parse(ref: Reference, text: str) -> tuple[list[dict], list[str]]:
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff").strip()))  # Excel's "CSV UTF-8" starts with a BOM
    columns = [c.strip().lower() for c in (reader.fieldnames or [])]
    if "skills" not in columns:
        raise WorkforceError("The CSV needs a 'skills' column (and optionally 'programme')")
    workforce.check_columns(columns)
    students, problems = [], []
    for n, raw in enumerate(reader, start=2):
        if n - 1 > workforce.MAX_ROWS:
            raise WorkforceError(f"At most {workforce.MAX_ROWS} rows")
        row = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
        found = workforce.read_skills(row.get("skills", ""))
        if not found:
            problems.append(f"Row {n}: no skills we recognise")
            continue
        students.append({"programme": programme_name(ref, row.get("programme") or ""), "skills": found})
    if not students:
        raise WorkforceError("No rows could be read")
    return students, problems


def analyse(ref: Reference, text: str, scenario_id: str) -> dict:
    students, problems = parse(ref, text)
    groups = Counter((s["programme"], tuple(s["skills"])) for s in students)
    per_programme: dict[str, dict] = defaultdict(lambda: {"students": 0, "best": Counter(), "gaps": Counter()})
    best: Counter = Counter()
    gaps: Counter = Counter()
    helped: Counter = Counter()
    sdg_students: Counter = Counter()
    outlooks: dict[str, dict] = {}
    for (programme, skill_ids), count in groups.items():
        result = matching.match(ref, {"skills": list(skill_ids), "current_role_id": None, "audience": "graduate"}, scenario_id)
        top = result["roles"][0]
        best[top["role_id"]] += count
        prog = per_programme[programme]
        prog["students"] += count
        prog["best"][top["role_id"]] += count
        outlooks[top["role_id"]] = top["outlook"]
        missing = {s["skill_id"] for s in top["missing"]}
        for skill_id in missing:
            gaps[skill_id] += count
            prog["gaps"][skill_id] += count
        for course in ref.courses:
            if missing & set(course["skills"]):
                helped[course["id"]] += count
        for sdg in top["sdgs"]:
            sdg_students[sdg["number"]] += count

    courses = {c["id"]: c for c in ref.courses}
    programmes = Counter(s["programme"] for s in students)
    return {
        "scenario": ref.scenarios[scenario_id],
        "students": _count(len(students)),
        "programmes": [{"name": p, "students": _count(n)} for p, n in programmes.most_common()],
        "best_fit": [{"role_id": r, "title": ref.roles[r]["title"], "students": _count(n), "outlook": outlooks[r]}
                     for r, n in best.most_common()],
        "top_gaps": [{"skill_id": s, "name": ref.skills[s]["name"], "students": _count(n),
                      "course": skilltree.course_for(ref, s)} for s, n in gaps.most_common(TOP_GAPS)],
        "courses": [{"course": {k: courses[c][k] for k in ("id", "title", "provider", "url", "hours", "cost")},
                     "students_helped": _count(n), "hours": courses[c]["hours"]}
                    for c, n in sorted(helped.items(), key=lambda kv: (-kv[1], courses[kv[0]]["hours"]))[:TOP_COURSES]],
        # Per programme (groups of at least SMALL students only, so no small group can be singled out):
        # where its students fit best and the gaps a counsellor could close with one add-on course.
        "by_programme": [
            {"name": name, "students": p["students"],
             "best_fit": [{"role_id": r, "title": ref.roles[r]["title"], "students": _count(n)} for r, n in p["best"].most_common(2)],
             "top_gaps": [{"skill_id": g, "name": ref.skills[g]["name"], "students": _count(n), "course": skilltree.course_for(ref, g)}
                          for g, n in p["gaps"].most_common(3)]}
            for name, p in sorted(per_programme.items(), key=lambda kv: -kv[1]["students"])
            if p["students"] >= SMALL and name != "Not given"],
        "sdg_contribution": [{**ref.sdgs[n], "students": _count(c)} for n, c in sdg_students.most_common()],
        "problems": problems[:20],
        "signal_source": {k: ref.latest_snapshot[k] for k in ("snapshot_id", "imported", "illustrative")},
    }
