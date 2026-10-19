"""Profile store on SQLite. Profiles are reached only by their random UUID; there is no listing."""

import datetime as dt
import json
import sqlite3
import uuid
from contextlib import contextmanager

from app.config import get_settings

SCHEMA_VERSION = 2
_MIGRATIONS = {
    1: """
    CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT,
        current_role_id TEXT,
        skills TEXT NOT NULL DEFAULT '[]',
        interests TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS profiles_updated_at ON profiles(updated_at);
    """,
    2: "ALTER TABLE profiles ADD COLUMN experience_years INTEGER;",
}


@contextmanager
def _connect():
    conn = sqlite3.connect(get_settings().database_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
        row = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
        current = row["v"] or 0
        for version in range(current + 1, SCHEMA_VERSION + 1):
            conn.executescript(_MIGRATIONS[version])
            conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))


def _now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def _row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "display_name": row["display_name"],
        "current_role_id": row["current_role_id"],
        "skills": json.loads(row["skills"]),
        "interests": json.loads(row["interests"]),
        "experience_years": row["experience_years"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_profile(display_name, current_role_id, skills, interests, experience_years=None) -> dict:
    profile_id, now = str(uuid.uuid4()), _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO profiles (id, display_name, current_role_id, skills, interests, "
            "experience_years, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (profile_id, display_name, current_role_id, json.dumps(skills),
             json.dumps(interests), experience_years, now, now),
        )
    return get_profile(profile_id)


def update_profile(profile_id, display_name, current_role_id, skills, interests,
                   experience_years=None) -> dict | None:
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE profiles SET display_name=?, current_role_id=?, skills=?, interests=?, "
            "experience_years=?, updated_at=? WHERE id=?",
            (display_name, current_role_id, json.dumps(skills), json.dumps(interests),
             experience_years, _now(), profile_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_profile(profile_id)


def get_profile(profile_id: str) -> dict | None:
    with _connect() as conn:
        return _row(conn.execute("SELECT * FROM profiles WHERE id=?", (profile_id,)).fetchone())


def delete_profile(profile_id: str) -> bool:
    with _connect() as conn:
        return conn.execute("DELETE FROM profiles WHERE id=?", (profile_id,)).rowcount > 0


def purge_older_than(days: int = 30) -> int:
    cutoff = (dt.datetime.now(dt.UTC) - dt.timedelta(days=days)).isoformat(timespec="seconds")
    with _connect() as conn:
        return conn.execute("DELETE FROM profiles WHERE updated_at < ?", (cutoff,)).rowcount
