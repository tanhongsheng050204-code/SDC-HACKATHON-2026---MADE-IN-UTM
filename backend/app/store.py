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

SCHEMA_VERSION = 10
APP_TABLES = ("schema_version", "profiles", "cards", "skill_progress", "skill_checks", "survey_responses", "snapshots",
              "evidence")
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
    9: "ALTER TABLE profiles ADD COLUMN audience TEXT;",
    10: """
    CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        state TEXT NOT NULL,
        created TEXT NOT NULL,
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


_pools: dict = {}


def _pool(url: str):
    """One small pool per process: opening a TLS connection to Supabase for every query would add
    seconds to a survey submit. prepare_threshold=None keeps it safe on the transaction pooler."""
    if url not in _pools:
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        _pools[url] = ConnectionPool(url, min_size=1, max_size=5, open=True,
                                     kwargs={"row_factory": dict_row, "prepare_threshold": None})
    return _pools[url]


def close_pools() -> None:
    """Close Postgres pools on shutdown, so worker threads stop cleanly."""
    for pool in _pools.values():
        pool.close()
    _pools.clear()


@contextmanager
def _connect():
    settings = get_settings()
    if settings.database_url:
        with _pool(settings.database_url).connection() as raw:  # commits on success, rolls back on error
            yield _PgConnection(raw)
        return
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
        if get_settings().database_url:
            conn.execute("SELECT pg_advisory_xact_lock(4242)")  # held until this transaction commits
        conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
        row = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
        current = row["v"] or 0
        for version in range(current + 1, SCHEMA_VERSION + 1):
            for statement in _MIGRATIONS[version].split(";"):
                if statement.strip():
                    conn.execute(statement)
            conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
        if get_settings().database_url:
            # Supabase serves the public schema over its REST API with a key shipped in the app.
            # Row-level security with no policies closes every table to that API; the backend
            # connects as the owner and is unaffected. Re-applied each start, so it is never missed.
            for table in APP_TABLES:
                conn.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


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
        "audience": row["audience"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_profile(display_name, current_role_id, skills, experience_years=None,
                   is_demo: bool = False, audience: str | None = None) -> dict:
    profile_id, now = str(uuid.uuid4()), _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO profiles (id, display_name, current_role_id, skills, interests, "
            "experience_years, is_demo, audience, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (profile_id, display_name, current_role_id, json.dumps(skills),
             "[]", experience_years, int(is_demo), audience, now, now),
        )
    return get_profile(profile_id)


def update_profile(profile_id, display_name, current_role_id, skills,
                   experience_years=None, audience: str | None = None) -> dict | None:
    with _connect() as conn:
        cursor = conn.execute(
            "UPDATE profiles SET display_name=?, current_role_id=?, skills=?, "
            "experience_years=?, audience=?, updated_at=? WHERE id=?",
            (display_name, current_role_id, json.dumps(skills),
             experience_years, audience, _now(), profile_id),
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


def replace_owned_profile(old_id: str, new_id: str, user_id: str) -> None:
    """Delete the account's saved profile and attach this one, in one transaction."""
    with _connect() as conn:
        conn.execute("DELETE FROM profiles WHERE id=? AND user_id=?", (old_id, user_id))
        conn.execute("UPDATE profiles SET user_id=?, updated_at=? WHERE id=?", (user_id, _now(), new_id))


def purge_older_than(days: int = 30) -> int:
    """Delete anonymous and demo profiles left alone for `days`. A profile saved to an account
    stays until its owner deletes it."""
    cutoff = (dt.datetime.now(dt.UTC) - dt.timedelta(days=days)).isoformat(timespec="seconds")
    with _connect() as conn:
        return conn.execute("DELETE FROM profiles WHERE updated_at < ? AND user_id IS NULL", (cutoff,)).rowcount


DEMO_HOURS = 24        # each visitor gets a private demo copy; copies left alone a day are removed
ANONYMOUS_DAYS = 30    # retention rule in docs/05-BACKEND_SCHEMA.md


def purge_stale() -> dict[str, int]:
    """Remove demo copies left alone for a day and anonymous profiles left alone for 30 days.
    Profiles saved to an account are never touched. Runs at every API start (app/main.py)."""
    now = dt.datetime.now(dt.UTC)
    demo_cutoff = (now - dt.timedelta(hours=DEMO_HOURS)).isoformat(timespec="seconds")
    anon_cutoff = (now - dt.timedelta(days=ANONYMOUS_DAYS)).isoformat(timespec="seconds")
    with _connect() as conn:
        demo = conn.execute("DELETE FROM profiles WHERE is_demo = 1 AND user_id IS NULL AND updated_at < ?",
                            (demo_cutoff,)).rowcount
        anonymous = conn.execute("DELETE FROM profiles WHERE is_demo = 0 AND user_id IS NULL AND updated_at < ?",
                                 (anon_cutoff,)).rowcount
    return {"demo": demo, "anonymous": anonymous}


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
    except Exception as error:
        missing_table = (isinstance(error, sqlite3.OperationalError) and "no such table" in str(error)) or \
            type(error).__name__ == "UndefinedTable"
        if missing_table:
            return []
        raise
    return [json.loads(r["body"]) for r in rows]


