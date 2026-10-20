"""Proof checks: Gemini writes the questions, the server keeps the answers and grades."""

import pytest

from app import store
from app.services import proofcheck


def _questions(n: int = 3, bad: int = 0) -> dict:
    good = [{"prompt": f"Question {i}: which query sums amounts per vendor?",
             "options": [f"Right {i}", f"Wrong A{i}", f"Wrong B{i}", f"Wrong C{i}"],
             "answer": 0, "explanation": f"Because {i}."} for i in range(n)]
    broken = [{"prompt": "Broken", "options": ["Same", "Same", "Same", "Same"], "answer": 9, "explanation": ""}
              for _ in range(bad)]
    return {"questions": good + broken}


@pytest.fixture
def gemini(monkeypatch):
    """Stand-in for the model: returns queued replies and records every prompt."""
    calls = {"prompts": [], "replies": []}

    def fake(prompt: str):
        calls["prompts"].append(prompt)
        reply = calls["replies"].pop(0) if calls["replies"] else _questions()
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(proofcheck, "generate_json", fake)
    return calls


def _profile(client, skills=("excel", "communication"), name=None) -> str:
    return client.post("/api/profiles", json={"skills": list(skills), "display_name": name}).json()["id"]


def _start(client, pid, skill="excel"):
    return client.post(f"/api/profiles/{pid}/skills/{skill}/checks", json={"language": "en"})


def _submit(client, check_id, pid, answers):
    return client.post(f"/api/checks/{check_id}", json={"profile_id": pid, "answers": answers})


def test_questions_are_sent_without_answers(client, gemini):
    started = _start(client, _profile(client))
    assert started.status_code == 201
    body = started.json()
    assert body["level"] == 1 and body["level_name"] == "Basic" and len(body["questions"]) == 3
    for q in body["questions"]:
        assert set(q) == {"prompt", "options"} and len(q["options"]) == 4


def test_two_of_three_passes_and_fills_the_level(client, gemini):
    pid = _profile(client)
    check = _start(client, pid).json()
    result = _submit(client, check["check_id"], pid, [0, 0, 1]).json()
    assert result["passed"] is True and result["correct"] == 2 and len(result["explanations"]) == 3
    assert client.get(f"/api/profiles/{pid}").json()["skill_levels"] == {"excel": 1}
    assert _start(client, pid).json()["level"] == 2  # next level is open the same day


def test_one_of_three_fails_and_suggests_a_course(client, gemini):
    pid = _profile(client)
    check = _start(client, pid).json()
    result = _submit(client, check["check_id"], pid, [0, 1, 1]).json()
    assert result["passed"] is False and result["correct"] == 1
    assert result["course"]["url"].startswith("http")
    assert client.get(f"/api/profiles/{pid}").json()["skill_levels"] == {}


def test_second_attempt_same_day_is_refused(client, gemini):
    pid = _profile(client)
    check = _start(client, pid).json()
    _submit(client, check["check_id"], pid, [1, 1, 1])
    again = _start(client, pid)
    assert again.status_code == 429 and "tomorrow" in again.json()["detail"]


def test_demo_profiles_can_retry_at_once(client, gemini):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    check = _start(client, pid).json()
    _submit(client, check["check_id"], pid, [1, 1, 1])
    assert _start(client, pid).status_code == 201


def test_unavailable_check_does_not_count_as_an_attempt(client, gemini):
    pid = _profile(client)
    gemini["replies"] = [RuntimeError("timeout"), RuntimeError("timeout")]
    failed = _start(client, pid)
    assert failed.status_code == 503 and "unavailable" in failed.json()["detail"]
    assert _start(client, pid).status_code == 201


def test_attempt_is_graded_once_and_only_for_its_owner(client, gemini):
    pid, other = _profile(client), _profile(client)
    check = _start(client, pid).json()
    assert _submit(client, check["check_id"], other, [0, 0, 0]).status_code == 404
    assert _submit(client, check["check_id"], pid, [0, 0, 0]).json()["passed"] is True
    assert _submit(client, check["check_id"], pid, [0, 0, 0]).status_code == 409
    assert client.get(f"/api/profiles/{pid}").json()["skill_levels"] == {"excel": 1}


def test_malformed_questions_are_dropped(client, gemini):
    gemini["replies"] = [_questions(n=2, bad=2), _questions(n=3)]
    started = _start(client, _profile(client))
    assert started.status_code == 201 and len(started.json()["questions"]) == 3
    assert len(gemini["prompts"]) == 2


def test_locked_skill_and_top_level_are_refused(client, gemini):
    pid = _profile(client, skills=("communication",))
    assert _start(client, pid, "sql").status_code == 409
    for level in (1, 2, 3):
        store.set_skill_level(pid, "communication", level)
    assert _start(client, pid, "communication").status_code == 409
    assert _start(client, pid, "astronaut").status_code == 404


def test_prompt_has_no_profile_details(client, gemini):
    pid = _profile(client, name="Siti Nurhaliza")
    _start(client, pid)
    assert gemini["prompts"] and all("Siti" not in p and "Nurhaliza" not in p for p in gemini["prompts"])
    assert "Spreadsheets" in gemini["prompts"][0] and "Basic" in gemini["prompts"][0]


def test_day_starts_at_midnight_in_malaysia():
    import datetime as dt

    # 01:00 on 21 Oct in Kuala Lumpur is 17:00 on 20 Oct UTC: "today" began at 16:00 UTC on 20 Oct.
    now = dt.datetime(2026, 10, 20, 17, 0, tzinfo=dt.UTC)
    assert store.day_start_utc(now) == "2026-10-20T16:00:00+00:00"


def test_check_starts_are_rate_limited_even_for_demos(client, gemini, monkeypatch):
    monkeypatch.setattr(proofcheck, "STARTS_PER_HOUR", 2)
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    assert _start(client, pid).status_code == 201
    assert _start(client, pid).status_code == 201
    third = _start(client, pid)
    assert third.status_code == 429 and "hour" in third.json()["detail"]
