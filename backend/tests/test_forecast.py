import datetime as dt
import math

import httpx
import pytest

from app import store
from app.reference import get_reference
from app.trends import builder, dosm, forecast, jobs, research
from tests.test_trends import ADMIN, CLERK, TODAY, _refresh, data_copy, fake_dosm, fake_jobs, fake_research  # noqa: F401

# Taken before the conftest fixture swaps them for offline stand-ins.
REAL_JOBS_SERIES = jobs.collect_series
REAL_RESEARCH_SERIES = research.collect_series
SCENARIOS = [{"id": "slow", "adoption": 0.5}, {"id": "baseline", "adoption": 1.0},
             {"id": "accelerated", "adoption": 1.6}]
PERIODS = [f"{y}Q{q}" for y in (2023, 2024, 2025) for q in (1, 2, 3, 4)]


def jobs_series(shares: dict[str, list[float]], postings: int = 1000) -> dict:
    """Quarterly history where each skill's share of postings follows the given list."""
    return {"source": "test postings", "source_url": "y", "retrieved": str(TODAY), "threads": 36,
            "periods": PERIODS, "postings": dict.fromkeys(PERIODS, postings),
            "mentions": {skill: {p: round(v * postings) for p, v in zip(PERIODS, values, strict=True)}
                         for skill, values in shares.items()}}


def research_series(growth: dict[str, float] | None = None) -> dict:
    """Every capability flat at 100 papers a quarter, except those given (yearly growth factor)."""
    counts = {}
    for c in get_reference().capabilities:
        g = (growth or {}).get(c["id"], 1.0)
        counts[c["id"]] = {p: round(100 * g ** (i / 4)) for i, p in enumerate(PERIODS)}
    return {"source": "openalex", "source_url": "x", "retrieved": str(TODAY), "periods": PERIODS,
            "queries": {}, "counts": counts}


def grows(start: float, yearly: float) -> list[float]:
    return [start * yearly ** (i / 4) for i in range(len(PERIODS))]


def test_fit_recovers_a_clean_trend():
    points = [(2020 + i, math.log(2) * i) for i in range(6)]
    _, slope, se = forecast.fit(points)
    assert slope == pytest.approx(math.log(2)) and se == pytest.approx(0, abs=1e-9)


def test_damped_trend_fades_instead_of_growing_for_ever():
    assert forecast.damped(0) == 0
    assert forecast.damped(1) == pytest.approx(forecast.DAMPING)
    assert forecast.damped(100) == pytest.approx(forecast.DAMPING / (1 - forecast.DAMPING))


def test_noisy_trends_are_shrunk_towards_no_change():
    clean = [(2023 + i / 4, 0.1 * i / 4) for i in range(12)]
    noisy = [(t, y + (1.0 if i % 2 else -1.0)) for i, (t, y) in enumerate(clean)]
    assert forecast.trend(clean)[2] == pytest.approx(0.1)
    assert 0 < forecast.trend(noisy)[2] < forecast.fit(noisy)[1] / 2


def test_band_is_only_sure_when_the_whole_range_agrees():
    sure = forecast.band(math.log(2), 0.01)
    assert sure["label"] == "rising" and sure["sure"] and sure["low_pct"] < sure["change_pct"] < sure["high_pct"]
    unsure = forecast.band(math.log(1.3), 0.5)
    assert unsure["label"] == "rising" and not unsure["sure"]
    assert forecast.band(0.0, 0.01)["label"] == "steady"


def test_growing_share_is_forecast_rising_and_shrinking_share_declining():
    series = jobs_series({"python": grows(0.10, 1.25), "excel": grows(0.10, 0.75)})
    up = forecast.skill_forecast("python", [], series, {}, SCENARIOS, 2030)
    down = forecast.skill_forecast("excel", [], series, {}, SCENARIOS, 2030)
    assert up["scenarios"]["baseline"]["label"] == "rising" and up["scenarios"]["baseline"]["sure"]
    assert down["scenarios"]["baseline"]["label"] == "declining"
    assert up["growth_per_year"] == pytest.approx(math.log(1.25), rel=0.05)
    assert up["history"][0] == {"period": "2023Q1", "share_pct": 10.05}


