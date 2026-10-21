"""Build data/ai_exposure.json: published AI-exposure estimates for each role, how people use AI
for each O*NET task, and how Malaysians use AI, from three public sources.

    python scripts/build_ai_exposure.py path/to/aei_claude_ai_2026-06-26.csv

Sources (all free; licences in the output):
- Anthropic Economic Index (CC BY): labor_market_impacts/job_exposure.csv (observed exposure by
  SOC occupation) and a monthly release file (task-level automation vs augmentation, and Malaysia's
  usage). The release file is about 220 MB, so it is passed in as a path rather than downloaded:
  https://huggingface.co/datasets/Anthropic/EconomicIndex
- OpenAI "GPTs are GPTs" (Eloundou et al. 2023, MIT): data/occ_level.csv, the beta exposure rating.
- ILO Working Paper 140 (Gmyrek et al. 2025, CC BY 4.0): data/raw/ilo_wp140_table_a1.csv, written by
  extract_ilo_exposure.py.

Each score is also turned into a percentile among all occupations in its own source, because the
three use different scales; the app compares percentiles and ranks, never raw scores.
"""

import csv
import datetime as dt
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

import httpx

DATA = Path(__file__).resolve().parents[1] / "data"
AEI = "https://huggingface.co/datasets/Anthropic/EconomicIndex"
AEI_EXPOSURE = f"{AEI}/resolve/main/labor_market_impacts/job_exposure.csv"
OPENAI = "https://github.com/openai/GPTs-are-GPTs"
OPENAI_OCC = "https://raw.githubusercontent.com/openai/GPTs-are-GPTs/main/data/occ_level.csv"
ILO = "https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure"
COUNTRY = "MYS"
TOP_REQUESTS = 6


def percentile(value: float, population: list[float]) -> float:
    """Share of occupations scored lower, counting ties as half: 0 = least exposed, 100 = most."""
    below = sum(1 for v in population if v < value)
    ties = sum(1 for v in population if v == value)
    return round(100 * (below + ties / 2) / len(population), 1)


def _csv(url: str) -> list[dict]:
    response = httpx.get(url, follow_redirects=True, timeout=60)
    response.raise_for_status()
    return list(csv.DictReader(io.StringIO(response.text)))


def role_scores(codes: dict[str, dict]) -> dict[str, dict]:
    anthropic = {r["occ_code"]: (r["title"], float(r["observed_exposure"])) for r in _csv(AEI_EXPOSURE)}
    openai = {r["O*NET-SOC Code"]: (r["Title"], float(r["dv_rating_beta"])) for r in _csv(OPENAI_OCC)}
    with (DATA / "raw" / "ilo_wp140_table_a1.csv").open(encoding="utf-8") as f:
        ilo = {r["isco08"]: (r["occupation"], float(r["mean"]), r["gradient"]) for r in csv.DictReader(f)}
    population = {"anthropic": [s for _, s in anthropic.values()], "openai": [s for _, s in openai.values()],
                  "ilo": [s for _, s, _ in ilo.values()]}
    out: dict[str, dict] = {}
    for role_id, c in codes.items():
        entry = {}
        for source, table, key in (("anthropic", anthropic, c["soc"]), ("openai", openai, c["onet"]), ("ilo", ilo, c["isco08"])):
            if key and key in table:
                title, score, *extra = table[key]
                entry[source] = {"code": key, "occupation": title, "score": score,
                                 "percentile": percentile(score, population[source]),
                                 **({"gradient": extra[0]} if extra else {})}
        out[role_id] = entry
    return out, {k: len(v) for k, v in population.items()}


