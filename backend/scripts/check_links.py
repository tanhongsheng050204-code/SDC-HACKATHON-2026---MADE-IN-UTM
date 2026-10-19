"""Open every course link in data/courses.json and record when it last worked (task 3.2).

A link counts as working when it returns HTTP 200 and the page title shares at least one word
with the course title or provider, so a redirect to a home or search page is caught. `checked`
is set to today's date for working links and to null for broken ones. A title mismatch (often
a bot wall) leaves `checked` unchanged for a person to confirm by hand. `reviewed_by` is left
for a person to fill after looking at the page.

    python scripts/check_links.py          # report and update courses.json
    python scripts/check_links.py --dry-run
"""

import argparse
import datetime as dt
import html
import json
import re
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "courses.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
STOP = {"and", "for", "the", "of", "to", "a", "in", "with", "on", "e", "path", "learning", "course", "courses"}


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 1 and w not in STOP}


def check(course: dict) -> tuple[bool, str]:
    request = urllib.request.Request(course["url"], headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            status, page = response.status, response.read(400_000).decode("utf-8", "replace")
    except Exception as error:  # noqa: BLE001 - any failure means the link does not work
        return False, f"error: {error}"
    match = re.search(r"<title[^>]*>([^<]*)", page, re.IGNORECASE)
    title = html.unescape(match.group(1)).strip() if match else ""
    if status != 200:
        return False, f"HTTP {status}"
    if title and not _words(title) & _words(course["title"] + " " + course["provider"]):
        return False, f"title does not match: {title!r}"
    return True, title or "(no title)"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    courses = json.loads(DATA.read_text(encoding="utf-8"))
    today = dt.date.today().isoformat()
    for course in courses:
        if not course["url"]:
            print(f"--  {course['id']}: no link")
            continue
        ok, detail = check(course)
        if ok:
            course["checked"] = today
        elif detail.startswith("title does not match"):
            detail += " (bot wall or different wording? open it by hand; `checked` left as it was)"
        else:
            course["checked"] = None
        print(f"{'ok' if ok else 'XX'}  {course['id']}: {detail}")
    if not args.dry_run:  # one course per line, as the file is written by hand
        lines = ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in courses)
        DATA.write_text(f"[\n{lines}\n]\n", encoding="utf-8")


if __name__ == "__main__":
    main()
