import datetime as dt
import json
import shutil
from pathlib import Path

import httpx
import pytest

from app import store
from app.reference import get_reference
from app.services import matching
from app.trends import builder, dosm, jobs, mypostings, research

TODAY = dt.date(2026, 10, 19)
CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk"}


def fake_research(rising: str = "document_understanding") -> dict:
    counts = {c["id"]: {"recent": 100, "prior": 100} for c in get_reference().capabilities}
    counts[rising] = {"recent": 200, "prior": 100}  # doubled: momentum +1
    return {"source": "test", "source_url": "x", "retrieved": str(TODAY),
            "windows": {k: [str(a), str(b)] for k, (a, b) in research.windows(TODAY).items()},
            "queries": {}, "counts": counts}


def fake_jobs(mentions: dict | None = None) -> dict:
    base = {skill: {"recent": 20, "prior": 20} for skill in get_reference().job_terms}
    base.update(mentions or {})
    return {"source": "test postings", "source_url": "y", "retrieved": str(TODAY),
            "threads": {"recent": [{"title": "a"}], "prior": [{"title": "b"}]},
            "postings": {"recent": 100, "prior": 100}, "mentions": base}


def fake_dosm(clerical: float = 1000.0, craft: float = 1000.0) -> dict:
    """Every group grows 10% like all employees, except the two given (recent counts, prior 1000)."""
    groups = {g: {"recent": 1100.0, "prior": 1000.0} for g in dosm.MASCO.values()}
    groups["4"] = {"recent": clerical, "prior": 1000.0}
    groups["7"] = {"recent": craft, "prior": 1000.0}
    return {"source": "test DOSM", "source_url": "z", "retrieved": str(TODAY), "dataset": "wages_occupation",
            "years": [2022, 2025], "overall": {"recent": 1100.0, "prior": 1000.0}, "groups": groups}


def fake_my_postings(counts: dict | None = None) -> dict:
    """A first freehire run: every skill in 50 of 1,000 Malaysian postings, unless given."""
    mentions = {skill: 50 for skill in get_reference().my_posting_terms}
    mentions.update(counts or {})
    return {"source": "test MY postings", "source_url": "w", "retrieved": str(TODAY), "country": "MY",
            "terms": {}, "postings": 1000, "mentions": mentions}


collect_my_postings = mypostings.collect  # the real one, for the tests of freehire itself


@pytest.fixture(autouse=True)
def offline_freehire(monkeypatch):
    """Refresh tests never call freehire.me; tests that need it patch collect themselves."""
    monkeypatch.setattr(mypostings, "collect", lambda *a, **k: fake_my_postings())


def test_momentum_is_relative_to_the_median_and_clipped():
    raw = fake_research()  # every capability flat except document understanding, which doubles
    raw["counts"]["code_generation"] = {"recent": 1000, "prior": 1}
    raw["counts"]["mlops"] = {"recent": 0, "prior": 100}
    m = builder.momentum(raw)
    assert m["code_generation"] == 1.0 and m["mlops"] == -1.0
    assert m["document_understanding"] > 0.95 and m["llm_agents"] == 0.0


def test_growth_everywhere_is_not_momentum():
    raw = fake_research()
    for c in raw["counts"].values():
        c["recent"] = c["prior"] * 3  # the whole field tripled
    assert set(builder.momentum(raw).values()) == {0.0}


def test_rising_document_ai_lowers_data_entry_and_its_skills():
    ref = get_reference()
    baseline = ref.snapshots[0]
    snap = builder.build(ref, baseline, fake_research("document_understanding"), fake_jobs(),
                         dt.datetime(2026, 10, 19, 22, 0))
    signals = {s["role_id"]: s for s in snap["signals"]}
    base = {s["role_id"]: s for s in baseline["signals"]}
    assert signals["data_entry_clerk"]["net_growth_pct"] < base["data_entry_clerk"]["net_growth_pct"]
    assert signals["data_entry_clerk"]["automation_exposure"] > base["data_entry_clerk"]["automation_exposure"]
    skills = {s["skill_id"]: s for s in snap["skill_signals"]}
    assert skills["data_entry"]["label"] == "declining"
    assert skills["patient_care"]["label"] == "no_data"  # never guessed
    for s in snap["signals"]:  # adjustments stay inside their caps
        assert abs(s["demand_points"]) <= 15 and abs(s["ai_points"]) <= 15
        assert s["note"].startswith("Baseline")


