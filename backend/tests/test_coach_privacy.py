"""The coach removes personal details from a question before any AI reads it, and says what it removed."""
from app.reference import get_reference
from app.services import coach

PROFILE = {"display_name": "Aisyah (demo)", "skills": ["excel", "data_entry"], "current_role_id": "data_entry_clerk",
           "experience_years": 3, "completed_courses": [], "audience": "worker", "preferences": {}, "target_role_id": None}


def test_phone_email_and_own_name_are_removed():
    clean, removed = coach.clean_question("I'm Aisyah, call 012-345 6789 or aisyah@mail.my. Which job suits me?", PROFILE)
    assert "Aisyah" not in clean and "012" not in clean and "@" not in clean
    assert removed == {"NAME": 1, "PHONE": 1, "EMAIL": 1}


def test_a_name_given_in_the_question_is_removed():
    clean, removed = coach.clean_question("My name is Tan Wei Ming. Is data entry safe?", {"display_name": None})
    assert "Tan" not in clean and "Wei" not in clean and removed.get("NAME", 0) >= 1
    assert "data entry" in clean


def test_a_plain_question_removes_nothing():
    _, removed = coach.clean_question("Which role suits me if I hate shift work?", PROFILE)
    assert removed == {}


def test_the_ai_only_sees_the_cleaned_question(monkeypatch):
    seen = {}
    monkeypatch.setattr(coach, "_llm_available", lambda: True)
    monkeypatch.setattr(coach, "generate_json", lambda prompt: seen.setdefault("prompt", prompt) and {"answer": "OK", "proposal": None})
    result = coach.answer(get_reference(), PROFILE, "I'm Aisyah, 012-345 6789. Which job suits me?")
    assert "012-345" not in seen["prompt"] and "Aisyah" not in seen["prompt"].split("QUESTION")[-1]
    assert result["removed"] == {"NAME": 1, "PHONE": 1}