def release(path: str, task_ids: set[str]) -> dict:
    """Task-level collaboration (global) and Malaysia's usage, from one monthly release file."""
    latest: dict[tuple, tuple[str, float, str]] = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            geo, cat, level, metric = r["geo_id"], r["category_name"], r["hierarchy_level"], r["metric_id"]
            if geo not in ("GLOBAL", COUNTRY):
                continue
            keep = ((cat == "onet" and level == "0" and geo == "GLOBAL" and r["node_external_id"] in task_ids
                     and metric.startswith("collaboration_bucket_"))
                    or (cat == "soc_occupation" and level == "1" and metric in ("pct", "collaboration_bucket_automation_pct",
                                                                               "collaboration_bucket_augmentation_pct"))
                    or (cat == "request" and level == "2" and metric == "pct")
                    or (cat == "overall" and geo == COUNTRY and metric == "usage_per_capita_index"))
            if not keep:
                continue
            key = (geo, cat, r["node_external_id"], metric)
            if key not in latest or r["date_start"] > latest[key][0]:
                latest[key] = (r["date_start"], float(r["value"]), r["node_name"])
    month = max(v[0] for v in latest.values())[:7]

    def value(geo, cat, node, metric):
        hit = latest.get((geo, cat, node, metric))
        return hit[1] if hit else None

    tasks = {}
    for task_id in sorted(task_ids):
        auto = value("GLOBAL", "onet", task_id, "collaboration_bucket_automation_pct")
        aug = value("GLOBAL", "onet", task_id, "collaboration_bucket_augmentation_pct")
        if auto is not None and aug is not None:
            tasks[task_id] = {"automation_pct": auto, "augmentation_pct": aug}

    groups = {}
    names = {node: v[2] for (geo, cat, node, metric), v in latest.items() if cat == "soc_occupation"}
    for node, name in names.items():
        mys = value(COUNTRY, "soc_occupation", node, "pct")
        if mys is None:
            continue
        groups[node] = {"name": name, "mys_pct": mys, "global_pct": value("GLOBAL", "soc_occupation", node, "pct"),
                        "automation_pct": value(COUNTRY, "soc_occupation", node, "collaboration_bucket_automation_pct"),
                        "augmentation_pct": value(COUNTRY, "soc_occupation", node, "collaboration_bucket_augmentation_pct")}

    requests = []
    for (geo, cat, node, metric), (_, mys, name) in latest.items():
        if geo == COUNTRY and cat == "request":
            requests.append({"name": name, "mys_pct": mys, "global_pct": value("GLOBAL", "request", node, "pct")})
    requests.sort(key=lambda r: -r["mys_pct"])
    usage = [v for (geo, cat, node, metric), v in latest.items() if geo == COUNTRY and cat == "overall"]
    return {"month": month, "tasks": tasks,
            "malaysia": {"usage_index": usage[0][1] if usage else None, "groups": groups,
                         "requests": requests[:TOP_REQUESTS]}}


def main(release_path: str) -> None:
    codes = json.loads((DATA / "role_occupations.json").read_text(encoding="utf-8"))["roles"]
    tasks = json.loads((DATA / "tasks.json").read_text(encoding="utf-8"))
    task_ids = {t["id"].removeprefix("onet-") for r in tasks["roles"] for t in r["tasks"]}
    roles, counts = role_scores(codes)
    usage = release(release_path, task_ids)
    name = Path(release_path).name
    out = {
        "_note": "Built by scripts/build_ai_exposure.py. Scores are each source's own; percentiles are among all occupations in that source.",
        "built": dt.date.today().isoformat(),
        "sources": {
            "anthropic": {"name": "Anthropic Economic Index", "measure": "Observed exposure: how much of the occupation's work shows up in real Claude conversations",
                          "url": AEI, "file": "labor_market_impacts/job_exposure.csv", "licence": "CC BY", "occupations": counts["anthropic"]},
            "openai": {"name": "OpenAI, “GPTs are GPTs” (Eloundou et al., 2023)", "measure": "Share of tasks a language model could do at least twice as fast (β rating, 2023)",
                       "url": OPENAI, "file": "data/occ_level.csv", "licence": "MIT", "occupations": counts["openai"]},
            "ilo": {"name": "ILO Working Paper 140 (Gmyrek et al., 2025)", "measure": "Mean generative-AI exposure of the occupation's tasks, global index",
                    "url": ILO, "file": "Annex Table A1", "licence": "CC BY 4.0", "occupations": counts["ilo"]},
            "usage": {"name": "Anthropic Economic Index, monthly release", "url": AEI, "file": name, "month": usage["month"],
                      "licence": "CC BY"},
        },
        "roles": roles,
        "tasks": usage["tasks"],
        "malaysia": usage["malaysia"],
    }
    path = DATA / "ai_exposure.json"
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {path}: {len(roles)} roles, {len(usage['tasks'])} tasks, {len(usage['malaysia']['groups'])} Malaysian groups")


if __name__ == "__main__":
    main(sys.argv[1])
