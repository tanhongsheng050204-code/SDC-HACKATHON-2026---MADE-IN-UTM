"""Run a trend refresh: collect (or reuse today's raw counts), build, save a new snapshot.

The snapshot is saved for review, not published: an admin approves it first (app/trends/review.py).

Used by the admin "Refresh trend data" button (in a background thread, with progress the UI
polls) and by scripts/refresh_trends.py. Raw counts are saved per day under data/raw/ so a
refresh can be traced, and a second refresh on the same day reuses them unless forced.
"""

import datetime as dt
import json
import re
import threading
from pathlib import Path

from app.config import get_settings
from app.reference import get_reference
from app.trends import builder, jobs, research, review

_lock = threading.Lock()
_status: dict = {"state": "idle", "steps": [], "snapshot_id": None, "error": None}


_URL = re.compile(r"https?://\S+")


def _safe_error(error: Exception) -> str:
    """Error text for the admin screen: no URLs or query strings, at most 200 characters."""
    return f"{type(error).__name__}: {_URL.sub('[url]', str(error))}"[:200]


def status() -> dict:
    with _lock:
        return {**_status, "steps": list(_status["steps"])}


def _log(message: str) -> None:
    with _lock:
        _status["steps"].append(message)


def baseline_snapshot(snapshots: list[dict]) -> dict:
    """The newest snapshot that is not itself trend-adjusted: refreshes never compound."""
    return [s for s in snapshots if s.get("kind") != "trend-adjusted"][-1]


def _raw(kind: str, today: dt.date, collect, force: bool) -> dict:
    path = get_settings().data_dir / "raw" / kind / f"{today}.json"
    if path.exists() and not force:
        _log(f"Using today's saved {kind} counts ({path.name})")
        return json.loads(path.read_text(encoding="utf-8"))
    data = collect()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def run(force: bool = False, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now().replace(microsecond=0)
    ref = get_reference()
    contact = get_settings().contact_email or None
    research_raw = _raw("research", now.date(), lambda: research.collect(
        ref.capabilities, now.date(), mailto=contact, progress=_log), force)
    jobs_raw = _raw("jobs", now.date(), lambda: jobs.collect(
        ref.job_terms, now.date(), progress=_log), force)
    _log("Building new snapshot")
    snapshot = builder.build(ref, baseline_snapshot(ref.snapshots), research_raw, jobs_raw, now)
    out: Path = review.save_pending(snapshot)
    _log(f"Saved {out.name} for review. Users keep the current forecast until an admin approves it.")
    return snapshot


def start(force: bool = False) -> bool:
    """Start a refresh in the background. False if one is already running."""
    with _lock:
        if _status["state"] == "running":
            return False
        _status.update(state="running", steps=[], snapshot_id=None, error=None)

    def work():
        try:
            snapshot = run(force)
            with _lock:
                _status.update(state="done", snapshot_id=snapshot["snapshot_id"])
        except Exception as error:  # reported to the admin; the last good snapshot stays in use
            with _lock:
                _status.update(state="failed", error=_safe_error(error))

    threading.Thread(target=work, daemon=True).start()
    return True
