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

SCHEMA_VERSION = 17
APP_TABLES = ("schema_version", "profiles", "cards", "skill_progress", "skill_checks", "survey_responses", "snapshots",
              "evidence", "progress_events", "consents", "feedback", "usage_counts",
              "email_settings", "sent_jobs", "counsellors", "classes", "class_members", "decisions",
              "checkin_actions")
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
    # The role a person chose to aim for, and when they last finished interview practice (journey steps 2 and 4).
    11: """
    ALTER TABLE profiles ADD COLUMN target_role_id TEXT;
    ALTER TABLE profiles ADD COLUMN practised_at TEXT;
    """,
    # Progress over time: a target date and weekly study hours, and dated events (course finished,
    # skill proven, destination set) with the readiness toward the destination after each one.
    12: """
    ALTER TABLE profiles ADD COLUMN target_date TEXT;
    ALTER TABLE profiles ADD COLUMN weekly_hours INTEGER;
    CREATE TABLE IF NOT EXISTS progress_events (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        subject TEXT,
        detail INTEGER,
        role_id TEXT,
        readiness REAL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS progress_events_profile ON progress_events(profile_id, created_at);
    """,
    # What a person agreed to, and when: storing a profile (at creation), and later email and
    # class sharing. A withdrawn consent is a new row with given = 0, so the history stays.
    13: """
    CREATE TABLE IF NOT EXISTS consents (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        version TEXT NOT NULL,
        given INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS consents_profile ON consents(profile_id, created_at);
    """,
    # "Was this helpful?" and "Report a problem", and usage counts per event per day. Neither has a
    # profile ID: feedback keeps only the day, and a usage row is just (event, day, count).
    14: """
    CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        target TEXT NOT NULL,
        subject TEXT,
        helpful INTEGER,
        reason TEXT,
        note TEXT,
        screen TEXT,
        language TEXT,
        day TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feedback_day ON feedback(day);
    CREATE TABLE IF NOT EXISTS usage_counts (
        event TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (event, day)
    );
    """,
    # Email: only for profiles saved to a Google account, after the person ticks "Email me". The
    # address is the account's Google email. Turning everything off deletes the row. sent_jobs
    # remembers which job ads were already emailed, so none is sent twice.
    15: """
    CREATE TABLE IF NOT EXISTS email_settings (
        profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        digest INTEGER NOT NULL,
        alerts TEXT NOT NULL,
        state TEXT,
        language TEXT NOT NULL,
        last_digest_at TEXT,
        last_alert_at TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sent_jobs (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        job_key TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, job_key)
    );
    """,
    # Career-centre classes: an admin approves a counsellor (a Google login); the counsellor makes a
    # class with a join code; a logged-in student joins after seeing what is shared, and leaving
    # deletes the membership row, so access ends at once.
    16: """
    CREATE TABLE IF NOT EXISTS counsellors (
        user_id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT NOT NULL,
        organisation TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT
    );
    CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        counsellor_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS classes_counsellor ON classes(counsellor_user_id);
    CREATE TABLE IF NOT EXISTS class_members (
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (class_id, profile_id)
    );
    CREATE INDEX IF NOT EXISTS class_members_profile ON class_members(profile_id);
    """,
    # Why a destination was chosen: the reasons the person ticked (fixed codes, never free text) and
    # the facts Laluan showed at that moment (fit, outlook, plan hours, snapshot), so a later forecast
    # can be compared with the one the choice was made on. Check-in actions are what a counsellor
    # proposes after a check-in (a target date, weekly hours, a course, a skill to prove, practice);
    # nothing changes until the student accepts. No notes, recordings or transcripts are stored.
    17: """
    CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL,
        reasons TEXT NOT NULL,
        facts TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS decisions_profile ON decisions(profile_id, created_at);
    CREATE TABLE IF NOT EXISTS checkin_actions (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        value TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        decided_at TEXT
    );
    CREATE INDEX IF NOT EXISTS checkin_actions_profile ON checkin_actions(profile_id, created_at);
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
        "target_role_id": row["target_role_id"],
        "practised_at": row["practised_at"],
        "target_date": row["target_date"],
        "weekly_hours": row["weekly_hours"],
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


def set_target(profile_id: str, role_id: str | None) -> dict | None:
    with _connect() as conn:
        cursor = conn.execute("UPDATE profiles SET target_role_id=?, updated_at=? WHERE id=?",
                              (role_id, _now(), profile_id))
        if cursor.rowcount == 0:
            return None
    return get_profile(profile_id)


def set_plan(profile_id: str, target_date: str | None, weekly_hours: int | None) -> dict | None:
    with _connect() as conn:
        cursor = conn.execute("UPDATE profiles SET target_date=?, weekly_hours=?, updated_at=? WHERE id=?",
                              (target_date, weekly_hours, _now(), profile_id))
        if cursor.rowcount == 0:
            return None
    return get_profile(profile_id)


def add_event(profile_id: str, kind: str, subject: str | None = None, detail: int | None = None,
              role_id: str | None = None, readiness: float | None = None, at: str | None = None) -> None:
    """One dated progress event. `readiness` is toward `role_id` (the destination) after the change."""
    with _connect() as conn:
        conn.execute("INSERT INTO progress_events (id, profile_id, kind, subject, detail, role_id, readiness, created_at) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                     (secrets.token_urlsafe(9), profile_id, kind, subject, detail, role_id, readiness,
                      at or dt.datetime.now(dt.UTC).isoformat(timespec="microseconds")))  # keeps same-second order


def list_events(profile_id: str) -> list[dict]:
    """Oldest first."""
    with _connect() as conn:
        rows = conn.execute("SELECT kind, subject, detail, role_id, readiness, created_at FROM progress_events "
                            "WHERE profile_id=? ORDER BY created_at, id", (profile_id,)).fetchall()
    return [dict(r) for r in rows]


def add_consent(profile_id: str, kind: str, version: str, given: bool = True) -> None:
    with _connect() as conn:
        conn.execute("INSERT INTO consents (id, profile_id, kind, version, given, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (secrets.token_urlsafe(9), profile_id, kind, version, int(given),
                      dt.datetime.now(dt.UTC).isoformat(timespec="microseconds")))


def list_consents(profile_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT kind, version, given, created_at FROM consents WHERE profile_id=? "
                            "ORDER BY created_at, id", (profile_id,)).fetchall()
    return [{**dict(r), "given": bool(r["given"])} for r in rows]


def export_rows(profile_id: str) -> dict[str, list[dict]]:
    """Every stored row that belongs to this profile, table by table, for "Download my data"."""
    queries = {
        "future_cards": "SELECT id, role_id, created_at FROM cards WHERE profile_id=? ORDER BY created_at",
        "proven_skills": "SELECT skill_id, level, proven_at FROM skill_progress WHERE profile_id=? ORDER BY skill_id",
        "proof_checks": "SELECT skill_id, level, created_at, submitted_at, correct, passed FROM skill_checks "
                        "WHERE profile_id=? ORDER BY created_at",
        "survey_answers": "SELECT card_id, answer, note, created_at FROM survey_responses WHERE profile_id=? ORDER BY card_id",
        "progress_events": "SELECT kind, subject, detail, role_id, readiness, created_at FROM progress_events "
                           "WHERE profile_id=? ORDER BY created_at, id",
    }
    with _connect() as conn:
        out = {name: [dict(r) for r in conn.execute(sql, (profile_id,)).fetchall()] for name, sql in queries.items()}
    for row in out["proof_checks"]:
        row["passed"] = None if row["passed"] is None else bool(row["passed"])
    out["consents"] = list_consents(profile_id)
    settings = get_email_settings(profile_id)
    out["email_settings"] = [settings] if settings else []
    out["classes"] = [{k: m[k] for k in ("name", "counsellor", "organisation", "joined_at")} for m in memberships(profile_id)]
    with _connect() as conn:
        out["emailed_job_ads"] = [dict(r) for r in conn.execute(
            "SELECT job_key, sent_at FROM sent_jobs WHERE profile_id=? ORDER BY sent_at", (profile_id,)).fetchall()]
    out["destination_decisions"] = [{k: d[k] for k in ("role_id", "reasons", "facts", "created_at")}
                                    for d in list_decisions(profile_id)]
    out["checkin_actions"] = [{k: a[k] for k in ("class_name", "kind", "value", "status", "created_at", "decided_at")}
                              for a in actions_for_profile(profile_id)]
    return out


def get_email_settings(profile_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM email_settings WHERE profile_id=?", (profile_id,)).fetchone()
    return None if row is None else {**dict(row), "digest": bool(row["digest"])}


def save_email_settings(profile_id: str, user_id: str, email: str, digest: bool, alerts: str, state: str | None,
                        language: str) -> None:
    now = _now()
    with _connect() as conn:
        updated = conn.execute("UPDATE email_settings SET user_id=?, email=?, digest=?, alerts=?, state=?, language=?, "
                               "updated_at=? WHERE profile_id=?",
                               (user_id, email, int(digest), alerts, state, language, now, profile_id)).rowcount
        if not updated:
            conn.execute("INSERT INTO email_settings (profile_id, user_id, email, digest, alerts, state, language, updated_at) "
                         "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (profile_id, user_id, email, int(digest), alerts, state, language, now))


def delete_email_settings(profile_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM email_settings WHERE profile_id=?", (profile_id,))
        conn.execute("DELETE FROM sent_jobs WHERE profile_id=?", (profile_id,))


def list_email_settings() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM email_settings ORDER BY profile_id").fetchall()
    return [{**dict(r), "digest": bool(r["digest"])} for r in rows]


def mark_emailed(profile_id: str, column: str) -> None:
    assert column in ("last_digest_at", "last_alert_at")
    with _connect() as conn:
        conn.execute(f"UPDATE email_settings SET {column}=? WHERE profile_id=?", (_now(), profile_id))


def sent_job_keys(profile_id: str) -> set[str]:
    with _connect() as conn:
        rows = conn.execute("SELECT job_key FROM sent_jobs WHERE profile_id=?", (profile_id,)).fetchall()
    return {r["job_key"] for r in rows}


def add_sent_jobs(profile_id: str, keys: list[str]) -> None:
    now = _now()
    with _connect() as conn:
        for key in keys:
            conn.execute("INSERT INTO sent_jobs (profile_id, job_key, sent_at) VALUES (?, ?, ?) "
                         "ON CONFLICT (profile_id, job_key) DO NOTHING", (profile_id, key, now))


def mark_practised(profile_id: str) -> None:
    with _connect() as conn:
        conn.execute("UPDATE profiles SET practised_at=? WHERE id=?", (_now(), profile_id))


def card_roles(profile_id: str) -> set[str]:
    """Roles this profile has made a Future Card for."""
    with _connect() as conn:
        rows = conn.execute("SELECT role_id FROM cards WHERE profile_id=?", (profile_id,)).fetchall()
    return {r["role_id"] for r in rows}


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
    """Delete the account's saved profile and attach this one, in one transaction. The new profile
    keeps the old one's display name if it has none of its own."""
    with _connect() as conn:
        old = conn.execute("SELECT display_name FROM profiles WHERE id=? AND user_id=?", (old_id, user_id)).fetchone()
        conn.execute("DELETE FROM profiles WHERE id=? AND user_id=?", (old_id, user_id))
        conn.execute("UPDATE profiles SET user_id=?, updated_at=?, display_name=COALESCE(display_name, ?) WHERE id=?",
                     (user_id, _now(), old["display_name"] if old else None, new_id))


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
# catalogue role), "emerging" (a predicted new role) or "day" (a "day in this job" draft that uses
# approved job ads); `subject` is the role or capability id.

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


