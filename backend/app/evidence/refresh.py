"""Run a skill-evidence search for every catalogue role, or an emerging-roles search for the AI
capabilities we track (app/evidence/emerging.py), in the background, for review.

Like the trend refresh: the admin button starts it, the UI polls progress, and each role's result
is saved as "pending". Nothing changes for users until a person approves a role. A role whose
search fails is reported and skipped; the rest still go to review.
"""

import datetime as dt
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from app import store
from app.evidence import emerging, search
from app.reference import get_reference
from app.trends.refresh import _safe_error

PARALLEL = 3  # grounded searches at once: about 25 s each, so 13 roles take about 2 minutes

_lock = threading.Lock()
_status: dict = {"state": "idle", "steps": [], "saved": [], "failed": [], "error": None}


def status() -> dict:
    with _lock:
        return {**_status, "steps": list(_status["steps"]), "saved": list(_status["saved"]),
                "failed": list(_status["failed"])}


def _log(message: str) -> None:
    with _lock:
        _status["steps"].append(message)


def run(role_ids: list[str] | None = None, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now().replace(microsecond=0)
    ref = get_reference()
    roles = [ref.roles[r] for r in (role_ids or list(ref.roles))]
    _log(f"Searching Malaysian job ads for {len(roles)} roles")
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        jobs = {pool.submit(search.search_role, role, ref.skills): role for role in roles}
        for job in as_completed(jobs):
            role = jobs[job]
            try:
                body = job.result()
            except Exception as error:  # one failed role does not stop the run
                with _lock:
                    _status["failed"].append(role["id"])
                _log(f"{role['title']}: search failed ({_safe_error(error)})")
                continue
            evidence_id = f"{now:%Y-%m-%d-%H%M%S}-{role['id']}"
            store.save_evidence(evidence_id, "role", role["id"], body)
            with _lock:
                _status["saved"].append(evidence_id)
            ads = sum(p["kind"] == "job_ad" for p in body["sources"])
            _log(f"{role['title']}: {ads} job ads, {len(body['sources']) - ads} other pages"
                 + (" (widened)" if body["widened"] else ""))
    _log("Saved for review. Users see no change until an admin approves a role.")
    return status()


def run_emerging(now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now().replace(microsecond=0)
    ref = get_reference()
    picked = emerging.candidates(ref)
    measured = picked and picked[0][1] is not None
    _log(f"Searching for emerging roles from {len(picked)} AI capabilities"
         + ("" if measured else " (no approved trend refresh yet, so research momentum is not measured)"))
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        jobs = {pool.submit(emerging.search_capability, cap, m, ref): cap for cap, m in picked}
        for job in as_completed(jobs):
            cap = jobs[job]
            try:
                body = job.result()
            except Exception as error:  # one failed capability does not stop the run
                with _lock:
                    _status["failed"].append(cap["id"])
                _log(f"{cap['name']}: nothing usable ({_safe_error(error)})")
                continue
            evidence_id = f"{now:%Y-%m-%d-%H%M%S}-emerging-{cap['id']}"
            store.save_evidence(evidence_id, "emerging", cap["id"], body)
            with _lock:
                _status["saved"].append(evidence_id)
            _log(f"{cap['name']}: {body['title']['en']} ({len(body['sources'])} sources)")
    _log("Saved for review. Nothing is shown until an admin approves a card.")
    return status()


def start(mode: str = "roles") -> bool:
    with _lock:
        if _status["state"] == "running":
            return False
        _status.update(state="running", steps=[], saved=[], failed=[], error=None)

    def work():
        try:
            run_emerging() if mode == "emerging" else run()
            with _lock:
                _status["state"] = "done"
        except Exception as error:
            with _lock:
                _status.update(state="failed", error=_safe_error(error))

    threading.Thread(target=work, daemon=True).start()
    return True
