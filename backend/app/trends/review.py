"""Human review of new trend snapshots before anyone sees them.

A refresh saves its snapshot as "pending". Nothing changes for users until an admin looks at the
preview (which roles move, by how much) and approves it; approval stamps the reviewer's name and
date and makes it the live forecast. Rejected snapshots are kept with the reason, so every decision
can be traced later. All of it lives in the database (app/store.py), so a redeploy keeps it.
"""

import datetime as dt
import re

from app import store
from app.reference import get_reference, reload_reference
from app.services.scenario import outlook, signals_from_snapshot

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")  # same rule as SnapshotIn


class NotFound(Exception):
    pass


def _pending(snapshot_id: str) -> dict:
    if not _ID.match(snapshot_id):
        raise NotFound(snapshot_id)
    stored = store.get_snapshot(snapshot_id)
    if stored is None or stored["state"] != "pending":
        raise NotFound(snapshot_id)
    return stored["body"]


def save_pending(snapshot: dict) -> str:
    store.save_snapshot(snapshot, "pending")
    return snapshot["snapshot_id"]


def list_pending() -> list[dict]:
    """Snapshots waiting for review, newest first, without the per-role rows."""
    items = store.list_snapshots("pending")
    items.sort(key=lambda s: (s["imported"], s["snapshot_id"]), reverse=True)
    return [{k: v for k, v in s.items() if k not in ("signals", "skill_signals")} for s in items]


def preview(snapshot_id: str) -> dict:
    """What would change for users: each role's baseline-scenario outlook, live vs proposed."""
    proposed = _pending(snapshot_id)
    ref = get_reference()
    live = ref.latest_snapshot
    adoption = float(ref.scenarios["baseline"]["adoption"])
    before = signals_from_snapshot(live)
    after = signals_from_snapshot(proposed)
    roles = []
    for role_id, signal in after.items():
        new = outlook(signal, "baseline", adoption)
        old = outlook(before[role_id], "baseline", adoption) if role_id in before else None
        roles.append({
            "role_id": role_id, "title": ref.roles[role_id]["title"] if role_id in ref.roles else role_id,
            "before": old.index if old else None, "after": new.index,
            "label_before": old.label if old else None, "label_after": new.label,
            "change": round(new.index - old.index, 1) if old else None,
        })
    roles.sort(key=lambda r: -abs(r["change"] or 0))
    skills = proposed.get("skill_signals", [])
    return {
        "snapshot_id": proposed["snapshot_id"], "imported": proposed["imported"],
        "live_snapshot_id": live["snapshot_id"], "inputs": proposed.get("inputs", []),
        "roles": roles,
        "skills": {label: sum(1 for s in skills if s["label"] == label)
                   for label in ("rising", "steady", "declining", "no_data")},
    }


def _stamp() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def approve(snapshot_id: str, reviewer: str) -> dict:
    snapshot = _pending(snapshot_id)
    snapshot["reviewed_by"] = reviewer
    snapshot["reviewed_at"] = _stamp()
    store.decide_snapshot(snapshot_id, "approved", reviewer, snapshot)
    reload_reference()
    return {"snapshot_id": snapshot_id, "reviewed_by": reviewer, "state": "approved"}


def reject(snapshot_id: str, reviewer: str, reason: str) -> dict:
    snapshot = _pending(snapshot_id)
    snapshot.update(rejected_by=reviewer, rejected_reason=reason, rejected_at=_stamp())
    store.decide_snapshot(snapshot_id, "rejected", reviewer, snapshot, reason)
    return {"snapshot_id": snapshot_id, "rejected_by": reviewer, "state": "rejected"}