# --- feedback and usage counts (no profile IDs) ---------------------------------------------------

def malaysia_day(now: dt.datetime | None = None) -> str:
    return (now or dt.datetime.now(dt.UTC)).astimezone(MALAYSIA).date().isoformat()


def add_feedback(target: str, subject: str | None, helpful: bool | None, reason: str | None, note: str | None,
                 screen: str | None, language: str | None) -> None:
    with _connect() as conn:
        conn.execute("INSERT INTO feedback (id, target, subject, helpful, reason, note, screen, language, day) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (secrets.token_urlsafe(9), target, subject, None if helpful is None else int(helpful), reason, note,
                      screen, language, malaysia_day()))


def list_feedback(limit: int = 100) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT target, subject, helpful, reason, note, screen, language, day FROM feedback "
                            "ORDER BY day DESC, id DESC LIMIT ?", (limit,)).fetchall()
    return [{**dict(r), "helpful": None if r["helpful"] is None else bool(r["helpful"])} for r in rows]


def feedback_totals() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT target, helpful, COUNT(*) AS n FROM feedback GROUP BY target, helpful "
                            "ORDER BY target, helpful").fetchall()
    return [{"target": r["target"], "helpful": None if r["helpful"] is None else bool(r["helpful"]), "count": r["n"]}
            for r in rows]


