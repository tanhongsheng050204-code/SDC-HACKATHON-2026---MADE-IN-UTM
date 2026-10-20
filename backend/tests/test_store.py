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
    monkeypatch.setenv("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        store.init_db()
        pid = _new_profile()["id"]
        store.set_skill_level(pid, "sql", 1)
        assert store.get_profile(pid)["skill_levels"] == {"sql": 1}
        assert store.delete_profile(pid)
        assert store.get_profile(pid) is None
    finally:
        get_settings.cache_clear()
