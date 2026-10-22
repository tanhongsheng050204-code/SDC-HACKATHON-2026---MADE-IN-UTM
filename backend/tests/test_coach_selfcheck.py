"""The coach checks an AI answer against its sources: one rewrite for unsupported sentences, then
anything still unsupported is removed. Offline answers are grounded already and never revised."""
from app.reference import get_reference
from app.services import coach

PROFILE = {"display_name": None, "skills": ["excel", "data_entry"], "current_role_id": "data_entry_clerk",
           "experience_years": 3, "completed_courses": [], "audience": "worker", "preferences": {}, "target_role_id": None}
GOOD = "Your top roles under the Baseline scenario are listed [SOURCE-1]."
BAD = "You will earn RM 9,999 a month as a famous astronaut."


def _fake(monkeypatch, replies):
    prompts = []

    def fake(prompt):
        prompts.append(prompt)
        return replies[len(prompts) - 1]

    monkeypatch.setattr(coach, "_llm_available", lambda: True)
    monkeypatch.setattr(coach, "generate_json", fake)
    return prompts


def test_revision_fixes_the_unsupported_sentence(monkeypatch):
    prompts = _fake(monkeypatch, [{"answer": f"{GOOD} {BAD}", "proposal": None}, {"answer": GOOD}])
    result = coach.answer(get_reference(), PROFILE, "Call 012-345 6789: which job suits me?")
    assert len(prompts) == 2 and "sentences\n2 are not supported" in prompts[1]
    assert "012-345" not in prompts[1] and BAD in prompts[1]
    assert result["answer"] == GOOD and result["mode"] == "gemini"
    assert result["revised"] is True and result["dropped"] == 0 and result["grounding"]["all_supported"]


def test_failed_revision_drops_the_sentence(monkeypatch):
    prompts = _fake(monkeypatch, [{"answer": f"{GOOD} {BAD}", "proposal": None}, {"answer": f"{GOOD} {BAD}"}])
    result = coach.answer(get_reference(), PROFILE, "Which job suits me?")
    assert len(prompts) == 2
    assert result["answer"] == GOOD and "astronaut" not in result["answer"]
    assert result["revised"] is True and result["dropped"] == 1 and result["grounding"]["all_supported"]


def test_nothing_supported_falls_back_to_the_rules_answer(monkeypatch):
    _fake(monkeypatch, [{"answer": BAD, "proposal": None}, {"answer": BAD}])
    result = coach.answer(get_reference(), PROFILE, "Which job suits me?")
    assert result["mode"] == "offline" and result["answer"].strip() and "astronaut" not in result["answer"]
    assert result["grounding"]["all_supported"] and result["dropped"] == 1


def test_no_revision_call_when_everything_is_supported(monkeypatch):
    prompts = _fake(monkeypatch, [{"answer": GOOD, "proposal": None}])
    result = coach.answer(get_reference(), PROFILE, "Which job suits me?")
    assert len(prompts) == 1 and result["answer"] == GOOD
    assert result["revised"] is False and result["dropped"] == 0


def test_offline_answers_are_not_revised(monkeypatch):
    monkeypatch.setattr(coach, "_llm_available", lambda: False)
    monkeypatch.setattr(coach, "generate_json", lambda prompt: (_ for _ in ()).throw(AssertionError("no AI call")))
    result = coach.answer(get_reference(), PROFILE, "How long will the plan take?")
    assert result["mode"] == "offline" and result["revised"] is False and result["dropped"] == 0
