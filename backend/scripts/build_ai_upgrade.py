"""Draft data/ai_upgrade.json: for each role, the 2-4 AI skills that turn it into "<role>, AI-assisted".

Drawn only from our own data, by fixed rules, so the team can check every line:
- the skills boosted by the AI capabilities that expose or complement the role (capabilities.json),
  if they are AI skills or in a field the role already works in (no "API design" for a clerk);
- "Using generative AI tools" for every role;
- "Critical thinking" (checking what the AI produces) when AI is likely to automate 30%+ of the
  role's labelled O*NET tasks (tasks.json).
Skills the role already lists are left out, and every skill must have a course in the catalogue.
Roles that are AI jobs already (an AI skill among their core skills) get no AI-assisted version:
it would be the same job.
The team reviews the output and fills reviewed_by (REVIEW_LOG.md).

    python scripts/build_ai_upgrade.py
"""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
MAX_SKILLS = 4
AUTOMATE_SHARE = 0.3


def _read(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


# Skills every hands-on job lists; they do not make a nurse or a farm worker a "technical" worker.
CROSS_CUTTING = {"safety_compliance"}


def main() -> None:
    roles = _read("roles.json")
    capabilities = _read("capabilities.json")["capabilities"]
    tasks = {r["role_id"]: r["tasks"] for r in _read("tasks.json")["roles"]}
    taught = {s for c in _read("courses.json") for s in c["skills"]}
    category = {s["id"]: s["category"] for s in _read("skills.json")}
    previous = json.loads((DATA / "ai_upgrade.json").read_text(encoding="utf-8"))["roles"] if (DATA / "ai_upgrade.json").exists() else {}

    out = {}
    for role in roles:
        own = {rs["skill_id"] for rs in role["skills"]}
        fields = {category[s] for s in own - CROSS_CUTTING}
        picked: list[tuple[str, str]] = []
        if any(category[rs["skill_id"]] == "ai" and rs["weight"] == 3 for rs in role["skills"]):
            out[role["id"]] = {"ai_skills": [], "reviewed_by": None, "note": "Already an AI job."}
            continue

        def add(skill: str, why: str) -> None:
            if skill in taught and skill not in own and skill not in [s for s, _ in picked]:
                picked.append((skill, why))

        add("genai_tools", "Every role uses generative AI tools for drafting, summarising and searching.")
        for cap in capabilities:
            link = "exposes" if role["id"] in cap["exposes_roles"] else "complements" if role["id"] in cap["complements_roles"] else None
            if link:
                for skill in (s for s in cap["boosts_skills"] if category[s] == "ai" or category[s] in fields):
                    add(skill, f"{cap['name']} {'changes' if link == 'exposes' else 'supports'} this work; this skill lets you run it.")
        labelled = tasks.get(role["id"], [])
        if labelled and sum(t["label"] == "automate" for t in labelled) / len(labelled) >= AUTOMATE_SHARE:
            add("critical_thinking", "AI is likely to automate a good share of these tasks, so checking and correcting its output becomes part of the job.")
        if len(picked) < 2:
            add("prompt_engineering", "Writing clear instructions and simple AI workflows for your own tasks.")
        old = previous.get(role["id"], {})
        skills = [{"skill_id": s, "why": why} for s, why in picked[:MAX_SKILLS]]
        unchanged = [s["skill_id"] for s in old.get("ai_skills", [])] == [s["skill_id"] for s in skills]
        out[role["id"]] = {"ai_skills": skills, "reviewed_by": old.get("reviewed_by") if unchanged else None}

    (DATA / "ai_upgrade.json").write_text(json.dumps({
        "note": ("AI skills that turn each role into '<role>, AI-assisted', drafted by scripts/build_ai_upgrade.py "
                 "from capabilities.json and tasks.json. Team: check each line and fill reviewed_by (REVIEW_LOG.md)."),
        "roles": out,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for role_id, entry in out.items():
        print(f"{role_id}: {', '.join(s['skill_id'] for s in entry['ai_skills'])}")


if __name__ == "__main__":
    main()
