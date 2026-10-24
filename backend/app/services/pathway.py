"""Personalised reskilling pathway, built only from the course catalogue.

Steps come from the catalogue (never from the model): for each missing skill, most important
first, pick the course that covers the most remaining missing skills, preferring easier levels
and fewer hours. Gemini may add a short motivating summary; the grounding check then marks any
sentence that the catalogue and role data do not support (draft, then validate against evidence).
"""

from concurrent.futures import ThreadPoolExecutor

from app.llm import generate_json
from app.reference import Reference
from app.services import grounding
from app.services.matching import effective_skills, fit_and_gap, requirements

LEVEL_ORDER = {"intro": 0, "intermediate": 1, "advanced": 2}


def _choose_courses(ref: Reference, missing: list[dict], prefer_claimable: bool = False, free_only: bool = False) -> list[tuple[dict, list[str]]]:
    remaining = [rs["skill_id"] for rs in missing]
    chosen: list[tuple[dict, list[str]]] = []
    for skill_id in list(remaining):
        if skill_id not in remaining:
            continue  # already covered by an earlier course
        candidates = [c for c in ref.courses if skill_id in c["skills"]]
        if free_only:
            candidates = [c for c in candidates if c.get("cost") in ("free", "free_audit")]
        if not candidates:
            continue
        best = min(
            candidates,
            key=lambda c: (-len(set(c["skills"]) & set(remaining)),
                           0 if prefer_claimable and c.get("hrd_corp") == "claimable" else 1,
                           LEVEL_ORDER[c["level"]], c["hours"]),
        )
        taught = [s for s in remaining if s in best["skills"]]
        chosen.append((best, taught))
        remaining = [s for s in remaining if s not in taught]
    return chosen


def _template_summary(role: dict, steps: list[dict], total_hours: int) -> str:
    first = steps[0]
    return (
        f"To move toward {role['title']}, start with {first['course']['title']} "
        f"from {first['course']['provider']}. "
        f"The full plan has {len(steps)} steps and about {total_hours} hours of learning."
    )


SUMMARY_PROMPT = """Write two short, encouraging sentences for a person starting this learning plan.
Use only facts from the data below. Do not add courses, numbers or claims that are not in it.
Return JSON: {{"summary": "..."}}

Role: {role}
Steps: {steps}
Total hours: {hours}"""


_summaries: dict[str, str] = {}  # summary per plan prompt, for this process
_writing: set[str] = set()  # prompts Gemini is writing a summary for right now
_WRITER = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pathway-summary")


def _write_summary(prompt: str) -> None:
    try:
        _summaries[prompt] = str(generate_json(prompt)["summary"])
    except Exception:
        pass  # offline or failed: the template summary keeps standing
    finally:
        _writing.discard(prompt)


def build(ref: Reference, profile: dict, role_id: str, summarize: bool = True, role_override: dict | None = None,
          free_only: bool = False, wait_for_summary: bool = False) -> dict:
    """The plan is built from the skills the person reported, so finished steps stay visible
    (marked done) and readiness shows the progress since the plan was made. `role_override` is the
    role with extra skills (the AI-assisted version of a job, app/services/upgrade.py).
    `wait_for_summary` waits for Gemini instead of answering with the template first."""
    role = role_override or ref.roles[role_id]
    fit, _, missing = fit_and_gap(role, set(profile["skills"]))
    readiness, _, _ = fit_and_gap(role, effective_skills(ref, profile))
    done = set(profile.get("completed_courses") or [])
    steps = []
    for n, (course, taught) in enumerate(
        sorted(_choose_courses(ref, missing, prefer_claimable=(profile.get("audience") or "worker") == "worker", free_only=free_only), key=lambda ct: LEVEL_ORDER[ct[0]["level"]]), start=1
    ):
        weight = max(rs["weight"] for rs in missing if rs["skill_id"] in taught)
        steps.append({
            "step": n,
            "skills": [{"skill_id": s, "name": ref.skills[s]["name"]} for s in taught],
            "course": course,
            "why": ("Core skill" if weight == 3 else "Important skill" if weight == 2 else "Useful skill")
                   + f" for {role['title']}.",
            "why_key": "core" if weight == 3 else "important" if weight == 2 else "useful",  # the app words it per language
            "done": course["id"] in done,
            # The same skills, free, in Bahasa Malaysia and other languages: another way in, not a swap.
            "alternatives": [a for a in ref.course_alternatives if set(a["skills"]) & set(taught)],
        })
    uncovered = [rs["skill_id"] for rs in missing
                 if not any(rs["skill_id"] in s["course"]["skills"] for s in steps)]
    total_hours = sum(s["course"]["hours"] for s in steps)
    entry = requirements(ref, role_id, profile.get("current_role_id"))

    if not steps:
        key = "unavailable" if uncovered else "ready"
        summary = (f"No courses in this plan cover the remaining skills for {role['title']}."
                   if uncovered else f"You already have every skill we track for {role['title']}.")
        return {"role_id": role_id, "fit": fit, "readiness": readiness, "steps": [], "total_hours": 0,
                "hours_left": 0, "summary": summary, "requirements": entry,
                "summary_template": {"key": key, "vars": {"role": role["title"]}},
                "summary_mode": "template", "grounding": None, "uncovered_skills": uncovered}

    summary, mode = _template_summary(role, steps, total_hours), "template"
    try:
        if not summarize:
            raise RuntimeError("summary not requested")
        prompt = SUMMARY_PROMPT.format(
            role=role["title"],
            steps=[(s["course"]["title"], s["course"]["provider"], s["course"]["hours"]) for s in steps],
            hours=total_hours,
        )
        # The same plan always gets the same summary, so ask once. Gemini takes 10-15 s, so the
        # first view shows the template while the summary is written in the background; the next
        # view (ticking a course, switching "Free courses only") shows Gemini's.
        if prompt not in _summaries:
            if wait_for_summary:
                _write_summary(prompt)
            elif prompt not in _writing:
                _writing.add(prompt)
                _WRITER.submit(_write_summary, prompt)
        summary, mode = _summaries[prompt], "gemini"
    except Exception:
        pass  # offline: the template summary stands

    sources = [f"{role['title']}. {role['summary']}"] + [
        f"{s['course']['title']} {s['course']['provider']} {s['course']['hours']} hours "
        + " ".join(k["name"] for k in s["skills"]) for s in steps
    ] + [f"{len(steps)} steps {total_hours} hours learning plan start full"]
    report = grounding.check(summary, sources)
    return {
        "role_id": role_id,
        "fit": fit,
        "readiness": readiness,
        # Courses build skills; a licensed job also needs its qualification route first (shown above the steps).
        "requirements": entry,
        "hours_left": sum(s["course"]["hours"] for s in steps if not s["done"]),
        "steps": steps,
        "total_hours": total_hours,
        "summary": summary,
        "summary_mode": mode,
        # The template sentence as a key and values, so the app can show it in BM or 中文 (the Gemini
        # summary is English only).
        "summary_template": {"key": "start", "vars": {"role": role["title"], "course": steps[0]["course"]["title"],
                                                      "provider": steps[0]["course"]["provider"], "n": len(steps),
                                                      "h": total_hours}},
        "grounding": report.as_dict() if report else None,
        "uncovered_skills": uncovered,
    }
