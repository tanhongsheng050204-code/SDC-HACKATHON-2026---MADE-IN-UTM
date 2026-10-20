"""Profile store. Profiles are reached only by their random UUID; there is no listing.

Two engines, one code path: SQLite for tests and local runs, Postgres (Supabase) in production
when DATABASE_URL is set, because the free hosts wipe their disks on every restart. SQL here is
written once with `?` placeholders and portable types (TEXT ids, no AUTOINCREMENT); the Postgres
connection translates the placeholders.
"""

import datetime as dt
import json
import secrets
import sqlite3
import uuid
from contextlib import contextmanager

from app.config import get_settings

SCHEMA_VERSION = 8
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
    3: "ALTER TABLE profiles ADD COLUMN completed_courses TEXT NOT NULL DEFAULT '[]';",
    4: """
    CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cards_profile ON cards(profile_id);
    """,
    5: """
    ALTER TABLE profiles ADD COLUMN user_id TEXT;
    ALTER TABLE profiles ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE profiles ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}';
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_user ON profiles(user_id) WHERE user_id IS NOT NULL;
    """,
    6: """
    CREATE TABLE IF NOT EXISTS skill_progress (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        skill_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        proven_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, skill_id)
    );
    CREATE TABLE IF NOT EXISTS skill_checks (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        skill_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        questions TEXT NOT NULL,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        correct INTEGER,
        passed INTEGER
    );
    CREATE INDEX IF NOT EXISTS skill_checks_lookup ON skill_checks(profile_id, skill_id, level);
    """,
    7: """
    CREATE TABLE IF NOT EXISTS survey_responses (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        answer TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, card_id)
    );
    """,
    8: """
    CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        imported TEXT NOT NULL,
        body TEXT NOT NULL,
        decided_by TEXT,
        decided_at TEXT,
        reason TEXT
    );
    """,
}


