"""Ask Laluan: follow-ups, roles named in any language, comparisons, the journey, and actions."""

from app.services import coach


def _ask(client, pid, question, **extra):
    return client.post("/api/coach", json={"profile_id": pid, "question": question, **extra}).json()


def _clerk(client) -> str:
    return client.post("/api/profiles/demo/clerk").json()["id"]


def test_a_follow_up_stays_on_the_role_just_discussed(client):
    pid = _clerk(client)
    first = _ask(client, pid, "Tell me about the data analyst role")
    assert first["focus_role_id"] == "data_analyst"
    follow = _ask(client, pid, "And how long would it take?",
                  history=[{"question": "Tell me about the data analyst role", "answer": first["answer"]}])
    assert follow["focus_role_id"] == "data_analyst"
    assert "Data analyst" in follow["answer"] and "hours" in follow["answer"]
    assert follow["grounding"]["all_supported"]


def test_roles_named_in_bm_or_chinese_are_understood(client):
    pid = _clerk(client)
    assert _ask(client, pid, "Berapa lama untuk menjadi Penganalisis data?")["focus_role_id"] == "data_analyst"
    assert _ask(client, pid, "成为数据分析师要多久？")["focus_role_id"] == "data_analyst"


def test_two_named_roles_are_compared_with_both_figures(client):
    pid = _clerk(client)
    reply = _ask(client, pid, "Compare data analyst and UX / UI designer for me")
    assert "UX / UI designer" in reply["answer"] and "Data analyst" in reply["answer"]
    assert {a["value"] for a in reply["actions"] if a["kind"] == "open"} == {"role"}
    assert reply["grounding"]["all_supported"]


def test_next_step_follows_the_journey_and_offers_a_destination(client):
    pid = _clerk(client)
    reply = _ask(client, pid, "What should I do next?")
    assert "next step Explore roles" in reply["answer"]
    kinds = [a["kind"] for a in reply["actions"]]
    assert "target" in kinds and "open" in kinds
    target = next(a for a in reply["actions"] if a["kind"] == "target")
    # An action is only an offer: nothing changed until the person applies it.
    assert client.get(f"/api/profiles/{pid}").json()["target_role_id"] is None
    assert target["label"].startswith("Set ") and target["label"].endswith("as your destination")


def test_app_questions_get_the_guide_and_a_way_in(client):
    pid = _clerk(client)
    reply = _ask(client, pid, "How do I use this app?")
    assert "four steps" in reply["answer"] and reply["actions"]
    radar = _ask(client, pid, "Open the skills radar")
    assert any(a == {"kind": "open", "value": "radar", "role_id": None, "label": "Open Future Skills Radar"}
               for a in radar["actions"])


def test_free_tasks_and_pay_questions_use_their_own_sources(client):
    pid = _clerk(client)
    free = _ask(client, pid, "Which courses are free for the sustainability analyst route?")
    assert "free courses only" in free["answer"] and "ESG and sustainability reporting" in free["answer"]
    job = _ask(client, pid, "Will AI automate my tasks?")
    assert "task by task" in job["answer"] and job["actions"][0]["value"] == "tasks"
    pay = _ask(client, pid, "What is the salary for a data analyst?")
    assert "RM" in pay["answer"] and "not a job offer" in pay["answer"]


def test_model_actions_are_checked_and_other_languages_are_grounded_in_english(client, monkeypatch):
    pid = _clerk(client)
    seen = {}

    def fake_llm(prompt):
        seen["prompt"] = prompt
        return {"answer": "Peranan teratas anda ditunjukkan dahulu.", "answer_en": "Your top roles under the Baseline scenario.",
                "actions": [{"kind": "open", "value": "tree", "role_id": "data_analyst"},
                            {"kind": "open", "value": "admin"}, {"kind": "target", "value": "astronaut"},
                            {"kind": "scenario", "value": "accelerated"}]}

    monkeypatch.setattr(coach, "_llm_available", lambda: True)
    monkeypatch.setattr(coach, "generate_json", fake_llm)
    reply = _ask(client, pid, "Apa peranan terbaik saya?", language="ms", screen="home",
                 history=[{"question": "Call me on 012-345 6789", "answer": "Noted."}])
    assert reply["mode"] == "gemini" and reply["language"] == "ms"
    assert [a["kind"] for a in reply["actions"]] == ["open", "scenario"]
    assert reply["actions"][0] == {"kind": "open", "value": "tree", "role_id": "data_analyst", "label": "Open Pathway for Data analyst"}
    assert reply["proposal"]["value"] == "accelerated"
    assert "Bahasa Malaysia" in seen["prompt"] and "Today" in seen["prompt"]
    assert "012-345" not in seen["prompt"]
    assert reply["grounding"] is not None


def test_history_is_limited(client):
    pid = _clerk(client)
    turns = [{"question": f"q{i}", "answer": "a"} for i in range(9)]
    assert client.post("/api/coach", json={"profile_id": pid, "question": "hello", "history": turns}).status_code == 422
