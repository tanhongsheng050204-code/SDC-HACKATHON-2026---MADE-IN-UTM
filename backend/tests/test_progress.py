"""Progress timeline: dated events, a target date and weekly hours, and on track / ahead / behind."""
import datetime as dt

from app import store
from app.services import progress


def _start(client):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    return pid


def test_destination_and_courses_are_dated_events_with_readiness(client):
    pid = _start(client)
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": True})
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": True})  # no change
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": False})
    events = store.list_events(pid)
    assert [e["kind"] for e in events] == ["destination_set", "course_finished", "course_unfinished"]
    assert events[1]["readiness"] > events[0]["readiness"] == events[2]["readiness"]
    body = client.get(f"/api/profiles/{pid}/progress").json()
    assert [p["kind"] for p in body["points"]] == ["destination_set", "course_finished", "course_unfinished"]
    assert body["status"] is None  # no target date yet


def test_plan_validates_dates_and_hours(client):
    pid = _start(client)
    today = progress.today()
    assert client.put(f"/api/profiles/{pid}/plan", json={"target_date": today.isoformat()}).status_code == 422
    assert client.put(f"/api/profiles/{pid}/plan", json={"weekly_hours": 0}).status_code == 422
    assert client.put(f"/api/profiles/{pid}/plan", json={"weekly_hours": 41}).status_code == 422
    assert client.put(f"/api/profiles/{pid}/plan", json={"age": 30}).status_code == 422
    ok = client.put(f"/api/profiles/{pid}/plan", json={"target_date": (today + dt.timedelta(days=180)).isoformat(),
                                                       "weekly_hours": 6})
    assert ok.status_code == 200 and ok.json()["weekly_hours"] == 6


def test_on_track_right_after_setting_a_plan_and_a_finish_estimate(client):
    pid = _start(client)
    today = progress.today()
    client.put(f"/api/profiles/{pid}/plan", json={"target_date": (today + dt.timedelta(days=200)).isoformat(),
                                                  "weekly_hours": 10})
    body = client.get(f"/api/profiles/{pid}/progress").json()
    assert body["status"] == "on_track" and body["expected"] == body["start"]["readiness"]
    weeks = -(-body["hours_left"] // 10)
    assert body["finish_estimate"] == (today + dt.timedelta(weeks=weeks)).isoformat()


def test_behind_when_time_passed_without_progress_and_ahead_after_a_big_course(client):
    pid = _start(client)
    today = progress.today()
    client.put(f"/api/profiles/{pid}/plan", json={"target_date": (today + dt.timedelta(days=30)).isoformat()})
    ready = store.list_events(pid)[-1]["readiness"]
    long_ago = (dt.datetime.now(dt.UTC) - dt.timedelta(days=60)).isoformat(timespec="seconds")
    store.add_event(pid, "plan_set", None, None, "data_analyst", ready, at=long_ago)
    # The latest start wins, so move the real one out of the way by re-dating it too.
    with store._connect() as conn:
        conn.execute("UPDATE progress_events SET created_at=? WHERE profile_id=?", (long_ago, pid))
    assert client.get(f"/api/profiles/{pid}/progress").json()["status"] == "behind"

    pid2 = _start(client)
    client.put(f"/api/profiles/{pid2}/plan", json={"target_date": (today + dt.timedelta(days=365)).isoformat()})
    client.post(f"/api/profiles/{pid2}/complete", json={"course_id": "google_data_analytics", "done": True})
    assert client.get(f"/api/profiles/{pid2}/progress").json()["status"] == "ahead"


def test_expected_line_and_labels():
    start, target = dt.date(2026, 1, 1), dt.date(2026, 1, 11)
    assert progress.expected_by(start, 0.5, target, dt.date(2026, 1, 6)) == 0.75
    assert progress.expected_by(start, 0.5, target, dt.date(2027, 1, 1)) == 1.0
    assert progress.status_for(0.75, 0.75) == "on_track"
    assert progress.status_for(0.81, 0.75) == "ahead"
    assert progress.status_for(0.69, 0.75) == "behind"
    assert progress.status_for(1.0, 0.2) == "done"


def test_course_hours_finished_this_week(client):
    pid = _start(client)
    client.put(f"/api/profiles/{pid}/plan", json={"weekly_hours": 5})
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": True})
    week = client.get(f"/api/profiles/{pid}/progress").json()["week"]
    assert week["hours_done"] == 30 and week["target"] == 5


def test_proven_skill_is_an_event(client):
    pid = _start(client)
    store.set_skill_level(pid, "sql", 1)
    progress.record(__import__("app.reference", fromlist=["get_reference"]).get_reference(), pid, "skill_proven", "sql", 1)
    assert store.list_events(pid)[-1]["kind"] == "skill_proven"


def test_no_destination_means_no_status(client):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    body = client.get(f"/api/profiles/{pid}/progress").json()
    assert body["role_id"] is None and body["status"] is None and body["points"] == []


def test_events_go_with_the_profile(client):
    pid = _start(client)
    assert client.delete(f"/api/profiles/{pid}").status_code == 204
    assert store.list_events(pid) == []
