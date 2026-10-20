"""Build data/tasks.json: each role's O*NET tasks with an automate / assist / human label (M4.3).

Task text is copied verbatim from the O*NET "Task Statements" file; which tasks to show and their
labels come from data/raw/onet_task_labels.json, which the team reviews. Download the file from
https://www.onetcenter.org/database.html (text version) and run:

    python scripts/build_tasks.py "path/to/Task Statements.txt"

Re-running keeps any `reviewed_by` already filled in tasks.json for an unchanged label.
"""

import argparse
import csv
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
LABELS = {"automate", "assist", "human"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_statements", type=Path)
    args = parser.parse_args()

    spec = json.loads((DATA_DIR / "raw" / "onet_task_labels.json").read_text(encoding="utf-8"))
    roles = {r["id"] for r in json.loads((DATA_DIR / "roles.json").read_text(encoding="utf-8"))}
    with args.task_statements.open(newline="", encoding="utf-8") as handle:
        onet = {(row["O*NET-SOC Code"], int(row["Task ID"])): row["Task"]
                for row in csv.DictReader(handle, delimiter="\t")}

    out_path = DATA_DIR / "tasks.json"
    previous = {}
    if out_path.exists():
        for role in json.loads(out_path.read_text(encoding="utf-8"))["roles"]:
            for t in role["tasks"]:
                previous[(role["role_id"], t["id"])] = t

    out = []
    for role_id, entry in spec["roles"].items():
        if role_id not in roles:
            raise SystemExit(f"Unknown role_id {role_id!r}")
        code, tasks = entry["onet_code"], []
        for t in entry["tasks"]:
            if t["label"] not in LABELS:
                raise SystemExit(f"{role_id}: label must be one of {sorted(LABELS)}")
            text = onet.get((code, t["task_id"]))
            if text is None:
                raise SystemExit(f"{role_id}: task {t['task_id']} not found for {code} in this O*NET file")
            task_id = f"onet-{t['task_id']}"
            old = previous.get((role_id, task_id), {})
            reviewed = old.get("reviewed_by") if old.get("label") == t["label"] else None
            tasks.append({"id": task_id, "text": text, "label": t["label"], "reason": t["reason"],
                          "reviewed_by": reviewed})
        out.append({"role_id": role_id, "onet_code": code, "onet_note": entry.get("onet_note"),
                    "tasks": tasks})

    out_path.write_text(json.dumps({
        "source": f"O*NET {spec['onet_version']} Database, Task Statements (U.S. Department of Labor/ETA, CC BY 4.0)",
        "source_url": "https://www.onetcenter.org/database.html",
        "labels_note": "automate / assist / human labels were drafted with AI assistance; a label counts as checked only when reviewed_by is filled.",
        "roles": out,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {sum(len(r['tasks']) for r in out)} tasks for {len(out)} roles to {out_path}")


if __name__ == "__main__":
    main()