class _PgConnection:
    """psycopg connection that accepts the `?` placeholders the SQLite code uses."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params=()):
        return self._conn.execute(sql.replace("?", "%s"), params)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


@contextmanager
def _connect():
    settings = get_settings()
    if settings.database_url:
        import psycopg
        from psycopg.rows import dict_row

        conn = _PgConnection(psycopg.connect(settings.database_url, row_factory=dict_row))
    else:
        conn = sqlite3.connect(settings.database_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")  # so deleting a profile deletes its cards
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
            for statement in _MIGRATIONS[version].split(";"):
                if statement.strip():
                    conn.execute(statement)
            conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))


def _now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds")


def _row(row) -> dict | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "display_name": row["display_name"],
        "current_role_id": row["current_role_id"],
        "skills": json.loads(row["skills"]),
        "experience_years": row["experience_years"],
        "completed_courses": json.loads(row["completed_courses"]),
        "user_id": row["user_id"],
        "is_demo": bool(row["is_demo"]),
        "preferences": json.loads(row["preferences"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_profile(display_name, current_role_id, skills, experience_years=None,
                   is_demo: bool = False) -> dict:
    profile_id, now = str(uuid.uuid4()), _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO profiles (id, display_name, current_role_id, skills, interests, "
            "experience_years, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (profile_id, display_name, current_role_id, json.dumps(skills),
             "[]", experience_years, int(is_demo), now, now),
        )
    return get_profile(profile_id)


def update_profile(profile_id, display_name, current_role_id, skills,
                   experience_years=None) -> dict | None:
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE profiles SET display_name=?, current_role_id=?, skills=?, "
            "experience_years=?, updated_at=? WHERE id=?",
            (display_name, current_role_id, json.dumps(skills),
             experience_years, _now(), profile_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_profile(profile_id)


def set_completed(profile_id: str, completed: list[str]) -> dict | None:
    with _connect() as conn:
        cursor = conn.execute("UPDATE profiles SET completed_courses=?, updated_at=? WHERE id=?",
                              (json.dumps(completed), _now(), profile_id))
        if cursor.rowcount == 0:
            return None
    return get_profile(profile_id)


def get_profile(profile_id: str) -> dict | None:
    with _connect() as conn:
        profile = _row(conn.execute("SELECT * FROM profiles WHERE id=?", (profile_id,)).fetchone())
        if profile is not None:
            rows = conn.execute("SELECT skill_id, level FROM skill_progress WHERE profile_id=?",
                                (profile_id,)).fetchall()
            profile["skill_levels"] = {r["skill_id"]: r["level"] for r in rows}
    return profile


def delete_profile(profile_id: str) -> bool:
    with _connect() as conn:
        return conn.execute("DELETE FROM profiles WHERE id=?", (profile_id,)).rowcount > 0


def set_skill_level(profile_id: str, skill_id: str, level: int) -> None:
    """Record a proven level. A lower level never replaces a higher one."""
    with _connect() as conn:
        row = conn.execute("SELECT level FROM skill_progress WHERE profile_id=? AND skill_id=?",
                           (profile_id, skill_id)).fetchone()
        if row is None:
            conn.execute("INSERT INTO skill_progress (profile_id, skill_id, level, proven_at) VALUES (?, ?, ?, ?)",
                         (profile_id, skill_id, level, _now()))
        elif level > row["level"]:
            conn.execute("UPDATE skill_progress SET level=?, proven_at=? WHERE profile_id=? AND skill_id=?",
                         (level, _now(), profile_id, skill_id))
        conn.execute("UPDATE profiles SET updated_at=? WHERE id=?", (_now(), profile_id))


def set_preferences(profile_id: str, prefs: dict[str, float]) -> None:
    with _connect() as conn:
        conn.execute("UPDATE profiles SET preferences=?, updated_at=? WHERE id=?",
                     (json.dumps(prefs), _now(), profile_id))


def create_card(profile_id: str, role_id: str) -> str:
    """A short random ID that reveals nothing about the profile, for a read-only shared link."""
    card_id = secrets.token_urlsafe(9)
    with _connect() as conn:
        conn.execute("INSERT INTO cards (id, profile_id, role_id, created_at) VALUES (?, ?, ?, ?)",
                     (card_id, profile_id, role_id, _now()))
    return card_id


def get_card(card_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM cards WHERE id=?", (card_id,)).fetchone()
    return dict(row) if row else None


def profile_for_user(user_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT id FROM profiles WHERE user_id=?", (user_id,)).fetchone()
    return get_profile(row["id"]) if row else None


def attach_user(profile_id: str, user_id: str) -> None:
    with _connect() as conn:
        conn.execute("UPDATE profiles SET user_id=?, updated_at=? WHERE id=?", (user_id, _now(), profile_id))


def purge_older_than(days: int = 30) -> int:
    """Delete anonymous and demo profiles left alone for `days`. A profile saved to an account
    stays until its owner deletes it."""
    cutoff = (dt.datetime.now(dt.UTC) - dt.timedelta(days=days)).isoformat(timespec="seconds")
    with _connect() as conn:
        return conn.execute("DELETE FROM profiles WHERE updated_at < ? AND user_id IS NULL", (cutoff,)).rowcount


# --- trend snapshots ----------------------------------------------------------------------------
# Snapshots imported or built at runtime, and every review decision, live here rather than in
# files: hosted containers lose runtime file writes on redeploy, and the approval log is evidence.

def save_snapshot(snapshot: dict, state: str) -> None:
    with _connect() as conn:
        conn.execute("INSERT INTO snapshots (id, state, imported, body) VALUES (?, ?, ?, ?)",
                     (snapshot["snapshot_id"], state, snapshot["imported"], json.dumps(snapshot)))


def get_snapshot(snapshot_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM snapshots WHERE id=?", (snapshot_id,)).fetchone()
    if row is None:
        return None
    return {"state": row["state"], "body": json.loads(row["body"]), "decided_by": row["decided_by"],
            "decided_at": row["decided_at"], "reason": row["reason"]}


def list_snapshots(state: str) -> list[dict]:
    """Snapshot bodies in one state. Empty before the database exists (reference data can load
    before the app has initialised the database, e.g. in scripts and unit tests)."""
    try:
        with _connect() as conn:
            rows = conn.execute("SELECT body FROM snapshots WHERE state=?", (state,)).fetchall()
    except Exception as error:  # sqlite3.OperationalError / psycopg UndefinedTable
        if "snapshots" in str(error):
            return []
        raise
    return [json.loads(r["body"]) for r in rows]


def decide_snapshot(snapshot_id: str, state: str, decided_by: str, body: dict, reason: str | None = None) -> None:
    with _connect() as conn:
        conn.execute("UPDATE snapshots SET state=?, decided_by=?, decided_at=?, reason=?, body=? WHERE id=?",
                     (state, decided_by, _now(), reason, json.dumps(body), snapshot_id))
