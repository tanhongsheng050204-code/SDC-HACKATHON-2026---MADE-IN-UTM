"""Fairness check: recommendations must not change with who a person is.

Laluan stores no age, gender, ethnicity or background (the API refuses those fields), so the only
places identity could leak in are the name a person types and the name on a CV. This check runs
every demo profile under names from Malaysia's main communities, female and male, and confirms
that the ranking, every score, the pathway and the skills read from a CV come out identical. It
runs in the test suite and on demand (GET /api/fairness), so anyone can see the result.
"""

from app.config import get_settings
from app.reference import Reference
from app.services import matching, pathway, skills

NAMES = ["Nur Aisyah binti Ahmad", "Muhammad Hafiz bin Rahman", "Tan Mei Ling", "Lim Jun Hao",
         "Priya a/p Raman", "Rajesh a/l Kumar", "Jennifer Anak Jalong", "Mohd Firdaus Gimbang"]
SCENARIOS = ("slow", "baseline", "accelerated")
CVS = ("cv1_clerk.txt", "cv2_student.txt", "cv3_service.txt", "cv4_technician.txt", "cv5_manager.txt")


def _outcome(ref: Reference, profile: dict) -> tuple:
    ranked = []
    for scenario in SCENARIOS:
        roles = matching.match(ref, profile, scenario)["roles"]
        ranked.append(tuple((r["role_id"], r["rank"], r["why"]["score"]) for r in roles))
    top = ranked[1][0][0]
    steps = tuple(s["course"]["id"] for s in pathway.build(ref, profile, top, summarize=False)["steps"])
    return tuple(ranked), steps


def _cv_skills(text: str, name: str) -> tuple:
    first, rest = text.split("\n", 1)
    return tuple(sorted(skills.dictionary_extract(f"{name}\n{rest}")))


def run(ref: Reference) -> dict:
    checks, failures = 0, []
    for key, demo in ref.demo_profiles.items():
        base = {"id": f"fairness-{key}", "display_name": None, "current_role_id": demo["current_role_id"],
                "skills": demo["skills"], "experience_years": demo.get("experience_years"), "completed_courses": [],
                "audience": demo.get("audience"), "preferences": {}, "target_role_id": None, "skill_levels": {}}
        expected = _outcome(ref, base)
        for name in NAMES:
            checks += 1
            if _outcome(ref, {**base, "display_name": name}) != expected:
                failures.append(f"{key}: results changed for the name {name}")
    eval_dir = get_settings().data_dir / "eval"
    cvs = 0
    for file in CVS:
        path = eval_dir / file
        if not path.exists():
            continue
        cvs += 1
        text = path.read_text(encoding="utf-8")
        expected = _cv_skills(text, NAMES[0])
        for name in NAMES[1:]:
            checks += 1
            if _cv_skills(text, name) != expected:
                failures.append(f"{file}: skills read differently for the name {name}")
    return {"passed": not failures, "checks": checks, "profiles": len(ref.demo_profiles), "cvs": cvs,
            "names": NAMES, "scenarios": list(SCENARIOS), "failures": failures,
            "not_collected": ["age", "gender", "ethnicity", "religion", "marital status", "disability", "nationality"],
            "method": "Each demo profile and synthetic CV is run under every name; rankings, scores in all three "
                      "scenarios, the pathway to the top role and the skills read from the CV must be identical."}


_cache: dict[str, dict] = {}


def cached(ref: Reference) -> dict:
    """One run per forecast in use: the result only changes when the data does."""
    key = ref.latest_snapshot["snapshot_id"]
    if key not in _cache:
        _cache.clear()
        _cache[key] = run(ref)
    return _cache[key]