def test_accelerating_growth_is_emerging_and_steady_growth_is_not():
    early, late = grows(0.02, 1.05)[:6], [0.02 * 1.05 ** 1.5 * 1.6 ** (i / 4) for i in range(1, 7)]
    series = jobs_series({"genai_tools": early + late, "python": grows(0.10, 1.25)})
    assert forecast.skill_forecast("genai_tools", [], series, {}, SCENARIOS, 2030)["emerging"]
    assert not forecast.skill_forecast("python", [], series, {}, SCENARIOS, 2030)["emerging"]


def test_faster_ai_adoption_widens_the_gap_for_skills_ai_automates():
    caps = get_reference().capabilities
    trends = forecast.capability_trends(research_series({"document_understanding": 2.0}))
    series = jobs_series({"data_entry": [0.05] * 12})
    f = forecast.skill_forecast("data_entry", caps, series, trends, SCENARIOS, 2030)["scenarios"]
    assert f["accelerated"]["change_pct"] < f["baseline"]["change_pct"] < f["slow"]["change_pct"] < 0


def test_no_job_data_and_no_accelerating_capability_means_no_forecast():
    trends = forecast.capability_trends(research_series())
    assert forecast.skill_forecast("patient_care", get_reference().capabilities, jobs_series({}),
                                   trends, SCENARIOS, 2030) is None


def test_partial_quarters_at_the_ends_are_left_out():
    series = jobs_series({"python": [0.1] * 12})
    series["postings"]["2023Q1"] = 200  # one thread instead of three
    assert forecast.complete_periods(series) == PERIODS[1:]


def test_group_forecast_projects_a_shrinking_share_of_employees():
    series = {"overall": {str(y): 1000.0 for y in range(2018, 2026)},
              "groups": {"4": {str(y): 150.0 * 0.9 ** (y - 2018) for y in range(2018, 2026)}}}
    f = forecast.group_forecast(series, "4", 2030)
    assert f["label"] == "declining" and f["history"][0] == {"period": "2018", "share_pct": 15.0}
    assert forecast.group_forecast(series, "9", 2030) is None


def test_backtest_reports_direction_and_size_against_simple_guesses():
    series = jobs_series({"python": grows(0.10, 1.3), "excel": grows(0.10, 0.7), "sql": [0.1] * 12})
    result = forecast.backtest(series, ["python", "excel", "sql"])
    assert result["skills_checked"] == 3 and result["clear_trends"] == 2 and result["direction_right"] == 2
    assert result["always_rising_right"] == 1
    assert result["model_error"] < result["no_change_error"]


def test_builder_uses_forecasts_when_history_is_given():
    ref = get_reference()
    history = {"jobs": jobs_series({"sql": grows(0.08, 1.4)}), "research": research_series()}
    base = next(s for s in ref.snapshots if s.get("kind") != "trend-adjusted")
    raw_dosm = fake_dosm() | {"series": {"overall": {str(y): 1000.0 for y in range(2018, 2026)},
                                         "groups": {g: {str(y): 100.0 for y in range(2018, 2026)}
                                                    for g in dosm.MASCO.values()}}}
    snap = builder.build(ref, base, fake_research(), fake_jobs(), dt.datetime(2026, 10, 19), raw_dosm, history)
    sql = next(s for s in snap["skill_signals"] if s["skill_id"] == "sql")
    assert sql["label"] == "rising" and sql["forecast"]["scenarios"]["baseline"]["sure"]
    assert sql["sources"][0].startswith("Forecast to 2030")
    assert snap["forecast"]["history"]["jobs"]["periods"] == ["2023Q1", "2025Q4"]
    assert snap["forecast"]["backtest"]["skills_checked"] == 1
    clerk = next(r for r in snap["signals"] if r["role_id"] == "data_entry_clerk")
    assert clerk["malaysia_forecast"]["label"] == "steady" and clerk["local_points"] == 0


def test_without_history_the_two_period_comparison_stays():
    ref = get_reference()
    base = next(s for s in ref.snapshots if s.get("kind") != "trend-adjusted")
    snap = builder.build(ref, base, fake_research(), fake_jobs(), dt.datetime(2026, 10, 19))
    assert "forecast" not in snap and all("forecast" not in s for s in snap["skill_signals"])


