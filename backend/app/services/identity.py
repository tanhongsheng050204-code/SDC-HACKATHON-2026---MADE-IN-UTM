"""Career identity statement: one or two sentences that say who you are for a target role, built
from the skills you already have that the role uses (idea from Google's Career Dreamer).

The rules version needs no model: your current job, up to three transferable skills, and the
first core skill you are building. With Gemini, the same facts are rewritten more naturally; the
answer is kept only if it names at least one of those skills and stays short, otherwise the rules
version is used. Only skill and role names reach the model, never CV text. Answers are cached per
set of facts, so opening a page again does not call the model again.
"""

from functools import lru_cache

from app.config import get_settings
from app.llm import generate_json
from app.reference import Reference
from app.services.matching import effective_skills, fit_and_gap

MAX_SKILLS = 3
MAX_CHARS = 320
LANGUAGES = {"en": "English", "ms": "Bahasa Malaysia", "zh": "Simplified Chinese"}

PROMPT = """Write a career identity statement: one or two sentences, first person, that a person can
say at the start of an interview for the role below. Use ONLY these facts; do not invent jobs,
years, employers, numbers or skills.
Target role: {target}
Current or most recent job: {current}
Skills they already have that this role uses: {have}
Core skill they are building next: {building}
Write in {language}, under {chars} characters. Reply as JSON: {{"statement": "..."}}"""


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def facts(ref: Reference, profile: dict, role_id: str) -> dict:
    role = ref.roles[role_id]
    _, covered, missing = fit_and_gap(role, effective_skills(ref, profile))
    have = [ref.skills[rs["skill_id"]]["name"] for rs in sorted(covered, key=lambda rs: -rs["weight"])[:MAX_SKILLS]]
    core = [ref.skills[rs["skill_id"]]["name"] for rs in missing if rs["weight"] == 3]
    current = ref.roles.get(profile.get("current_role_id") or "", {}).get("title")
    return {"target": role["title"], "current": current, "have": have, "building": core[0] if core else None}


def rules_statement(f: dict) -> str:
    who = f"I'm a {f['current'].lower()}" if f["current"] else "I'm starting out"
    if not f["have"]:
        start = f"{who} moving into work as a {f['target'].lower()}."
    else:
        skills = _join(f["have"])
        start = f"{who} who already brings {skills}, skills a {f['target'].lower()} uses every day."
    return start + (f" I'm building {f['building']} next." if f["building"] else "")


@lru_cache(maxsize=512)
def _model_statement(target: str, current: str | None, have: tuple[str, ...], building: str | None,
                     language: str) -> str | None:
    try:
        raw = generate_json(PROMPT.format(target=target, current=current or "none yet (student or graduate)",
                                          have=", ".join(have) or "none yet", building=building or "none",
                                          language=LANGUAGES.get(language, "English"), chars=MAX_CHARS))
        text = " ".join(str(raw["statement"]).split())
    except Exception:
        return None
    names_a_skill = any(s.lower() in text.lower() for s in have)  # checked in English, where names match
    if not text or len(text) > MAX_CHARS or (language == "en" and have and not names_a_skill):
        return None  # off the facts: use the rules version
    return text


def statement(ref: Reference, profile: dict, role_id: str, language: str = "en", use_model: bool = True) -> dict:
    f = facts(ref, profile, role_id)
    text, mode = None, "rules"
    if use_model and get_settings().llm_mode == "gemini":
        text = _model_statement(f["target"], f["current"], tuple(f["have"]), f["building"], language)
        mode = "gemini" if text else "rules"
    return {"role_id": role_id, "statement": text or rules_statement(f), "mode": mode, "facts": f}
