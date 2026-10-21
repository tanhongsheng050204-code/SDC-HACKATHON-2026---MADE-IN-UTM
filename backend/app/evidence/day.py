"""A day in this job: a short description of the work for each role page, in EN / BM / 中文.

Gemini writes it from our own data only: the role's O*NET tasks, its work context, its main
skills, its DOSM pay group and its SDG reason. That version is committed for every role in
data/day_in_job.json (scripts/build_day_in_job.py) and listed in REVIEW_LOG for the team.

When an admin approves a role's job-ad evidence, a richer version that also uses the approved ad
quotes is drafted in the background and waits in the review queue (kind "day"). Once a person
approves it, it replaces the file version for that role. Nothing here feeds any score.
"""

import datetime as dt
import logging
import threading

from app import store
from app.llm import generate_json

log = logging.getLogger(__name__)

LANGS = ("en", "ms", "zh")
MAX_CHARS = 900
MAX_QUOTES = 8
TIMEOUT_SECONDS = 60  # three languages at once: often 10-20 s, past the default limit

PROMPT = """Write "A day in this job" for the role "{title}" for a Malaysian student or worker deciding on
their career. Use ONLY the facts below. Do not add tools, employers, numbers, hours or places that
are not in the facts.

Write 3 or 4 short sentences, in the second person ("You start the day..."): what you spend the day
doing, the setting and who you work with, and how the work helps people (the SDG reason). If pay is
given, end with one sentence saying it is the median for the whole occupation group, not a job offer.

Return JSON only: {{"en": "...", "ms": "... (natural Bahasa Melayu)", "zh": "... (简体中文)"}}

Facts:
{facts}"""


class Unusable(Exception):
    """The draft is missing a language or is too long to show."""


def facts(ref, role_id: str, evidence: dict | None = None) -> dict:
    """The facts a draft may use. `evidence` is an approved job-ad evidence body, if any."""
    role = ref.roles[role_id]
    tasks = ref.tasks["roles"].get(role_id, {}).get("tasks", [])
    setting = [d["plus" if role["work_context"][d["id"]] > 0 else "minus"]["en"]
               for d in ref.work_dimensions if abs(role["work_context"].get(d["id"], 0)) >= 0.4]
    skills = [ref.skills[rs["skill_id"]]["name"]
              for rs in sorted(role["skills"], key=lambda rs: -rs["weight"]) if rs["skill_id"] in ref.skills][:6]
    group = next((g for g in ref.salaries["groups"] if g["id"] == role.get("masco_major")), None)
    out = {
        "role": role["title"], "summary": role["summary"],
        "tasks": [t["text"] for t in tasks],
        "work_setting": setting,
        "main_skills": skills,
        "sdg_reasons": [t["reason"] for t in ref.role_sdgs(role_id)],
    }
    if group:
        out["pay"] = (f"DOSM {ref.salaries['year']} median monthly pay for {group['name']} "
                      f"(the whole occupation group): RM{group['median_rm']:,}")
    if evidence:
        quotes = [q["quote"] for p in evidence.get("sources", []) if p.get("kind") == "job_ad"
                  for q in p.get("quotes", [])]
        out["from_malaysian_job_ads"] = list(dict.fromkeys(quotes))[:MAX_QUOTES]
    return out


def draft(ref, role_id: str, evidence: dict | None = None, *, generate=generate_json,
          today: dt.date | None = None) -> dict:
    """One Gemini call. Raises Unusable (or on any call failure)."""
    used = facts(ref, role_id, evidence)
    lines = "\n".join(f"- {k}: {v}" for k, v in used.items())
    raw = generate(PROMPT.format(title=ref.roles[role_id]["title"], facts=lines), timeout_seconds=TIMEOUT_SECONDS)
    raw = raw if isinstance(raw, dict) else {}
    text = {lang: str(raw.get(lang) or "").strip() for lang in LANGS}
    if not all(text.values()):
        raise Unusable("a language is missing")
    if any(len(v) > MAX_CHARS for v in text.values()):
        raise Unusable("too long")
    return {"role_id": role_id, "text": text, "basis": "job_ads" if evidence else "data",
            "drafted": str(today or dt.date.today()), "facts": used, "reviewed_by": None}


# --- richer draft after an evidence approval -----------------------------------------------------

def queue_for(role_id: str, evidence: dict, *, generate=generate_json, now: dt.datetime | None = None) -> str | None:
    """Draft the job-ad version and save it for review. Returns the new ID, or None if drafting failed."""
    from app.reference import get_reference

    now = now or dt.datetime.now().replace(microsecond=0)
    try:
        body = draft(get_reference(), role_id, evidence, generate=generate, today=now.date())
    except Exception as error:  # the approval itself already succeeded; the team can retry later
        log.warning("A day in this job: no draft for %s (%s)", role_id, type(error).__name__)
        return None
    evidence_id = f"{now:%Y-%m-%d-%H%M%S}-day-{role_id}"
    store.save_evidence(evidence_id, "day", role_id, body)
    return evidence_id


def queue_in_background(role_id: str, evidence: dict) -> threading.Thread:
    thread = threading.Thread(target=queue_for, args=(role_id, evidence), name=f"day-{role_id}", daemon=True)
    thread.start()
    return thread