def _hn(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("search_by_date"):
        months = [dt.date(2026, m, 1) for m in range(10, 0, -1)] + [dt.date(2025, m, 1) for m in range(12, 0, -1)]
        return httpx.Response(200, json={"hits": [
            {"objectID": str(i), "title": f"Ask HN: Who is hiring? ({d:%B %Y})", "created_at": f"{d}T15:00:00Z"}
            for i, d in enumerate(months)]})
    stories = request.url.params["tags"].count("story_")
    return httpx.Response(200, json={"nbHits": (100 if request.url.params.get("query") is None else 10) * stories})


def test_job_history_counts_each_quarter_once_across_its_threads():
    client = httpx.Client(transport=httpx.MockTransport(_hn))
    raw = REAL_JOBS_SERIES({"sql": "sql"}, TODAY, client=client, sleep=lambda _: None)
    assert raw["periods"][0] == "2025Q1" and raw["periods"][-1] == "2026Q4"
    assert raw["postings"]["2026Q3"] == 300 and raw["mentions"]["sql"]["2026Q3"] == 30
    assert raw["postings"]["2026Q4"] == 100  # only October so far: dropped later as a partial quarter


def test_job_history_waits_and_retries_when_algolia_refuses_a_burst():
    calls, waits = {"n": 0}, []

    def flaky(request: httpx.Request) -> httpx.Response:
        if not request.url.path.endswith("search_by_date"):
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(403)
        return _hn(request)

    client = httpx.Client(transport=httpx.MockTransport(flaky))
    raw = REAL_JOBS_SERIES({"sql": "sql"}, TODAY, client=client, sleep=waits.append)
    assert waits and raw["postings"]["2026Q3"] == 300


def test_research_history_is_quarterly_and_ends_before_indexing_catches_up():
    spans = research.quarters(TODAY)
    assert len(spans) == research.SERIES_QUARTERS
    assert spans[-1][0] == "2026Q2" and spans[-1][2] == dt.date(2026, 6, 30)
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"meta": {"count": 5}})))
    raw = REAL_RESEARCH_SERIES(get_reference().capabilities[:1], TODAY, client=client, sleep=lambda _: None)
    assert raw["source"] == "openalex"  # arXiv's answer had no total, so the whole history switched
    assert raw["periods"] == [s[0] for s in spans] and set(raw["counts"]["document_understanding"].values()) == {5}


def test_research_history_prefers_arxiv_and_asks_for_one_result():
    asked = []

    def arxiv(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.params.get("max_results"))
        return httpx.Response(200, text="<feed><opensearch:totalResults xmlns:opensearch='x'>7</opensearch:totalResults></feed>")

    waits = []
    raw = REAL_RESEARCH_SERIES(get_reference().capabilities[:2], TODAY,
                               client=httpx.Client(transport=httpx.MockTransport(arxiv)), sleep=waits.append)
    assert raw["source"] == "arxiv" and set(raw["counts"]["conversational_ai"].values()) == {7}
    assert set(asked) == {"1"} and len(waits) == 2 * research.SERIES_QUARTERS - 1


def test_refresh_with_history_shows_forecasts_on_the_radar(data_copy, client, monkeypatch):
    monkeypatch.setattr(research, "collect", lambda *a, **k: fake_research())
    monkeypatch.setattr(jobs, "collect", lambda *a, **k: fake_jobs())
    monkeypatch.setattr(dosm, "collect", lambda *a, **k: fake_dosm())
    monkeypatch.setattr(jobs, "collect_series", lambda *a, **k: jobs_series({"excel": grows(0.1, 0.6)}))
    monkeypatch.setattr(research, "collect_series", lambda *a, **k: research_series())
    pid = client.post("/api/profiles", json={"skills": CLERK["skills"]}).json()["id"]
    sid = _refresh(client)["snapshot_id"]
    assert client.post(f"/api/signals/pending/{sid}/approve", json={"reviewer": "Team Reviewer"},
                       headers=ADMIN).status_code == 200
    radar = client.get("/api/radar", params={"profile_id": pid}).json()
    excel = next(s for s in radar["skills"] if s["skill_id"] == "excel")
    assert excel["mine"] and excel["label"] == "declining" and excel["forecast"]["history"]
    assert radar["forecast"]["backtest"]["skills_checked"] == 1
    assert store.get_snapshot(sid)["body"]["forecast"]["horizon_year"] == 2030
