"""Draft Bahasa Melayu and 中文 for the text in our reference data, into data/translations.json.

Covers what the app shows from the data files: role titles, families and summaries, skill names,
scenario names and descriptions, SDG goal names, AI capability names, skill-level names and
descriptions, and each role's O*NET tasks with their labels' reasons. The app looks each English
text up here (GET /api/translations) and shows English where a translation is missing.

Gemini drafts them; the output is committed and listed in REVIEW_LOG.md for a native speaker to
check. Needs GEMINI_API_KEY in backend/.env.

    python scripts/build_translations.py           # only texts without a translation yet
    python scripts/build_translations.py --force   # draft everything again
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm import generate_json  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "translations.json"
BATCH = 30
TIMEOUT_SECONDS = 120

PROMPT = """Translate each text into natural Bahasa Melayu (Malaysia) and Simplified Chinese (简体中文) for a
Malaysian career-guidance app. They are job titles, skill names, short descriptions and task
statements: keep them short and use the terms Malaysian job ads use. Keep product names (Excel,
Power BI, Python, SQL, Git, ESG, AI, UI, UX, MLOps) as they are.
Return JSON only: [{{"i": <the number>, "ms": "...", "zh": "..."}}, ...] with one item per text.

{items}"""


def _read(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def texts() -> list[str]:
    roles = _read("roles.json")
    out = [r["title"] for r in roles] + sorted({r["family"] for r in roles}) + [r["summary"] for r in roles]
    out += [s["name"] for s in _read("skills.json")]
    for s in _read("scenarios.json"):
        out += [s["label"], s["description"]]
    out += [g["name"] for g in _read("sdgs.json")]
    out += [c["name"] for c in _read("capabilities.json")["capabilities"]]
    for lv in _read("skill_levels.json"):
        out += [lv["name"], lv["description"]]
    for role in _read("tasks.json")["roles"]:
        for task in role["tasks"]:
            out += [task["text"], task["reason"]]
    return list(dict.fromkeys(t.strip() for t in out if t and t.strip()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="draft every text again")
    args = parser.parse_args()

    have = {} if args.force or not OUT.exists() else json.loads(OUT.read_text(encoding="utf-8"))["strings"]
    wanted = texts()
    todo = [t for t in wanted if t not in have]
    print(f"{len(wanted)} texts, {len(todo)} to translate")
    for start in range(0, len(todo), BATCH):
        batch = todo[start:start + BATCH]
        items = "\n".join(f"{i}. {t}" for i, t in enumerate(batch, 1))
        out = generate_json(PROMPT.format(items=items), timeout_seconds=TIMEOUT_SECONDS)
        for item in out if isinstance(out, list) else []:
            i = item.get("i")
            ms, zh = str(item.get("ms") or "").strip(), str(item.get("zh") or "").strip()
            if isinstance(i, int) and 1 <= i <= len(batch) and ms and zh:
                have[batch[i - 1]] = {"ms": ms, "zh": zh}
        print(f"  {min(start + BATCH, len(todo))} / {len(todo)}")

    strings = {t: have[t] for t in wanted if t in have}  # drop texts no longer in the data
    OUT.write_text(json.dumps({
        "note": ("AI-drafted (Gemini) BM and 中文 for the text in our reference data. A native speaker "
                 "checks them (REVIEW_LOG.md); the app shows English where a text is missing here."),
        "strings": strings,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = [t for t in wanted if t not in strings]
    print(f"Wrote {OUT.name}: {len(strings)} texts" + (f"; {len(missing)} missing, run again" if missing else ""))
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
