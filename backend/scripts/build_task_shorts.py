"""Draft a short title and a short reason for each O*NET task in data/tasks.json.

The task screen shows these first ("Take payments" / "Self-checkout and e-wallets") and keeps the
full O*NET statement and reason behind "Why?". Gemini drafts them; the full text stays the source,
and the team checks the short forms with the labels (REVIEW_LOG.md). BM and 中文 come from
build_translations.py afterwards. Needs GEMINI_API_KEY in backend/.env.

    python scripts/build_task_shorts.py           # only tasks without a short title yet
    python scripts/build_task_shorts.py --force   # draft everything again
    python scripts/build_translations.py          # then translate the new texts
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm import generate_json  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
PATH = DATA / "tasks.json"
BATCH = 25
TIMEOUT_SECONDS = 120
MAX_SHORT_WORDS = 6
MAX_REASON_WORDS = 9

PROMPT = """Each item is a task from a job description, the job it belongs to, and why AI is likely to
automate it, assist with it, or leave it to a person. For a Malaysian worker reading on a phone,
write:
- "short": the task in 2-5 plain words, starting with a verb, like a button label
  ("Take payments", "Count the cash drawer", "Greet customers"). No jargon, no full stop.
- "short_reason": the reason in 3-8 plain words, naming the tool or the human quality
  ("Barcode scanners do this", "Till checks policy, you check items", "Warmth needs a person").
  No full stop.
Return JSON only: [{{"i": <the number>, "short": "...", "short_reason": "..."}}, ...] with one item per task.

{items}"""


def _ok(text: str, max_words: int) -> bool:
    return 0 < len(text.split()) <= max_words


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="draft every task again")
    args = parser.parse_args()

    data = json.loads(PATH.read_text(encoding="utf-8"))
    todo = [(role["role_id"], t) for role in data["roles"] for t in role["tasks"] if args.force or not t.get("short")]
    print(f"{len(todo)} tasks to shorten")
    for start in range(0, len(todo), BATCH):
        batch = todo[start:start + BATCH]
        items = "\n".join(f'{i}. Job: {role_id.replace("_", " ")} | Task: {t["text"]} | Label: {t["label"]} | Reason: {t["reason"]}'
                          for i, (role_id, t) in enumerate(batch, 1))
        out = generate_json(PROMPT.format(items=items), timeout_seconds=TIMEOUT_SECONDS)
        for item in out if isinstance(out, list) else []:
            i = item.get("i")
            short = str(item.get("short") or "").strip().rstrip(".")
            reason = str(item.get("short_reason") or "").strip().rstrip(".")
            if isinstance(i, int) and 1 <= i <= len(batch) and _ok(short, MAX_SHORT_WORDS) and _ok(reason, MAX_REASON_WORDS):
                batch[i - 1][1].update(short=short, short_reason=reason)
        print(f"  {min(start + BATCH, len(todo))} / {len(todo)}")

    PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    missing = sum(1 for role in data["roles"] for t in role["tasks"] if not t.get("short"))
    print(f"Wrote {PATH.name}" + (f"; {missing} tasks still without a short title, run again" if missing else ""))
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
