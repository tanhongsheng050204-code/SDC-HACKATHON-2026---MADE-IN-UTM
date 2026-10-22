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
    store.add_feedback("coach", None, True, "clear", None, None, "en")
    store.add_feedback("problem", None, None, None, "chart empty", "tree", None)
    assert {"target": "coach", "helpful": True, "count": 1} in store.feedback_totals()
    assert store.list_feedback(5)[0]["target"] in ("coach", "problem")
    day = store.malaysia_day()
    with store._connect() as conn:
        conn.execute("DELETE FROM usage_counts WHERE event=?", ("test_event",))
    store.count_usage("test_event")
    store.count_usage("test_event")
    assert {"event": "test_event", "day": day, "count": 2} in store.usage_since(day)
