"""Skill-extraction recall on the synthetic CVs in data/eval (EVALUATION.md section 1).

Runs the same extraction the app uses (offline dictionary matching unless GEMINI_API_KEY is set)
on each CV, compares it with the skills a person marked in data/eval/person_marked.json and
prints a Markdown table to paste into docs/EVALUATION.md. CVs a person has not marked yet are
listed with the app's skills only.

    python scripts/eval_extraction.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.services import skills  # noqa: E402

EVAL_DIR = Path(__file__).resolve().parents[1] / "data" / "eval"


def main() -> None:
    marked = json.loads((EVAL_DIR / "person_marked.json").read_text(encoding="utf-8"))
    print(f"Extraction mode: {get_settings().llm_mode} · marked by: {marked.get('marked_by') or 'not yet'}\n")
    print("| CV | Skills a person found | Skills the app found | Both | Recall | Missed |")
    print("|---|---|---|---|---|---|")
    recalls = []
    for name, person in marked["cvs"].items():
        found = skills.extract((EVAL_DIR / name).read_text(encoding="utf-8"))["skills"]
        if not person:
            print(f"| {name} | (not marked yet) | {', '.join(found)} | | | |")
            continue
        both = sorted(set(person) & set(found))
        recall = len(both) / len(person)
        recalls.append(recall)
        missed = sorted(set(person) - set(found))
        print(f"| {name} | {', '.join(person)} | {', '.join(found)} | {len(both)} | {recall:.0%} | {', '.join(missed)} |")
    if recalls:
        print(f"\nAverage recall over {len(recalls)} marked CVs: {sum(recalls) / len(recalls):.0%} (target ≥ 80%)")


if __name__ == "__main__":
    main()
