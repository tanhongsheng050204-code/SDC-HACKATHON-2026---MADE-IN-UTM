import datetime as dt
import os

import pytest

from app import store


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "store.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    store.init_db()
    yield
    get_settings.cache_clear()


def _new_profile() -> dict:
    return store.create_profile(None, "data_entry_clerk", ["excel"], 3)


def test_migrations_create_new_tables(db):
    profile = _new_profile()
    assert profile["user_id"] is None
    assert profile["is_demo"] is False
    assert profile["preferences"] == {}
    assert profile["skill_levels"] == {}


def test_init_db_is_idempotent(db):
    store.init_db()
    with store._connect() as conn:
        version = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()["v"]
    assert version == store.SCHEMA_VERSION


def test_skill_level_keeps_the_highest(db):
    pid = _new_profile()["id"]
    store.set_skill_level(pid, "sql", 2)
    store.set_skill_level(pid, "sql", 1)
    assert store.get_profile(pid)["skill_levels"] == {"sql": 2}


def test_preferences_round_trip(db):
    pid = _new_profile()["id"]
    store.set_preferences(pid, {"people": 0.5})
    assert store.get_profile(pid)["preferences"] == {"people": 0.5}


def test_deleting_profile_removes_progress(db):
    pid = _new_profile()["id"]
    store.set_skill_level(pid, "sql", 1)
    store.delete_profile(pid)
    with store._connect() as conn:
        left = conn.execute("SELECT COUNT(*) AS n FROM skill_progress WHERE profile_id=?", (pid,)).fetchone()["n"]
    assert left == 0


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs TEST_DATABASE_URL (Postgres)")
def test_postgres_round_trip(monkeypatch):
    """Every kind of query the app makes, on Postgres (runs in CI against a postgres service)."""
    monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        store.init_db()
        store.init_db()  # idempotent
        pid = store.create_profile(None, "data_entry_clerk", ["excel"], 3, audience="worker")["id"]
        store.set_skill_level(pid, "sql", 1)
        store.set_skill_level(pid, "sql", 2)
        store.set_preferences(pid, {"people": 0.5})
        profile = store.get_profile(pid)
        assert profile["skill_levels"] == {"sql": 2} and profile["preferences"] == {"people": 0.5}
        assert profile["audience"] == "worker" and profile["is_demo"] is False

        store.attach_user(pid, "pg-user")
        assert store.profile_for_user("pg-user")["id"] == pid
        check = store.create_check(pid, "sql", 3, [{"prompt": "?", "options": ["a", "b", "c", "d"], "answer": 0}])
        assert store.attempted_today(pid, "sql", 3)
        assert store.submit_check(check, 2, True) and not store.submit_check(check, 2, True)
        store.save_survey(pid, [{"card_id": "card-care_worker-2", "answer": "like"}])

        snapshot = {"snapshot_id": f"pg-test-{pid[:8]}", "imported": "2099-01-01", "signals": []}
        store.save_snapshot(snapshot, "pending")
        assert any(s["snapshot_id"] == snapshot["snapshot_id"] for s in store.list_snapshots("pending"))
        store.decide_snapshot(snapshot["snapshot_id"], "rejected", "CI", snapshot, "test")
        assert store.get_snapshot(snapshot["snapshot_id"])["state"] == "rejected"

        assert store.delete_profile(pid)
        assert store.get_profile(pid) is None
        with store._connect() as conn:
            left = conn.execute("SELECT COUNT(*) AS n FROM skill_progress WHERE profile_id=?", (pid,)).fetchone()["n"]
        assert left == 0  # cascade
        # Supabase serves the public schema over its REST API with a public key: every app table
        # must have row-level security on (no policies = closed to everyone but the backend).
        with store._connect() as conn:
            open_tables = conn.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity").fetchall()
        assert [r["tablename"] for r in open_tables] == []
    finally:
        get_settings.cache_clear()


def test_evidence_round_trip_and_latest_approved_per_subject(db):
    store.save_evidence("ev-1", "role", "data_analyst", {"n": 1})
    store.save_evidence("ev-2", "role", "data_analyst", {"n": 2})
    store.save_evidence("ev-3", "role", "ux_designer", {"n": 3})
    assert [e["id"] for e in store.list_evidence("pending")] == ["ev-3", "ev-2", "ev-1"]  # newest first
    store.decide_evidence("ev-1", "approved", "Team Reviewer", {"n": 1, "ok": True})
    store.decide_evidence("ev-2", "approved", "Team Reviewer", {"n": 2, "ok": True})
    store.decide_evidence("ev-3", "rejected", "Team Reviewer", {"n": 3}, "quotes did not match")
    latest = store.latest_approved_evidence("role")
    assert latest == {"data_analyst": {"n": 2, "ok": True}}  # ev-2 decided last; rejected ignored
    got = store.get_evidence("ev-3")
    assert got["state"] == "rejected" and got["reason"] == "quotes did not match" and got["subject"] == "ux_designer"
    assert store.get_evidence("nope") is None


def _age(profile_id: str, hours: float) -> None:
    old = (dt.datetime.now(dt.UTC) - dt.timedelta(hours=hours)).isoformat(timespec="seconds")
    with store._connect() as conn:
        conn.execute("UPDATE profiles SET updated_at=? WHERE id=?", (old, profile_id))


def test_old_demo_copies_are_purged_but_real_profiles_stay(db):
    stale_demo = store.create_profile("Aisyah (demo)", "data_entry_clerk", ["excel"], is_demo=True)["id"]
    fresh_demo = store.create_profile("Aisyah (demo)", "data_entry_clerk", ["excel"], is_demo=True)["id"]
    anonymous = store.create_profile(None, "data_entry_clerk", ["excel"])["id"]
    owned = store.create_profile("Siti", "data_entry_clerk", ["excel"])["id"]
    store.attach_user(owned, "user-1")
    for pid in (stale_demo, anonymous, owned):
        _age(pid, 48)
    _age(fresh_demo, 2)
    assert store.purge_stale() == {"demo": 1, "anonymous": 0}
    assert store.get_profile(stale_demo) is None
    assert all(store.get_profile(p) for p in (fresh_demo, anonymous, owned))
    _age(anonymous, 24 * 31)
    _age(owned, 24 * 400)
    assert store.purge_stale() == {"demo": 0, "anonymous": 1}
    assert store.get_profile(owned) is not None  # a profile saved to an account is never purged