def decide_snapshot(snapshot_id: str, state: str, decided_by: str, body: dict, reason: str | None = None) -> None:
    with _connect() as conn:
        conn.execute("UPDATE snapshots SET state=?, decided_by=?, decided_at=?, reason=?, body=? WHERE id=?",
                     (state, decided_by, _now(), reason, json.dumps(body), snapshot_id))


# --- cited evidence (Phase 3) -------------------------------------------------------------------
# Web-search results waiting for, or decided by, a person. `kind` is "role" (skill evidence for a
# catalogue role) or "emerging" (a predicted new role); `subject` is the role or capability id.

def save_evidence(evidence_id: str, kind: str, subject: str, body: dict) -> None:
    with _connect() as conn:
        conn.execute("INSERT INTO evidence (id, kind, subject, state, created, body) VALUES (?, ?, ?, 'pending', ?, ?)",
                     (evidence_id, kind, subject, _now(), json.dumps(body)))


def _evidence(row) -> dict:
    return {"id": row["id"], "kind": row["kind"], "subject": row["subject"], "state": row["state"],
            "created": row["created"], "body": json.loads(row["body"]), "decided_by": row["decided_by"],
            "decided_at": row["decided_at"], "reason": row["reason"]}


def get_evidence(evidence_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM evidence WHERE id=?", (evidence_id,)).fetchone()
    return _evidence(row) if row else None


def list_evidence(state: str, kind: str | None = None) -> list[dict]:
    """Newest first. Empty before the database exists, like list_snapshots."""
    sql, params = "SELECT * FROM evidence WHERE state=?", [state]
    if kind:
        sql, params = sql + " AND kind=?", [state, kind]
    try:
        with _connect() as conn:
            rows = conn.execute(sql + " ORDER BY created DESC, id DESC", tuple(params)).fetchall()
    except Exception as error:
        if (isinstance(error, sqlite3.OperationalError) and "no such table" in str(error)) or                 type(error).__name__ == "UndefinedTable":
            return []
        raise
    return [_evidence(r) for r in rows]


def decide_evidence(evidence_id: str, state: str, decided_by: str, body: dict, reason: str | None = None) -> None:
    with _connect() as conn:
        conn.execute("UPDATE evidence SET state=?, decided_by=?, decided_at=?, reason=?, body=? WHERE id=?",
                     (state, decided_by, _now(), reason, json.dumps(body), evidence_id))


def latest_approved_evidence(kind: str) -> dict[str, dict]:
    """The most recently approved body per subject."""
    latest: dict[str, tuple[str, dict]] = {}
    for item in list_evidence("approved", kind):
        stamp = (item["decided_at"] or "", item["id"])
        if item["subject"] not in latest or stamp > latest[item["subject"]][0]:
            latest[item["subject"]] = (stamp, item["body"])
    return {subject: body for subject, (_, body) in latest.items()}


# --- proof checks -------------------------------------------------------------------------------

def create_check(profile_id: str, skill_id: str, level: int, questions: list[dict]) -> str:
    check_id = secrets.token_urlsafe(12)
    with _connect() as conn:
        conn.execute("INSERT INTO skill_checks (id, profile_id, skill_id, level, questions, created_at) "
                     "VALUES (?, ?, ?, ?, ?, ?)", (check_id, profile_id, skill_id, level, json.dumps(questions), _now()))
    return check_id


def get_check(check_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM skill_checks WHERE id=?", (check_id,)).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "profile_id": row["profile_id"], "skill_id": row["skill_id"], "level": row["level"],
            "questions": json.loads(row["questions"]), "submitted_at": row["submitted_at"]}


def submit_check(check_id: str, correct: int, passed: bool) -> bool:
    """Record the result once. False if this attempt was already graded."""
    with _connect() as conn:
        return conn.execute("UPDATE skill_checks SET submitted_at=?, correct=?, passed=? "
                            "WHERE id=? AND submitted_at IS NULL",
                            (_now(), correct, int(passed), check_id)).rowcount == 1


MALAYSIA = dt.timezone(dt.timedelta(hours=8))  # no daylight saving


def day_start_utc(now: dt.datetime | None = None) -> str:
    """Midnight today in Malaysia, as the UTC timestamp format stored in the database."""
    local = (now or dt.datetime.now(dt.UTC)).astimezone(MALAYSIA)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(dt.UTC)
    return start.isoformat(timespec="seconds")


def checks_started_since(profile_id: str, since: str) -> int:
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM skill_checks WHERE profile_id=? AND created_at >= ?",
                            (profile_id, since)).fetchone()["n"]


def attempted_today(profile_id: str, skill_id: str, level: int) -> bool:
    today = day_start_utc()
    with _connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM skill_checks WHERE profile_id=? AND skill_id=? AND level=? "
                           "AND created_at >= ?", (profile_id, skill_id, level, today)).fetchone()
    return row["n"] > 0


# --- survey -----------------------------------------------------------------------------------

def save_survey(profile_id: str, answers: list[dict]) -> None:
    """Replace this profile's survey answers (a retake starts fresh)."""
    now = _now()
    with _connect() as conn:
        conn.execute("DELETE FROM survey_responses WHERE profile_id=?", (profile_id,))
        for a in answers:
            conn.execute("INSERT INTO survey_responses (profile_id, card_id, answer, note, created_at) VALUES (?, ?, ?, ?, ?)",
                         (profile_id, a["card_id"], a["answer"], a.get("note"), now))
