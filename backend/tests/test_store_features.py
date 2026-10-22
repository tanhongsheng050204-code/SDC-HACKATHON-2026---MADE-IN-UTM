"""Store functions added for progress, data rights, feedback, email and classes, on SQLite and, when
TEST_DATABASE_URL is set (CI), on Postgres too."""
import os

import pytest

from app import store


@pytest.fixture(params=["sqlite", "postgres"])
def anydb(request, tmp_path, monkeypatch):
    from app.config import get_settings

    if request.param == "postgres":
        if not os.environ.get("TEST_DATABASE_URL"):
            pytest.skip("needs TEST_DATABASE_URL (Postgres)")
        monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    else:
        monkeypatch.setenv("DATABASE_URL", "")
        monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "store.db"))
    get_settings.cache_clear()
    store.init_db()
    yield request.param
    store.close_pools()
    get_settings.cache_clear()


def _profile() -> str:
    return store.create_profile(None, "data_entry_clerk", ["excel"], 3)["id"]


def _count(table: str, pid: str) -> int:
    with store._connect() as conn:
        return conn.execute(f"SELECT COUNT(*) AS n FROM {table} WHERE profile_id=?", (pid,)).fetchone()["n"]


def test_plan_and_progress_events(anydb):
    pid = _profile()
    profile = store.set_plan(pid, "2027-06-30", 6)
    assert profile["target_date"] == "2027-06-30" and profile["weekly_hours"] == 6
    store.add_event(pid, "destination_set", "data_analyst", None, "data_analyst", 0.25)
    store.add_event(pid, "skill_proven", "sql", 2, "data_analyst", 0.4)
    events = store.list_events(pid)
    assert [(e["kind"], e["detail"], e["readiness"]) for e in events] == [("destination_set", None, 0.25), ("skill_proven", 2, 0.4)]
    assert store.set_plan("missing", None, None) is None
    store.delete_profile(pid)
    assert _count("progress_events", pid) == 0  # cascade


def test_consents_and_export_rows(anydb):
    pid = _profile()
    store.add_consent(pid, "profile_storage", "2026-10-22")
    store.add_consent(pid, "email_digest", "2026-10-22", given=False)
    store.add_event(pid, "course_finished", "khan_statistics", None, "data_analyst", 0.3)
    rows = store.export_rows(pid)
    assert [(c["kind"], c["given"]) for c in rows["consents"]] == [("profile_storage", True), ("email_digest", False)]
    assert rows["progress_events"][0]["subject"] == "khan_statistics"
    store.delete_profile(pid)
    assert all(v == [] for v in store.export_rows(pid).values())


def test_feedback_and_usage_counts(anydb):
    def coach_yes():  # the Postgres database is shared between runs, so compare before and after
        return next((t["count"] for t in store.feedback_totals() if t["target"] == "coach" and t["helpful"] is True), 0)
    before = coach_yes()
    store.add_feedback("coach", None, True, "clear", None, None, "en")
    store.add_feedback("problem", None, None, None, "chart empty", "tree", None)
    assert coach_yes() == before + 1
    assert store.list_feedback(5)[0]["target"] in ("coach", "problem")
    day = store.malaysia_day()
    with store._connect() as conn:
        conn.execute("DELETE FROM usage_counts WHERE event=?", ("test_event",))
    store.count_usage("test_event")
    store.count_usage("test_event")
    assert {"event": "test_event", "day": day, "count": 2} in store.usage_since(day)


def test_email_settings_and_sent_jobs(anydb):
    pid = _profile()
    store.save_email_settings(pid, "user-1", "a@b.my", True, "instant", "selangor", "ms")
    store.save_email_settings(pid, "user-1", "a@b.my", True, "weekly", "johor", "ms")  # update in place
    saved = store.get_email_settings(pid)
    assert (saved["digest"], saved["alerts"], saved["state"]) == (True, "weekly", "johor")
    assert any(s["profile_id"] == pid for s in store.list_email_settings())
    store.add_sent_jobs(pid, ["k1", "k2"])
    store.add_sent_jobs(pid, ["k2", "k3"])  # already sent: ignored
    assert store.sent_job_keys(pid) == {"k1", "k2", "k3"}
    store.mark_emailed(pid, "last_digest_at")
    assert store.get_email_settings(pid)["last_digest_at"]
    rows = store.export_rows(pid)
    assert rows["email_settings"][0]["email"] == "a@b.my" and len(rows["emailed_job_ads"]) == 3
    store.delete_profile(pid)
    assert store.get_email_settings(pid) is None and store.sent_job_keys(pid) == set()


def test_counsellors_classes_and_members(anydb):
    import uuid
    teacher = f"teacher-{uuid.uuid4().hex[:8]}"  # the Postgres database is shared between runs
    store.request_counsellor(teacher, "t@school.my", "Puan Aminah", "KV Shah Alam")
    assert store.get_counsellor(teacher)["status"] == "pending"
    assert store.decide_counsellor(teacher, "approved", "Admin")
    klass = store.create_class(teacher, "DKM 2")
    assert store.class_by_code(klass["code"].lower())["id"] == klass["id"]
    pid = _profile()
    store.join_class(klass["id"], pid)
    store.join_class(klass["id"], pid)  # joining twice changes nothing
    assert store.member_ids(klass["id"]) == [pid]
    assert store.classes_for(teacher)[0]["members"] == 1
    assert store.memberships(pid)[0]["organisation"] == "KV Shah Alam"
    assert store.leave_class(klass["id"], pid) and not store.leave_class(klass["id"], pid)
    store.join_class(klass["id"], pid)
    store.delete_profile(pid)
    assert store.member_ids(klass["id"]) == []
    store.delete_class(klass["id"])
    assert store.get_class(klass["id"]) is None
