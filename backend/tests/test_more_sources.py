"""The five sources added in the second round: developer attention, Malaysian research and sectors.

Each is optional and fails soft, so the tests also pin that a missing source cannot look like a
zero and cannot silently change a score beyond its cap.
"""

import copy
import datetime as dt

import httpx

from app import store
from app.reference import get_reference, reload_reference
from app.services import matching, xray
from app.trends import attention, builder, research, sector

TODAY = dt.date(2026, 10, 23)
collect_attention = attention.collect  # the real ones, before the offline fixtures patch them
collect_malaysia = research.collect_malaysia


def _counts(**values: tuple[int, int]) -> dict[str, dict]:
    return {skill: {"recent": recent, "prior": prior, "terms": [skill]}
            for skill, (recent, prior) in values.items()}


def test_attention_is_relative_to_the_median_skill():
    """A platform-wide rise must score 0; only outgrowing the others counts."""
    counts = {"stackoverflow": _counts(a=(200, 100), b=(200, 100), c=(200, 100), d=(400, 100))}
    out = attention.summarise(counts, TODAY)
    assert out["momentum"]["stackoverflow"]["a"] == 0.0
    assert out["momentum"]["stackoverflow"]["d"] > 0.95  # doubled, close to the +1 cap
    assert out["attention"]["a"]["label"] == "steady"


def test_attention_needs_enough_volume_and_a_prior_year():
    counts = {"stackoverflow": _counts(a=(20, 10), b=(20, 10), c=(20, 10))}  # 30 mentions, below 50
    out = attention.summarise(counts, TODAY)
    assert out["momentum"]["stackoverflow"] == {} and out["attention"] == {}


def test_attention_combines_sources_and_keeps_each_reading():
    counts = {"stackoverflow": _counts(a=(100, 100), b=(100, 100), c=(100, 100), d=(300, 100)),
              "npm": _counts(a=(200_000, 200_000), b=(200_000, 200_000), c=(200_000, 200_000),
                             d=(600_000, 200_000))}
    out = attention.summarise(counts, TODAY)
    assert set(out["attention"]["d"]["readings"]) == {"stackoverflow", "npm"}
    assert all(v > 0.95 for v in out["attention"]["d"]["readings"].values())
    assert out["attention"]["d"]["value"] > 0.95
    assert out["attention"]["a"]["readings"] == {"stackoverflow": 0.0, "npm": 0.0}


