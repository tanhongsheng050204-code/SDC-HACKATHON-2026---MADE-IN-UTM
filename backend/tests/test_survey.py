"""The survey: cards from the person's matched roles, hidden preferences, a small visible boost."""

from app.reference import get_reference
from app.services import matching, survey

CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk"}


def test_cards_cover_every_dimension_and_several_roles():
    ref = get_reference()
    cards = survey.pick_cards(ref, CLERK)
    assert 8 <= len(cards) <= 10
    assert len({c["id"] for c in cards}) == len(cards)
    assert {d for c in cards for d in c["dims"]} == {d["id"] for d in ref.work_dimensions}
    assert len({r for c in cards for r in c["role_ids"]}) >= 3


def test_likes_and_dislikes_move_preferences():
    ref = get_reference()
    prefs = survey.preferences(ref, [
        {"card_id": "card-customer_service_rep-1", "answer": "like"},     # people +1
        {"card_id": "card-data_analyst-3", "answer": "dislike"},          # people -1, team -1, disliked
    ])
    assert prefs == {"people": 1.0, "team": 1.0}


def test_unconfirmed_other_is_kept_as_note_only():
    ref = get_reference()
    assert survey.preferences(ref, [{"card_id": "card-care_worker-2", "answer": "other", "note": "depends"}]) == {}
    confirmed = survey.preferences(ref, [{"card_id": "card-care_worker-2", "answer": "other",
                                          "note": "I like a team", "dims": {"team": 1}}])
    assert confirmed == {"team": 1.0}


def test_preference_adds_a_visible_small_boost():
    ref = get_reference()
    plain = matching.match(ref, CLERK, "baseline")["roles"]
    people = matching.match(ref, {**CLERK, "preferences": {"people": 1.0, "field": 1.0}}, "baseline")["roles"]
    care = next(r for r in people if r["role_id"] == "care_worker")
    assert 0 < care["why"]["preference_points"] <= survey.PREFERENCE_BOOST
    assert {"dim": "people", "label": "working with people"} in care["why"]["matched_preferences"]
    for role in people:
        why = role["why"]
        assert abs(why["fit_points"] + why["outlook_points"] + why["preference_points"] - role["score"]) < 1e-3
    assert all(r["why"]["preference_points"] == 0 for r in plain)


def test_also_like_lists_roles_outside_top_five():
    ref = get_reference()
    result = matching.match(ref, {**CLERK, "preferences": {"people": 1.0, "shifts": 1.0}}, "baseline")
    ranks = {r["role_id"]: r["rank"] for r in result["roles"]}
    assert result["also_like"], "expected at least one suggestion"
    assert len(result["also_like"]) <= 3
    for role in result["also_like"]:
        assert ranks[role["role_id"]] > 5 and role["preference_match"] >= 0.5 and role["fit"] >= 0.25


def test_survey_with_no_usable_answers_changes_nothing(client):
    pid = client.post("/api/profiles", json={"skills": CLERK["skills"]}).json()["id"]
    before = client.get(f"/api/profiles/{pid}/matches").json()
    answers = [{"card_id": "card-care_worker-2", "answer": "other", "note": "not sure"}]
    result = client.post(f"/api/profiles/{pid}/survey", json={"answers": answers}).json()
    assert result["preferences"] == {} and result["summary"] == [] and result["also_like"] == []
    after = client.get(f"/api/profiles/{pid}/matches").json()
    assert [r["score"] for r in after["roles"]] == [r["score"] for r in before["roles"]]


def test_survey_round_trip_through_the_api(client):
    pid = client.post("/api/profiles", json={"skills": CLERK["skills"]}).json()["id"]
    cards = client.get(f"/api/profiles/{pid}/survey").json()["cards"]
    assert 8 <= len(cards) <= 10 and all(set(c["text"]) == {"en", "ms", "zh"} for c in cards)
    answers = [{"card_id": "card-customer_service_rep-1", "answer": "like"},
               {"card_id": "card-care_worker-1", "answer": "like"}]
    result = client.post(f"/api/profiles/{pid}/survey", json={"answers": answers}).json()
    assert result["preferences"]["people"] == 1.0
    assert any("working with people" in s for s in result["summary"])
    assert client.get(f"/api/profiles/{pid}").json()["preferences"]["people"] == 1.0
    bad = [{"card_id": "card-nope", "answer": "like"}]
    assert client.post(f"/api/profiles/{pid}/survey", json={"answers": bad}).status_code == 422


def test_demo_profiles_come_with_preferences(client):
    for key in ("clerk", "student"):
        pid = client.post(f"/api/profiles/demo/{key}").json()["id"]
        assert client.get(f"/api/profiles/{pid}").json()["preferences"], key
        roles = client.get(f"/api/profiles/{pid}/matches").json()["roles"]
        assert any(r["why"]["preference_points"] > 0 for r in roles), key


def test_interpret_scrubs_before_llm(client, monkeypatch):
    prompts = []

    def fake(prompt):
        prompts.append(prompt)
        return {"dims": {"team": 1}}

    monkeypatch.setattr(survey, "generate_json", fake)
    monkeypatch.setattr(survey, "_llm_available", lambda: True)
    body = {"text": "I like a team, email me at siti@example.com", "language": "en"}
    result = client.post("/api/survey/interpret", json=body).json()
    assert result == {"dims": {"team": 1}, "reading": "You prefer working in a team"}
    assert prompts and "siti@example.com" not in prompts[0]


def test_interpret_offline_uses_keywords(client):
    result = client.post("/api/survey/interpret", json={"text": "I prefer to work alone", "language": "en"}).json()
    assert result["dims"] == {"team": -1}


def test_survey_bank_lists_every_card_for_the_review_kit(client):
    bank = client.get("/api/survey/bank").json()
    assert len(bank["cards"]) == len(get_reference().survey_cards)
    assert {d["id"] for d in bank["dimensions"]} == {"people", "structured", "field", "shifts", "team"}
