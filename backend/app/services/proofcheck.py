"""Proof checks: three multiple-choice questions that prove one level of one skill.

Gemini writes fresh questions for each attempt. The server keeps the answer key and grades; the
browser only ever sees the questions until it has submitted. The prompt carries the skill and the
level only, never anything about the person. With no model available the check is simply
unavailable; nothing else in the app depends on it.
"""

import secrets

from app.llm import generate_json
from app.reference import Reference

QUESTIONS = 3
STARTS_PER_HOUR = 10  # per profile, demos included: each start is a paid model call
PASS_MARK = 2
OPTIONS = 4
TIMEOUT_SECONDS = 45  # writing three questions takes a newer model ~15 s; leave headroom
LANGUAGES = {"en": "English", "ms": "Bahasa Malaysia", "zh": "Simplified Chinese"}

PROMPT = """Write {n} multiple-choice questions that test whether someone has the skill below at the
stated level. Each question is practical and workplace-based, has exactly {k} options and exactly one
correct option, and can be answered without looking anything up. Write them in {language}.
Return JSON: {{"questions": [{{"prompt": "...", "options": ["...", "...", "...", "..."], "answer": 0,
"explanation": "one sentence on why the answer is right"}}]}} where "answer" is the index of the
correct option.

Skill: {skill}
Level: {level_name}: {level_description}"""


class Unavailable(Exception):
    pass


def _valid(q) -> bool:
    if not isinstance(q, dict):
        return False
    options = q.get("options")
    prompt = q.get("prompt")
    if not (isinstance(prompt, str) and prompt.strip() and len(prompt) <= 400):
        return False
    if not (isinstance(options, list) and len(options) == OPTIONS
            and all(isinstance(o, str) and o.strip() for o in options)
            and len({o.strip().casefold() for o in options}) == OPTIONS):
        return False
    answer = q.get("answer")
    return isinstance(answer, int) and not isinstance(answer, bool) and 0 <= answer < OPTIONS


def generate(ref: Reference, skill_id: str, level: int, language: str = "en") -> list[dict]:
    """Three checked questions with their answers. Raises Unavailable if the model can't help."""
    spec = next(lv for lv in ref.skill_levels if lv["level"] == level)
    prompt = PROMPT.format(n=QUESTIONS, k=OPTIONS, language=LANGUAGES.get(language, "English"),
                           skill=ref.skills[skill_id]["name"], level_name=spec["name"],
                           level_description=spec["description"])
    for _ in range(2):  # one retry when the model returns too few usable questions
        try:
            raw = generate_json(prompt, timeout_seconds=TIMEOUT_SECONDS)
        except Exception:
            continue
        items = raw.get("questions") if isinstance(raw, dict) else None
        good = [q for q in (items or []) if _valid(q)]
        if len(good) >= QUESTIONS:
            return [_shuffled(q) for q in good[:QUESTIONS]]
    raise Unavailable("Proof checks are unavailable right now")


def _shuffled(q: dict) -> dict:
    """Shuffle the options: models tend to put the right answer in a predictable place."""
    order = list(range(OPTIONS))
    secrets.SystemRandom().shuffle(order)
    return {"prompt": q["prompt"].strip(), "options": [q["options"][i].strip() for i in order],
            "answer": order.index(q["answer"]), "explanation": str(q.get("explanation") or "").strip()}


def grade(questions: list[dict], answers: list[int]) -> tuple[int, bool]:
    correct = sum(1 for q, a in zip(questions, answers) if a == q["answer"])
    return correct, correct >= PASS_MARK