def _transport(request: httpx.Request) -> httpx.Response:
    if "stackexchange" in request.url.host:
        tag = request.url.params.get("tagged")
        total = {"python": 900, "sql": 600, "excel": 300}[tag]
        recent = int(request.url.params["fromdate"]) > 1_750_000_000
        return httpx.Response(200, json={"total": total if recent else total // 2})
    if "github" in request.url.host:
        return httpx.Response(200, json={"total_count": 40})
    if "npmjs" in request.url.host:
        return httpx.Response(200, json={"downloads": [{"downloads": 150_000, "day": "2026-01-01"}]})
    if "pypistats" in request.url.host:
        return httpx.Response(200, json={"data": [
            {"category": "without_mirrors", "date": "2026-10-01", "downloads": 60_000},
            {"category": "without_mirrors", "date": "2026-05-01", "downloads": 40_000}]})
    return httpx.Response(404)


def test_attention_collect_reads_all_four_sources():
    mapping = {"python": {"stackoverflow": ["python"], "npm": ["typescript"]},
               "sql": {"stackoverflow": ["sql"], "pypi": ["statsmodels"]},
               "excel": {"stackoverflow": ["excel"], "github": ["excel"]}}
    client = httpx.Client(transport=httpx.MockTransport(_transport))
    out = collect_attention(mapping, TODAY, client=client, sleep=lambda _: None)
    assert out["unavailable"] == []
    assert out["counts"]["stackoverflow"]["python"]["recent"] == 900
    assert out["counts"]["npm"]["python"]["recent"] == 150_000
    assert out["counts"]["pypi"]["sql"]["recent"] == 60_000
    assert out["counts"]["github"]["excel"]["recent"] == 40
    assert set(out["attention"]) == {"python", "sql", "excel"}


def test_a_rate_limited_github_is_dropped_whole_not_half():
    def limited(request: httpx.Request) -> httpx.Response:
        if "github" in request.url.host:
            return httpx.Response(403, json={"message": "rate limit"})
        return _transport(request)

    mapping = {"python": {"stackoverflow": ["python"], "github": ["python"]},
               "sql": {"stackoverflow": ["sql"]}, "excel": {"stackoverflow": ["excel"]}}
    client = httpx.Client(transport=httpx.MockTransport(limited))
    out = collect_attention(mapping, TODAY, client=client, sleep=lambda _: None)
    assert out["counts"]["github"] == {} and any("GitHub" in u for u in out["unavailable"])
    assert out["counts"]["stackoverflow"]["python"]["recent"] == 900  # the other sources still count


def _sector_rows() -> list[dict]:
    """Eleven years of shares, with a real five-year gap between 2020 and 2025."""
    known = {2015: (12.0, 28.0, 60.0), 2020: (9.9, 26.5, 63.6), 2025: (8.9, 26.1, 65.0)}
    rows = []
    for year in range(2015, 2026):
        agri, industry, services = known.get(year, known[2020])
        for name, value in (("agriculture", agri), ("industry", industry), ("services", services)):
            rows.append({"sex": "both", "date": f"{year}-01-01", "sector": name, "proportion": value})
        rows.append({"sex": "male", "date": f"{year}-01-01", "sector": "services", "proportion": 1.0})
    return rows


def test_sector_points_follow_the_five_year_shift():
    out = sector.summarise(_sector_rows(), TODAY)
    assert out["years"] == [2020, 2025]
    assert out["shares"]["services"]["change_pp"] == 1.4
    assert out["points"]["services"] == round(1.4 * sector.SCALE, 1)
    assert out["points"]["agriculture"] == -round(1.0 * sector.SCALE, 1)
    assert out["series"][-1]["services"] == 65.0


def test_sector_points_are_capped():
    rows = _sector_rows()
    for row in rows:
        if row["sector"] == "services" and row["date"].startswith("2025") and row["sex"] == "both":
            row["proportion"] = 90.0
    out = sector.summarise(rows, TODAY)
    assert out["points"]["services"] == sector.SECTOR_CAP


def test_malaysian_research_only_counts_papers_with_a_malaysian_institution():
    seen = {}

    def transport(request: httpx.Request) -> httpx.Response:
        seen["filter"] = request.url.params.get("filter")
        return httpx.Response(200, json={"meta": {"count": 7}})

    client = httpx.Client(transport=httpx.MockTransport(transport))
    out = collect_malaysia(get_reference().capabilities[:2], TODAY, client=client)
    assert "institutions.country_code:MY" in seen["filter"]
    assert out["counts"]["document_understanding"] == {"recent": 7, "prior": 7}
    assert "Malaysian" in out["source"]


def _research(counts: dict | None = None) -> dict:
    return {"source": "test", "source_url": "x", "retrieved": str(TODAY),
            "windows": {"recent": ["2026-01-01", "2026-06-01"], "prior": ["2025-01-01", "2025-06-01"]},
            "queries": {}, "counts": counts or {c["id"]: {"recent": 100, "prior": 100}
                                               for c in get_reference().capabilities}}


def _jobs() -> dict:
    return {"source": "test postings", "source_url": "y", "retrieved": str(TODAY),
            "threads": {"recent": [{"title": "a"}], "prior": [{"title": "b"}]},
            "postings": {"recent": 100, "prior": 100},
            "mentions": {skill: {"recent": 20, "prior": 20} for skill in get_reference().job_terms}}


def test_malaysian_research_moves_exposed_and_complemented_roles_apart():
    ref = get_reference()
    local = _research()
    local["counts"]["llm_agents"] = {"recent": 400, "prior": 100}  # Malaysia works on it, fast
    snap = builder.build(ref, ref.snapshots[-1], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0),
                         local_research=local, role_sectors=ref.role_sectors)
    rows = {s["role_id"]: s for s in snap["signals"]}
    assert rows["data_analyst"]["local_ai_points"] < 0  # llm_agents exposes it
    assert rows["ai_ml_engineer"]["local_ai_points"] > 0  # and complements it
    assert all(abs(r["local_ai_points"]) <= builder.LOCAL_AI_CAP for r in rows.values())
    assert snap["malaysian_research"]["momentum"]["llm_agents"] > 0


def test_sector_points_reach_the_roles_that_share_the_sector():
    ref = get_reference()
    fake = {"source": "test sectors", "source_url": "x", "retrieved": str(TODAY), "years": [2020, 2025],
            "shares": {}, "points": {"agriculture": -2.0, "industry": -0.8, "services": 2.8}, "series": []}
    snap = builder.build(ref, ref.snapshots[-1], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0),
                         sector=fake, role_sectors=ref.role_sectors)
    rows = {s["role_id"]: s for s in snap["signals"]}
    assert rows["data_entry_clerk"]["sector_points"] == 2.8  # services
    assert rows["farm_worker"]["sector_points"] == -2.0  # agriculture
    assert rows["production_operator"]["sector_points"] == -0.8  # industry
    assert "Malaysian sector +2.8" in rows["data_entry_clerk"]["note"]


