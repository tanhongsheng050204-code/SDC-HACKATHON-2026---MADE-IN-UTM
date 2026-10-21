"""Draft Bahasa Melayu and 中文 for every SDG reason in data/sdg_map.json (Phase 3, D1).

Each tag gets `reason_ms` and `reason_zh` next to its English `reason`. Gemini drafts them; the
output is committed and listed in REVIEW_LOG.md so a native speaker checks them. Needs
GEMINI_API_KEY in backend/.env.

    python scripts/build_sdg_translations.py           # only reasons without a translation yet
    python scripts/build_sdg_translations.py --force   # draft every reason again

Keeps the file's layout: one line per role or skill.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm import generate_json  # noqa: E402

PATH = Path(__file__).resolve().parents[1] / "data" / "sdg_map.json"
BATCH = 25
TIMEOUT_SECONDS = 90

PROMPT = """Translate each sentence into natural Bahasa Melayu (Malaysia) and Simplified Chinese (简体中文)
for a Malaysian career-guidance app. Keep the meaning exactly; keep "SDG" and numbers as they are.
Return JSON only: [{{"i": <the number>, "ms": "...", "zh": "..."}}, ...] with one item per sentence.

{items}"""


def write(data: dict) -> None:
    lines = ["{", f'  "_note": {json.dumps(data["_note"], ensure_ascii=False)},']
    for section in ("roles", "skills"):
        entries = [f'    {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in data[section].items()]
        lines.append(f'  "{section}": {{')
        lines.append(",\n".join(entries))
        lines.append("  }," if section == "roles" else "  }")
    lines.append("}")
    PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="draft every reason again")
    args = parser.parse_args()

    data = json.loads(PATH.read_text(encoding="utf-8"))
    tags = [t for section in ("roles", "skills") for tagged in data[section].values() for t in tagged
            if args.force or not (t.get("reason_ms") and t.get("reason_zh"))]
    reasons = list(dict.fromkeys(t["reason"] for t in tags))  # the same sentence is translated once
    print(f"{len(reasons)} reasons to translate")

    done: dict[str, dict] = {}
    for start in range(0, len(reasons), BATCH):
        batch = reasons[start:start + BATCH]
        items = "\n".join(f"{i}. {r}" for i, r in enumerate(batch, 1))
        out = generate_json(PROMPT.format(items=items), timeout_seconds=TIMEOUT_SECONDS)
        for item in out if isinstance(out, list) else []:
            i = item.get("i")
            ms, zh = str(item.get("ms") or "").strip(), str(item.get("zh") or "").strip()
            if isinstance(i, int) and 1 <= i <= len(batch) and ms and zh:
                done[batch[i - 1]] = {"reason_ms": ms, "reason_zh": zh}
        print(f"  {min(start + BATCH, len(reasons))} / {len(reasons)}")

    for t in tags:
        t.update(done.get(t["reason"], {}))
    write(data)
    missing = [r for r in reasons if r not in done]
    print(f"Wrote {PATH.name}: {len(done)} translated" + (f"; {len(missing)} missing, run again" if missing else ""))
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
