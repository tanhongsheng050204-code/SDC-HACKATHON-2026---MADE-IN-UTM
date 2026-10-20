"""Your job, task by task: a role's O*NET tasks labelled automate / assist / human.

The person ticks the tasks they actually do; the shares are over those tasks only (all tasks
if none are ticked). Labels are team-reviewed judgements, not predictions, and each carries a
reason. A role with no O*NET occupation gets no tasks rather than invented ones.
"""

from app.reference import Reference

LABELS = ("automate", "assist", "human")


def for_role(ref: Reference, role_id: str, done: set[str] | None = None) -> dict:
    entry = ref.tasks["roles"].get(role_id, {"onet_code": None, "onet_note": None, "tasks": []})
    tasks = entry["tasks"]
    counted = [t for t in tasks if t["id"] in done] if done else tasks
    shares = {label: round(sum(t["label"] == label for t in counted) / len(counted), 4) if counted else 0.0
              for label in LABELS}
    return {
        "role_id": role_id,
        "onet_code": entry["onet_code"],
        "onet_note": entry.get("onet_note"),
        "source": ref.tasks["source"],
        "source_url": ref.tasks["source_url"],
        "labels_note": ref.tasks["labels_note"],
        "tasks": tasks,
        "counted": len(counted),
        "shares": shares,
        "reviewed": sum(1 for t in tasks if t.get("reviewed_by")),
    }
