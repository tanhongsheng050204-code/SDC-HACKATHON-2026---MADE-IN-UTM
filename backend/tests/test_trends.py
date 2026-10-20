import datetime as dt
import json
import shutil
from pathlib import Path

import httpx
import pytest

from app import store
from app.reference import get_reference
from app.services import matching
from app.trends import builder, jobs, research

TODAY = dt.date(2026, 10, 19)
CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk", "interests": []}


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