def count_usage(event: str) -> None:
    """Add one to today's count for this event. Never fails the request that triggered it."""
    try:
        with _connect() as conn:
            conn.execute("INSERT INTO usage_counts (event, day, count) VALUES (?, ?, 1) "
                         "ON CONFLICT (event, day) DO UPDATE SET count = usage_counts.count + 1",
                         (event, malaysia_day()))
    except Exception:
        pass


def usage_since(day: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT event, day, count FROM usage_counts WHERE day >= ? ORDER BY day, event",
                            (day,)).fetchall()
    return [dict(r) for r in rows]


# --- career-centre classes ------------------------------------------------------------------------

CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, so a code read aloud is typed right


def request_counsellor(user_id: str, email: str | None, name: str, organisation: str) -> dict:
    """Ask to be a counsellor (or update the name). An approved or revoked status is kept."""
    with _connect() as conn:
        updated = conn.execute("UPDATE counsellors SET email=?, name=?, organisation=? WHERE user_id=?",
                               (email, name, organisation, user_id)).rowcount
        if not updated:
            conn.execute("INSERT INTO counsellors (user_id, email, name, organisation, status, requested_at) "
                         "VALUES (?, ?, ?, ?, 'pending', ?)", (user_id, email, name, organisation, _now()))
    return get_counsellor(user_id)


