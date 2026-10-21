"""Your job, task by task: a role's O*NET tasks labelled automate / assist / human.

The person ticks the tasks they actually do; the shares are over those tasks only (all tasks
if none are ticked). Labels are team-reviewed judgements, not predictions, and each carries a
reason. A role with no O*NET occupation gets no tasks rather than invented ones.

Where the Anthropic Economic Index has the task, each also carries how people use AI for it in
practice: the share of conversations where the AI does the task (automation) or helps the person
do it (augmentation). That is observed use, separate from the team's label.
"""

from app.reference import Reference

LABELS = ("automate", "assist", "human")


def for_role(ref: Reference, role_id: str, done: set[str] | None = None) -> dict:
    entry = ref.tasks["roles"].get(role_id, {"onet_code": None, "onet_note": None, "tasks": []})
    observed = ref.ai_exposure["tasks"]
    tasks = [{**t, "observed": observed.get(t["id"].removeprefix("onet-"))} for t in entry["tasks"]]
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
        "observed_source": {k: ref.ai_exposure["sources"]["usage"][k] for k in ("name", "url", "month", "licence")},
    }
