"""Human review of new trend snapshots before anyone sees them.

A refresh writes its snapshot to data/signals/pending/. Nothing changes for users until an admin
looks at the preview (which roles move, by how much) and approves it; approval moves the file
into data/signals/ with the reviewer's name and date. Rejected snapshots are kept in
data/signals/rejected/ with the reason, so every decision can be traced later.
"""

import datetime as dt
import json
import re
from pathlib import Path

from app.config import get_settings
from app.reference import get_reference, reload_reference
from app.services.scenario import outlook, signals_from_snapshot

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$")  # same rule as SnapshotIn


class NotFound(Exception):
    pass


def _folder(name: str) -> Path:
    path = get_settings().data_dir / "signals" / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def _pending_path(snapshot_id: str) -> Path:
    if not _ID.match(snapshot_id):
        raise NotFound(snapshot_id)
    path = _folder("pending") / f"{snapshot_id}.json"
    if not path.exists():
        raise NotFound(snapshot_id)
    return path


def save_pending(snapshot: dict) -> Path:
    path = _folder("pending") / f"{snapshot['snapshot_id']}.json"
    path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return path


def list_pending() -> list[dict]:
    """Snapshots waiting for review, newest first, without the per-role rows."""
    items = [json.loads(p.read_text(encoding="utf-8")) for p in _folder("pending").glob("*.json")]
    items.sort(key=lambda s: (s["imported"], s["snapshot_id"]), reverse=True)
    return [{k: v for k, v in s.items() if k not in ("signals", "skill_signals")} for s in items]


def preview(snapshot_id: str) -> dict:
    """What would change for users: each role's baseline-scenario outlook, live vs proposed."""
    proposed = json.loads(_pending_path(snapshot_id).read_text(encoding="utf-8"))
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


def approve(snapshot_id: str, reviewer: str) -> dict:
    path = _pending_path(snapshot_id)
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    snapshot["reviewed_by"] = reviewer
    snapshot["reviewed_at"] = dt.datetime.now().replace(microsecond=0).isoformat()
    target = get_settings().data_dir / "signals" / path.name
    target.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    path.unlink()
    reload_reference()
    return {"snapshot_id": snapshot_id, "reviewed_by": reviewer, "state": "approved"}


def reject(snapshot_id: str, reviewer: str, reason: str) -> dict:
    path = _pending_path(snapshot_id)
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    snapshot.update(rejected_by=reviewer, rejected_reason=reason,
                    rejected_at=dt.datetime.now().replace(microsecond=0).isoformat())
    (_folder("rejected") / path.name).write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    path.unlink()
    return {"snapshot_id": snapshot_id, "rejected_by": reviewer, "state": "rejected"}