def test_job_posting_demand_moves_role_outlook():
    ref = get_reference()
    hot = fake_jobs({"sql": {"recent": 80, "prior": 20}, "python": {"recent": 80, "prior": 20}})
    snap = builder.build(ref, ref.snapshots[0], fake_research(), hot, dt.datetime(2026, 10, 19, 22, 0))
    analyst = next(s for s in snap["signals"] if s["role_id"] == "data_analyst")
    assert analyst["demand_points"] > 0
    assert next(s for s in snap["skill_signals"] if s["skill_id"] == "sql")["label"] == "rising"


def test_new_snapshot_changes_the_ranking():
    ref = get_reference()
    before = [r["role_id"] for r in matching.match(ref, CLERK, "baseline")["roles"]]
    snap = builder.build(ref, ref.snapshots[0], fake_research("llm_agents"),
                         fake_jobs({"prompt": {"recent": 0, "prior": 0},
                                    "sql": {"recent": 50, "prior": 10}}),
                         dt.datetime(2026, 10, 19, 22, 0))
    changed = type(ref)(**{**vars(ref), "snapshots": [*ref.snapshots, snap]})
    after = [r["role_id"] for r in matching.match(changed, CLERK, "baseline")["roles"]]
    assert before != after


def _arxiv_rate_limited_then_openalex(request: httpx.Request) -> httpx.Response:
    if "arxiv" in request.url.host:
        return httpx.Response(429, text="Rate exceeded.")
    return httpx.Response(200, json={"meta": {"count": 42}})


def test_research_falls_back_to_openalex_when_arxiv_is_rate_limited():
    client = httpx.Client(transport=httpx.MockTransport(_arxiv_rate_limited_then_openalex))
    raw = research.collect(get_reference().capabilities, TODAY, client=client, sleep=lambda _: None)
    assert raw["source"] == "openalex"
    assert all(c == {"recent": 42, "prior": 42} for c in raw["counts"].values())


def test_research_uses_arxiv_when_available():
    feed = "<feed><opensearch:totalResults xmlns:opensearch='x'>7</opensearch:totalResults></feed>"
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=feed)))
    raw = research.collect(get_reference().capabilities[:2], TODAY, client=client, sleep=lambda _: None)
    assert raw["source"] == "arxiv" and raw["counts"]["document_understanding"]["recent"] == 7


def _algolia(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("search_by_date"):
        months = [dt.date(2026, m, 1) for m in range(10, 0, -1)] + [dt.date(2025, m, 1) for m in range(12, 0, -1)]
        return httpx.Response(200, json={"hits": [
            {"objectID": str(i), "title": f"Ask HN: Who is hiring? ({d:%B %Y})", "created_at": f"{d}T15:00:00Z"}
            for i, d in enumerate(months)]})
    query = request.url.params.get("query")
    story = int(request.url.params["tags"].split("story_")[1])
    recent = story < 3
    if query is None:
        return httpx.Response(200, json={"nbHits": 100})
    return httpx.Response(200, json={"nbHits": 20 if (query == "sql" and recent) else 10})


def test_jobs_compares_latest_threads_with_a_year_earlier():
    client = httpx.Client(transport=httpx.MockTransport(_algolia))
    raw = jobs.collect({"sql": "sql", "python": "python"}, TODAY, client=client)
    assert [t["date"] for t in raw["threads"]["recent"]] == ["2026-10-01", "2026-09-01", "2026-08-01"]
    assert [t["date"] for t in raw["threads"]["prior"]] == ["2025-10-01", "2025-09-01", "2025-08-01"]
    assert raw["postings"] == {"recent": 300, "prior": 300}
    assert raw["mentions"]["sql"] == {"recent": 60, "prior": 30}
    assert raw["mentions"]["python"] == {"recent": 30, "prior": 30}


@pytest.fixture
def data_copy(tmp_path, monkeypatch):
    """A throwaway copy of backend/data, so refresh tests never write into the real one."""
    src = Path(__file__).resolve().parents[1] / "data"
    dst = tmp_path / "data"
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("raw"))
    for name in list((dst / "signals").glob("*trend*")):
        name.unlink()
    monkeypatch.setenv("DATA_DIR", str(dst))
    return dst


