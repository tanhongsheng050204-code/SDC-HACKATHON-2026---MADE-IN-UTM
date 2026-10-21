"""Where experts disagree: published AI-exposure estimates for a role, next to Laluan's own.

Three public studies score occupations on different scales (data/ai_exposure.json, built by
scripts/build_ai_exposure.py), so they are compared as percentiles among all occupations in each
study, and as ranks among Laluan's roles. Laluan's own estimate (automation_exposure in the
forecast) is a team judgement on its own scale, so it is compared by rank only.

This is display only: rankings still use Laluan's estimate. When Laluan ranks a role more than
TOLERANCE places away from every published study, the role is flagged for the team to review,
the same way trend updates wait for a person.
"""

from app.reference import Reference
from app.services.scenario import outlook, signals_from_snapshot

SOURCES = ("anthropic", "openai", "ilo")
TOLERANCE = 2  # places, among the compared roles


def _rank(values: dict[str, float]) -> dict[str, int]:
    """1 = most exposed; equal values share a rank."""
    return {k: 1 + sum(1 for other in values.values() if other > v) for k, v in values.items()}


def _compared(ref: Reference) -> list[str]:
    return [r for r in ref.roles if ref.ai_exposure["roles"].get(r)]


def ranks(ref: Reference) -> dict[str, dict[str, int]]:
    """Each source's rank of every compared role, plus Laluan's own."""
    compared = _compared(ref)
    scores = ref.ai_exposure["roles"]
    own = {s["role_id"]: s["automation_exposure"] for s in ref.latest_snapshot["signals"]}
    out = {"laluan": _rank({r: own[r] for r in compared if r in own})}
    for source in SOURCES:
        out[source] = _rank({r: scores[r][source]["percentile"] for r in compared if source in scores[r]})
    return out


def _malaysia(ref: Reference, role_id: str) -> dict | None:
    soc = ref.role_occupations[role_id]["soc"]
    group = ref.ai_exposure["malaysia"]["groups"].get(soc[:2]) if soc else None
    if not group:
        return None
    return {**group, "month": ref.ai_exposure["sources"]["usage"]["month"]}


def for_role(ref: Reference, role_id: str) -> dict:
    scores = ref.ai_exposure["roles"].get(role_id, {})
    meta = ref.ai_exposure["sources"]
    own = next(s for s in ref.latest_snapshot["signals"] if s["role_id"] == role_id)
    base = {"role_id": role_id, "title": ref.roles[role_id]["title"], "note": ref.role_occupations[role_id]["note"],
            "laluan": {"automation_exposure": own["automation_exposure"], "rank": None,
                       "source": f"Laluan team estimate ({ref.latest_snapshot['snapshot_id']})"},
            "malaysia": _malaysia(ref, role_id)}
    if not scores:
        return {**base, "compared": 0, "sources": [], "band": None, "flag": False}
    r = ranks(ref)
    compared = len(r["laluan"])
    sources = [{"id": s, "name": meta[s]["name"], "measure": meta[s]["measure"], "url": meta[s]["url"],
                "licence": meta[s]["licence"], "rank": r[s][role_id], **scores[s]}
               for s in SOURCES if s in scores]
    own_rank = r["laluan"][role_id]
    published = [s["rank"] for s in sources]
    flag = own_rank < min(published) - TOLERANCE or own_rank > max(published) + TOLERANCE
    percentiles = [s["percentile"] for s in sources]
    return {**base, "laluan": {**base["laluan"], "rank": own_rank}, "compared": compared, "sources": sources,
            "band": {"low": min(percentiles), "high": max(percentiles), "mean": round(sum(percentiles) / len(percentiles), 1)},
            "published_ranks": {"low": min(published), "high": max(published)}, "flag": flag}


def flagged(ref: Reference) -> list[str]:
    return [r for r in _compared(ref) if for_role(ref, r)["flag"]]


def map_points(ref: Reference, scenario_id: str = "baseline") -> dict:
    """Every role as a point: published exposure (mean percentile, with its range) against the
    2030 outlook in the chosen scenario. Roles no study covers are listed, not plotted."""
    signals = signals_from_snapshot(ref.latest_snapshot)
    adoption = float(ref.scenarios[scenario_id]["adoption"])
    points, missing = [], []
    for role_id, role in ref.roles.items():
        view = for_role(ref, role_id)
        if not view["band"]:
            missing.append({"role_id": role_id, "title": role["title"]})
            continue
        o = outlook(signals[role_id], scenario_id, adoption)
        points.append({"role_id": role_id, "title": role["title"], "exposure": view["band"], "outlook": o.index,
                       "label": o.label, "flag": view["flag"]})
    return {"scenario": scenario_id, "horizon_year": ref.latest_snapshot["horizon_year"], "points": points,
            "missing": missing, "sources": [ref.ai_exposure["sources"][s]["name"] for s in SOURCES]}


def malaysia_overview(ref: Reference) -> dict:
    usage = ref.ai_exposure["sources"]["usage"]
    data = ref.ai_exposure["malaysia"]
    return {"month": usage["month"], "usage_index": data["usage_index"], "requests": data["requests"],
            "source": usage["name"], "url": usage["url"], "licence": usage["licence"]}
