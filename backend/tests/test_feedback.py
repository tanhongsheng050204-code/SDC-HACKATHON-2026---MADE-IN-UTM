"""Feedback ("Was this helpful?", "Report a problem") and anonymous usage counts, shown on Admin."""
from app import store

ADMIN = {"X-Admin-Token": "test-admin-token"}


def test_helpful_feedback_is_stored_without_a_profile_and_scrubbed(client):
    r = client.post("/api/feedback", json={"target": "coach", "helpful": False, "reason": "wrong",
                                           "note": "Call me on 012-345 6789, the hours were wrong", "language": "ms"})
    assert r.status_code == 204
    client.post("/api/feedback", json={"target": "role_advice", "subject": "data_analyst", "helpful": True})
    body = client.get("/api/admin/feedback", headers=ADMIN).json()
    coach = next(f for f in body["recent"] if f["target"] == "coach")
    assert "012" not in coach["note"] and coach["reason"] == "wrong" and coach["helpful"] is False
    assert "profile_id" not in coach and set(coach) == {"target", "subject", "helpful", "reason", "note", "screen", "language", "day"}
    assert {"target": "role_advice", "helpful": True, "count": 1} in body["totals"]


def test_feedback_rejects_unknown_fields_reasons_and_roles(client):
    assert client.post("/api/feedback", json={"target": "coach", "helpful": True, "profile_id": "x"}).status_code == 422
    assert client.post("/api/feedback", json={"target": "coach", "helpful": True, "reason": "angry"}).status_code == 422
    assert client.post("/api/feedback", json={"target": "role_advice", "subject": "astronaut", "helpful": True}).status_code == 422


def test_report_a_problem(client):
    r = client.post("/api/feedback/problem", json={"note": "The chart on aisyah@mail.my's pathway is empty", "screen": "tree"})
    assert r.status_code == 204
    problem = client.get("/api/admin/feedback", headers=ADMIN).json()["recent"][0]
    assert problem["target"] == "problem" and problem["screen"] == "tree" and "@" not in problem["note"]
    assert client.post("/api/feedback/problem", json={"note": "x"}).status_code == 422


def test_usage_is_counted_per_day_without_ids(client):
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    client.post("/api/profiles/demo/clerk")
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": True})
    client.post(f"/api/profiles/{pid}/cards", json={"role_id": "data_analyst"})
    client.post("/api/coach", json={"profile_id": pid, "question": "How long will the plan take?"})
    for _ in range(2):
        assert client.post("/api/usage", json={"event": "onboarding_started"}).status_code == 204
    assert client.post("/api/usage", json={"event": "anything_else"}).status_code == 422
    body = client.get("/api/admin/usage?days=7", headers=ADMIN).json()
    assert body["totals"] == {"onboarding_started": 2, "onboarding_finished": 1, "demo_opened": 1, "destination_set": 1,
                              "course_finished": 1, "card_created": 1, "coach_asked": 1}
    assert set(body["days"][0]) == {"event", "day", "count"}


def test_admin_views_need_the_token(client):
    assert client.get("/api/admin/feedback").status_code == 401
    assert client.get("/api/admin/usage", headers={"X-Admin-Token": "wrong"}).status_code == 401