def _refresh(client) -> dict:
    assert client.post("/api/signals/refresh").status_code == 401
    assert client.post("/api/signals/refresh", headers=ADMIN).status_code == 202
    for _ in range(200):
        state = client.get("/api/signals/refresh", headers=ADMIN).json()
        if state["state"] != "running":
            break
    assert state["state"] == "done", state
    return state


ADMIN = {"X-Admin-Token": "test-admin-token"}


def test_refresh_waits_for_approval_then_reranks(data_copy, client, monkeypatch):
    monkeypatch.setattr(research, "collect", lambda *a, **k: fake_research("document_understanding"))
    monkeypatch.setattr(jobs, "collect", lambda *a, **k: fake_jobs({"sql": {"recent": 50, "prior": 10}}))
    monkeypatch.setattr(dosm, "collect", lambda *a, **k: fake_dosm())
    pid = client.post("/api/profiles", json={"skills": CLERK["skills"]}).json()["id"]
    before = client.get(f"/api/profiles/{pid}/matches").json()

    state = _refresh(client)
    sid = state["snapshot_id"]
    # Nothing changes for users until a person approves it.
    waiting = client.get(f"/api/profiles/{pid}/matches").json()
    assert waiting["signal_source"]["snapshot_id"] == before["signal_source"]["snapshot_id"]
    assert client.get("/api/signals/pending").status_code == 401
    assert [p["snapshot_id"] for p in client.get("/api/signals/pending", headers=ADMIN).json()] == [sid]
    preview = client.get(f"/api/signals/pending/{sid}", headers=ADMIN).json()
    clerk = next(r for r in preview["roles"] if r["role_id"] == "data_entry_clerk")
    assert clerk["after"] < clerk["before"] and clerk["change"] < 0

    assert client.post(f"/api/signals/pending/{sid}/approve", json={"reviewer": "Team Reviewer"}).status_code == 401
    assert client.post(f"/api/signals/pending/{sid}/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN).status_code == 200

    after = client.get(f"/api/profiles/{pid}/matches").json()
    assert after["signal_source"]["snapshot_id"] == sid
    assert [r["score"] for r in after["roles"]] != [r["score"] for r in before["roles"]]
    radar = client.get("/api/radar", params={"profile_id": pid}).json()
    assert any(s["mine"] and s["label"] == "declining" for s in radar["skills"])
    stored = store.get_snapshot(sid)  # in the database, so a redeploy keeps the decision
    saved = stored["body"]
    assert stored["state"] == "approved" and stored["decided_by"] == "Team Reviewer"
    assert saved["baseline_snapshot_id"] and saved["inputs"] and saved["reviewed_by"] == "Team Reviewer"
    assert not (data_copy / "signals" / f"{sid}.json").exists()
    assert client.get("/api/signals/pending", headers=ADMIN).json() == []


def test_rejected_snapshot_is_kept_but_never_used(data_copy, client, monkeypatch):
    monkeypatch.setattr(research, "collect", lambda *a, **k: fake_research("document_understanding"))
    monkeypatch.setattr(jobs, "collect", lambda *a, **k: fake_jobs({}))
    monkeypatch.setattr(dosm, "collect", lambda *a, **k: fake_dosm())
    live = client.get("/api/signals").json()[0]["snapshot_id"]
    sid = _refresh(client)["snapshot_id"]
    decision = {"reviewer": "Team Reviewer", "reason": "Job-posting counts look too small this week"}
    assert client.post(f"/api/signals/pending/{sid}/reject", json=decision, headers=ADMIN).status_code == 200
    assert client.get("/api/signals").json()[0]["snapshot_id"] == live
    kept = store.get_snapshot(sid)
    assert kept["state"] == "rejected" and kept["reason"].startswith("Job-posting")
    assert kept["body"]["rejected_reason"].startswith("Job-posting")
    assert client.post(f"/api/signals/pending/{sid}/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN).status_code == 404


def test_review_rejects_odd_ids(client):
    for bad in ["..%2F..%2Fapp", "a/b", "%2E%2E"]:
        assert client.get(f"/api/signals/pending/{bad}", headers=ADMIN).status_code == 404


def test_slower_than_average_capability_does_not_help_exposed_roles():
    ref = get_reference()
    raw = fake_research()
    raw["counts"]["generative_media"] = {"recent": 10, "prior": 100}  # far slower than the rest
    snap = builder.build(ref, ref.snapshots[0], raw, fake_jobs(), dt.datetime(2026, 10, 19, 22, 0))
    marketing = next(s for s in snap["signals"] if s["role_id"] == "digital_marketing_specialist")
    assert marketing["ai_points"] == 0.0
    assert snap["capability_momentum"]["generative_media"] < 0  # still shown as it is


def test_too_few_postings_give_no_job_trend():
    ref = get_reference()
    raw = fake_jobs({"power_bi": {"recent": 0, "prior": 1}, "statistics": {"recent": 9, "prior": 0}})
    skills = builder.skill_signals(ref.skills, ref.capabilities, fake_research(), raw)
    assert skills["power_bi"]["label"] == "no_data" and "too few" in skills["power_bi"]["sources"][0]
    assert skills["statistics"]["label"] == "no_data"


def test_refresh_status_needs_admin_and_hides_urls(client):
    from app.trends import refresh
    assert client.get("/api/signals/refresh").status_code == 401
    error = RuntimeError("500 for url 'https://export.arxiv.org/api/query?search_query=secret'")
    assert "arxiv.org" not in refresh._safe_error(error) and "[url]" in refresh._safe_error(error)


def _opendosm(request: httpx.Request) -> httpx.Response:
    assert request.url.params["id"] == "wages_occupation"
    rows = []
    for year, scale in ((2021, 0.9), (2022, 1.0), (2025, 1.1)):
        for name in ["overall", *dosm.MASCO]:
            grow = 1.3 if (name == "professionals" and year == 2025) else 1.0
            rows.append({"sex": "both", "date": f"{year}-01-01", "occupation": name,
                         "recipients": round(1000 * scale * grow, 1), "wages_mean": 1, "wages_median": 1})
            rows.append({"sex": "male", "date": f"{year}-01-01", "occupation": name,
                         "recipients": 1.0, "wages_mean": 1, "wages_median": 1})
    return httpx.Response(200, json=rows)


def test_dosm_compares_latest_year_with_three_years_earlier():
    raw = dosm.collect(TODAY, client=httpx.Client(transport=httpx.MockTransport(_opendosm)))
    assert raw["years"] == [2022, 2025] and raw["dataset"] == "wages_occupation"
    assert raw["overall"] == {"recent": 1100.0, "prior": 1000.0}  # "both" sexes only
    assert raw["groups"]["2"] == {"recent": 1430.0, "prior": 1000.0}
    assert set(raw["groups"]) == {str(i) for i in range(1, 10)}


def test_malaysian_employment_moves_roles_by_their_occupation_group():
    ref = get_reference()
    # Clerical jobs shrink 10% while all employees grow 10%: 20 points below, capped at 10.
    snap = builder.build(ref, ref.snapshots[0], fake_research(), fake_jobs(),
                         dt.datetime(2026, 10, 19, 22, 0), fake_dosm(clerical=900.0))
    signals = {s["role_id"]: s for s in snap["signals"]}
    clerk, analyst = signals["data_entry_clerk"], signals["data_analyst"]
    assert clerk["local_points"] == -builder.LOCAL_CAP
    assert analyst["local_points"] == 0.0  # professionals grew like everyone else
    assert clerk["net_growth_pct"] == round(clerk["baseline_growth_pct"] + clerk["demand_points"]
                                            - builder.LOCAL_CAP + clerk["ai_points"], 1)
    assert "Malaysian employment -10" in clerk["note"]
    assert snap["inputs"][-1]["years"] == [2022, 2025] and "test DOSM" in snap["source"]
    assert builder.local_points(fake_dosm(), None) == 0.0  # a role with no MASCO group is left alone


def test_snapshot_without_dosm_has_no_local_points():
    ref = get_reference()
    snap = builder.build(ref, ref.snapshots[0], fake_research(), fake_jobs(), dt.datetime(2026, 10, 19, 22, 0))
    assert all("local_points" not in s for s in snap["signals"])
    assert len(snap["inputs"]) == 2


def test_refresh_still_runs_when_opendosm_is_down(data_copy, client, monkeypatch):
    def down(*a, **k):
        raise httpx.ConnectError("no route to https://api.data.gov.my/data-catalogue/?id=x")
    monkeypatch.setattr(research, "collect", lambda *a, **k: fake_research())
    monkeypatch.setattr(jobs, "collect", lambda *a, **k: fake_jobs())
    monkeypatch.setattr(dosm, "collect", down)
    state = _refresh(client)
    assert any("OpenDOSM unavailable" in step and "data.gov.my" not in step for step in state["steps"])
    pending = store.get_snapshot(state["snapshot_id"])["body"]
    assert all("local_points" not in s for s in pending["signals"])


def _freehire(request: httpx.Request) -> httpx.Response:
    params = request.url.params
    if params.get("skills") == "nope":
        return httpx.Response(200, json={"data": [], "meta": {"total": 9, "ignored_params": [{"param": "skills"}]}})
    total = 1000 if "skills" not in params and "q" not in params else (
        40 if params.get("skills") == "sql,postgresql" else 7 if params.get("q") == '"customer service"' else 0)
    assert params["countries"] == "MY"
    return httpx.Response(200, json={"data": [], "meta": {"total": total}})


def test_my_postings_counts_tags_and_quoted_phrases():
    client = httpx.Client(transport=httpx.MockTransport(_freehire))
    terms = {"sql": {"tags": ["sql", "postgresql"]}, "customer_service": {"phrase": "customer service"}}
    raw = collect_my_postings(terms, TODAY, client=client)
    assert raw["postings"] == 1000 and raw["mentions"] == {"sql": 40, "customer_service": 7}


def test_my_postings_refuses_a_filter_freehire_ignored():
    client = httpx.Client(transport=httpx.MockTransport(_freehire))
    with pytest.raises(ValueError):
        collect_my_postings({"x": {"tags": ["nope"]}}, TODAY, client=client)


def test_my_postings_compares_with_a_run_at_least_four_weeks_old(tmp_path):
    for day, total in (("2026-09-01", 800), ("2026-09-15", 900), ("2026-10-10", 950)):
        (tmp_path / f"{day}.json").write_text(json.dumps({"retrieved": day, "postings": total, "mentions": {}}))
    assert mypostings.previous(tmp_path, TODAY)["retrieved"] == "2026-09-15"
    assert mypostings.previous(tmp_path, dt.date(2026, 9, 20)) is None


def test_first_malaysian_run_shows_a_share_but_no_trend():
    ref = get_reference()
    first = mypostings.with_prior(fake_my_postings({"patient_care": 30}), None)
    skills = builder.skill_signals(ref.skills, ref.capabilities, fake_research(), fake_jobs(), first)
    care = skills["patient_care"]
    assert care["label"] == "no_data"
    assert any("30 of 1,000 postings mention it" in line and "second count" in line for line in care["sources"])


def test_malaysian_trend_averages_with_hacker_news():
    ref = get_reference()
    prior = {"retrieved": "2026-09-01", "postings": 1000,
             "mentions": {**fake_my_postings()["mentions"], "patient_care": 30}}
    now = mypostings.with_prior(fake_my_postings({"patient_care": 60}), prior)
    skills = builder.skill_signals(ref.skills, ref.capabilities, fake_research(), fake_jobs(), now)
    assert skills["patient_care"]["trend"] == 1.0 and skills["patient_care"]["label"] == "rising"
    sql = skills["sql"]  # Hacker News flat (0) and Malaysia flat (0): steady, with both sources named
    assert sql["label"] == "steady" and len([s for s in sql["sources"] if "postings" in s]) == 2


def test_refresh_still_runs_when_freehire_is_down(data_copy, client, monkeypatch):
    def down(*a, **k):
        raise httpx.ConnectError("no route to https://freehire.me/api/v1/jobs/search?countries=MY")
    monkeypatch.setattr(research, "collect", lambda *a, **k: fake_research())
    monkeypatch.setattr(jobs, "collect", lambda *a, **k: fake_jobs())
    monkeypatch.setattr(dosm, "collect", lambda *a, **k: fake_dosm())
    monkeypatch.setattr(mypostings, "collect", down)
    state = _refresh(client)
    assert any("freehire.me unavailable" in step and "countries=MY" not in step for step in state["steps"])
    pending = store.get_snapshot(state["snapshot_id"])["body"]
    assert not any(i["source"] == mypostings.SOURCE for i in pending["inputs"])