def test_attention_nudges_a_skill_that_already_has_a_trend():
    ref = get_reference()
    fake = {"source": "test attention", "source_url": "x", "retrieved": str(TODAY), "windows": {},
            "unavailable": [], "attention": {
                "sql": {"value": 1.0, "label": "rising", "readings": {"stackoverflow": 1.0}},
                "patient_care": {"value": 1.0, "label": "rising", "readings": {"stackoverflow": 1.0}}}}
    plain = builder.build(ref, ref.snapshots[-1], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0))
    with_attention = builder.build(ref, ref.snapshots[-1], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0),
                                    attention=fake)
    before = {s["skill_id"]: s for s in plain["skill_signals"]}
    after = {s["skill_id"]: s for s in with_attention["skill_signals"]}
    assert after["sql"]["trend"] > before["sql"]["trend"]
    assert any("Developer attention" in source for source in after["sql"]["sources"])
    # patient_care has no postings trend in this run, so attention alone must not invent one
    assert after["patient_care"]["trend"] is None and after["patient_care"]["label"] == "no_data"


def test_xray_shows_the_sector_and_malaysian_research_steps(client):
    ref = get_reference()
    live = copy.deepcopy(ref.latest_snapshot)
    live.update(snapshot_id="2099-04-01-trend-test", imported="2099-04-01",
                baseline_snapshot_id=ref.latest_snapshot["snapshot_id"])
    for s in live["signals"]:
        base = s["net_growth_pct"]
        s.update(baseline_growth_pct=base, demand_points=0.0, local_points=0.0, sector_points=-2.0,
                 market_points=0.0, openings_points=0.0, local_ai_points=1.5, ai_points=0.0,
                 net_growth_pct=round(base - 0.5, 1))
    store.save_snapshot(live, "approved")
    ref = reload_reference()
    steps = xray.explain(ref, "data_entry_clerk", "baseline", None)["steps"]
    labels = [s["label"] for s in steps]
    assert labels[1:8] == ["Job-posting demand", "Malaysian employment", "Malaysian sector shift",
                           "Malaysian labour market", "Live postings for this role",
                           "Malaysian AI research", "AI research momentum"]
    assert steps[3]["value"] == -2.0 and steps[3]["cap"] == "±4 points"
    assert steps[6]["value"] == 1.5 and steps[6]["cap"] == "±5 points"
    ranked = next(r for r in matching.match(ref, {"skills": ["data_entry", "excel"]}, "baseline")["roles"]
                  if r["role_id"] == "data_entry_clerk")
    assert steps[-1]["running_total"] == ranked["outlook"]["baseline"]["index"]


def test_every_role_has_a_sector_and_every_skill_source_exists():
    ref = get_reference()
    assert set(ref.role_sectors) == set(ref.roles)
    assert set(ref.role_sectors.values()) <= set(sector.SECTORS)
    assert set(ref.skill_sources) <= set(ref.skills)
    for skill, spec in ref.skill_sources.items():
        assert spec and set(spec) <= {"stackoverflow", "github", "npm", "pypi"}, skill


def test_source_line_lists_each_source_once():
    """Nine sources must read as a list, not an 'and ... and ...' chain, and never repeat one."""
    assert builder._adjusted_by(["a", "b", "c"]) == "a, b and c"
    assert builder._adjusted_by(["a", "a", "b"]) == "a and b"
    assert builder._adjusted_by(["only"]) == "only"
    assert builder._adjusted_by([]) == ""
    line = builder._adjusted_by(["arxiv research momentum", "freehire.me Malaysian job postings",
                                 "freehire.me Malaysian job postings (role searches)"])
    assert line == ("arxiv research momentum, freehire.me Malaysian job postings "
                    "and freehire.me Malaysian job postings (role searches)")
    assert line.count(" and ") == 1  # one join at the end, not one between every pair
