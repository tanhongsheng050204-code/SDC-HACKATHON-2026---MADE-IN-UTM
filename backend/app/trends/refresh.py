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

import httpx

from app.config import get_settings
from app.reference import get_reference
from app.trends import attention, builder, dosm, jobs, labour, mypostings, prices, research, review, sector

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
    openalex_key = get_settings().openalex_api_key or None
    research_raw = _raw("research", now.date(), lambda: research.collect(
        ref.capabilities, now.date(), mailto=contact, api_key=openalex_key, progress=_log), force)
    jobs_raw = _raw("jobs", now.date(), lambda: jobs.collect(
        ref.job_terms, now.date(), progress=_log), force)
    try:
        dosm_raw = _raw("dosm", now.date(), lambda: dosm.collect(now.date(), progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError) as error:  # optional source: build without it
        _log(f"OpenDOSM unavailable, building without Malaysian employment ({_safe_error(error)})")
        dosm_raw = None
    try:
        my_raw = _raw("mypostings", now.date(), lambda: mypostings.collect(
            ref.my_posting_terms, now.date(), progress=_log), force)
        prior = mypostings.previous(get_settings().data_dir / "raw" / "mypostings", now.date())
        my_postings = mypostings.with_prior(my_raw, prior)
    except (httpx.HTTPError, KeyError, ValueError) as error:  # optional source: build without it
        _log(f"freehire.me unavailable, building without Malaysian postings ({_safe_error(error)})")
        my_postings = None
    try:  # optional: how many Malaysian postings mention each role, the same search the role page uses
        role_raw = _raw("role_postings", now.date(), lambda: mypostings.collect_roles(
            ref.role_openings, now.date(), progress=_log), force)
        role_prior = mypostings.previous(get_settings().data_dir / "raw" / "role_postings", now.date())
        role_postings = mypostings.with_prior_roles(role_raw, role_prior)
    except (httpx.HTTPError, KeyError, ValueError) as error:
        _log(f"freehire.me role counts unavailable, building without them ({_safe_error(error)})")
        role_postings = None
    try:  # optional: monthly national labour force, for the market-wide adjustment
        labour_raw = _raw("labour", now.date(), lambda: labour.collect(now.date(), progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
        _log(f"OpenDOSM monthly labour force unavailable, building without it ({_safe_error(error)})")
        labour_raw = None
    try:  # optional: prices, shown as 2030 money beside pay; never changes a score
        prices_raw = _raw("prices", now.date(), lambda: prices.collect(now.date(), progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
        _log(f"OpenDOSM CPI unavailable, building without it ({_safe_error(error)})")
        prices_raw = None
    try:  # optional: Stack Overflow, GitHub, npm and PyPI, for each skill's developer attention
        attention_raw = _raw("attention", now.date(), lambda: attention.collect(
            ref.skill_sources, now.date(), progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
        _log(f"Developer attention unavailable, building without it ({_safe_error(error)})")
        attention_raw = None
    try:  # optional: the same capabilities, but only papers with a Malaysian institution
        local_research_raw = _raw("local_research", now.date(), lambda: research.collect_malaysia(
            ref.capabilities, now.date(), mailto=contact, api_key=openalex_key, progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
        _log(f"OpenAlex (Malaysia) unavailable, building without it ({_safe_error(error)})")
        local_research_raw = None
    try:  # optional: the share of Malaysian employment in each sector
        sector_raw = _raw("sector", now.date(), lambda: sector.collect(now.date(), progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
        _log(f"OpenDOSM sector employment unavailable, building without it ({_safe_error(error)})")
        sector_raw = None
    history = {}
    try:  # optional: the forecasts. Without history the snapshot uses the two-period comparison
        history["jobs"] = _raw("jobs_history", now.date(), lambda: jobs.collect_series(
            ref.job_terms, now.date(), progress=_log), force)
        history["research"] = _raw("research_history", now.date(), lambda: research.collect_series(
            ref.capabilities, now.date(), mailto=contact, api_key=openalex_key, progress=_log), force)
    except (httpx.HTTPError, KeyError, ValueError, RuntimeError) as error:
        _log(f"History incomplete, forecasting from what was collected ({_safe_error(error)})")
    _log("Building new snapshot")
    snapshot = builder.build(ref, baseline_snapshot(ref.snapshots), research_raw, jobs_raw, now, dosm_raw,
                             history or None, my_postings, labour_raw, role_postings, prices_raw,
                             attention_raw, local_research_raw, sector_raw, ref.role_sectors)
    review.save_pending(snapshot)
    _log(f"Saved {snapshot['snapshot_id']} for review. Users keep the current forecast until an admin approves it.")
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