def get_counsellor(user_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM counsellors WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def list_counsellors() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM counsellors ORDER BY requested_at DESC").fetchall()
    return [dict(r) for r in rows]


def decide_counsellor(user_id: str, status: str, decided_by: str) -> bool:
    with _connect() as conn:
        return conn.execute("UPDATE counsellors SET status=?, decided_at=?, decided_by=? WHERE user_id=?",
                            (status, _now(), decided_by, user_id)).rowcount == 1


def create_class(counsellor_user_id: str, name: str) -> dict:
    class_id = str(uuid.uuid4())
    for _ in range(10):
        code = "".join(secrets.choice(CODE_LETTERS) for _ in range(8))
        try:
            with _connect() as conn:
                conn.execute("INSERT INTO classes (id, code, name, counsellor_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
                             (class_id, code, name, counsellor_user_id, _now()))
            return get_class(class_id)
        except Exception as error:  # a code already in use: try another
            if "unique" not in str(error).lower() and "duplicate" not in str(error).lower():
                raise
    raise RuntimeError("Could not find a free class code")


def get_class(class_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()
    return dict(row) if row else None


def class_by_code(code: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM classes WHERE code=?", (code.strip().upper(),)).fetchone()
    return dict(row) if row else None


def classes_for(counsellor_user_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT c.*, (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS members "
                            "FROM classes c WHERE counsellor_user_id=? ORDER BY created_at DESC",
                            (counsellor_user_id,)).fetchall()
    return [dict(r) for r in rows]


def delete_class(class_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM checkin_actions WHERE class_id=?", (class_id,))
        conn.execute("DELETE FROM class_members WHERE class_id=?", (class_id,))
        conn.execute("DELETE FROM classes WHERE id=?", (class_id,))


def join_class(class_id: str, profile_id: str) -> None:
    with _connect() as conn:
        conn.execute("INSERT INTO class_members (class_id, profile_id, joined_at) VALUES (?, ?, ?) "
                     "ON CONFLICT (class_id, profile_id) DO NOTHING", (class_id, profile_id, _now()))


def leave_class(class_id: str, profile_id: str) -> bool:
    """Leaving also withdraws the counsellor's proposals the student had not answered yet."""
    with _connect() as conn:
        conn.execute("DELETE FROM checkin_actions WHERE class_id=? AND profile_id=? AND status='proposed'",
                     (class_id, profile_id))
        return conn.execute("DELETE FROM class_members WHERE class_id=? AND profile_id=?",
                            (class_id, profile_id)).rowcount > 0


def member_ids(class_id: str) -> list[str]:
    with _connect() as conn:
        rows = conn.execute("SELECT profile_id FROM class_members WHERE class_id=? ORDER BY joined_at", (class_id,)).fetchall()
    return [r["profile_id"] for r in rows]


def memberships(profile_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT c.id, c.name, c.code, m.joined_at, k.name AS counsellor, k.organisation "
                            "FROM class_members m JOIN classes c ON c.id = m.class_id "
                            "LEFT JOIN counsellors k ON k.user_id = c.counsellor_user_id "
                            "WHERE m.profile_id=? ORDER BY m.joined_at", (profile_id,)).fetchall()
    return [dict(r) for r in rows]


def destination_counts() -> dict[str, int]:
    """How many real (non-demo) profiles chose each destination. Counts only, no IDs."""
    with _connect() as conn:
        rows = conn.execute("SELECT target_role_id AS role, COUNT(*) AS n FROM profiles WHERE is_demo = 0 "
                            "AND target_role_id IS NOT NULL GROUP BY target_role_id").fetchall()
    return {r["role"]: r["n"] for r in rows}


# --- destination decisions and check-in actions ---------------------------------------------------

def add_decision(profile_id: str, role_id: str, facts: dict, reasons: list[str] | None = None) -> None:
    with _connect() as conn:
        conn.execute("INSERT INTO decisions (id, profile_id, role_id, reasons, facts, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (secrets.token_urlsafe(9), profile_id, role_id, json.dumps(reasons or []), json.dumps(facts),
                      dt.datetime.now(dt.UTC).isoformat(timespec="microseconds")))


def _decision(row) -> dict:
    return {**dict(row), "reasons": json.loads(row["reasons"]), "facts": json.loads(row["facts"])}


def list_decisions(profile_id: str) -> list[dict]:
    """Oldest first."""
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM decisions WHERE profile_id=? ORDER BY created_at, id", (profile_id,)).fetchall()
    return [_decision(r) for r in rows]


def set_decision_reasons(decision_id: str, reasons: list[str]) -> None:
    with _connect() as conn:
        conn.execute("UPDATE decisions SET reasons=? WHERE id=?", (json.dumps(reasons), decision_id))


def add_action(class_id: str, profile_id: str, kind: str, value: str | None) -> dict:
    action_id = secrets.token_urlsafe(9)
    with _connect() as conn:
        conn.execute("INSERT INTO checkin_actions (id, class_id, profile_id, kind, value, status, created_at) "
                     "VALUES (?, ?, ?, ?, ?, 'proposed', ?)",
                     (action_id, class_id, profile_id, kind, value, dt.datetime.now(dt.UTC).isoformat(timespec="microseconds")))
    return get_action(action_id)


def get_action(action_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM checkin_actions WHERE id=?", (action_id,)).fetchone()
    return dict(row) if row else None


def decide_action(action_id: str, status: str) -> None:
    with _connect() as conn:
        conn.execute("UPDATE checkin_actions SET status=?, decided_at=? WHERE id=?", (status, _now(), action_id))


def delete_action(action_id: str) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM checkin_actions WHERE id=?", (action_id,))


def actions_for(class_id: str, profile_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM checkin_actions WHERE class_id=? AND profile_id=? ORDER BY created_at, id",
                            (class_id, profile_id)).fetchall()
    return [dict(r) for r in rows]


def actions_for_profile(profile_id: str) -> list[dict]:
    """Every proposal to this student, with the class and counsellor it came from. Oldest first."""
    with _connect() as conn:
        rows = conn.execute("SELECT a.*, c.name AS class_name, k.name AS counsellor FROM checkin_actions a "
                            "JOIN classes c ON c.id = a.class_id LEFT JOIN counsellors k ON k.user_id = c.counsellor_user_id "
                            "WHERE a.profile_id=? ORDER BY a.created_at, a.id", (profile_id,)).fetchall()
    return [dict(r) for r in rows]

