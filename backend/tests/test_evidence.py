"""Cited skill evidence: Malaysian job ads found by grounded web search, reviewed by a person."""

import pytest

from app.evidence import search
from app.reference import get_reference


def _page(url: str, *quotes: tuple[str, str], title: str = "Data Analyst", employer: str = "Acme Sdn Bhd") -> dict:
    return {"url": url, "title": title, "employer": employer,
            "quotes": [{"skill_id": sid, "skill_name": name, "quote": f"Must have {name}."} for sid, name in quotes]}


class FakeSearch:
    """Answers the job-ad prompt with `ads` and the wider prompt with `pages`; records each prompt."""

    def __init__(self, ads: list[dict], pages: list[dict] | None = None, grounded=("hiredly.com", "jobstreet.com")):
        self.ads, self.pages, self.prompts = ads, pages or [], []
        self.grounded = [{"title": d, "uri": f"https://vertexaisearch.cloud.google.com/{d}"} for d in grounded]

    def __call__(self, prompt: str):
        self.prompts.append(prompt)
        return {"pages": self.ads if len(self.prompts) == 1 else self.pages}, self.grounded


ADS = [
    _page("https://my.hiredly.com/jobs/acme-data-analyst", ("sql", "SQL"), ("cloud_computing", "GCP"),
          ("other", "Looker Studio")),
    _page("https://www.jobstreet.com.my/job/111", ("sql", "SQL"), ("cloud_computing", "AWS"),
          ("machine_learning", "machine learning")),
    _page("https://www.jobstreet.com.my/job/222", ("python", "Python"), ("excel_skills", "Excel"),
          ("other", "Looker Studio")),
]


def _run(fake: FakeSearch) -> dict:
    ref = get_reference()
    return search.search_role(ref.roles["data_analyst"], ref.skills, grounded=fake)


def test_job_ads_confirm_role_skills_and_add_catalogue_skills():
    fake = FakeSearch(ADS)
    result = _run(fake)
    summary = result["summary"]
    assert len(fake.prompts) == 1 and result["widened"] is False  # enough ads: no wider search
    assert "Malaysia" in fake.prompts[0] and "cloud_computing" in fake.prompts[0]  # catalogue in prompt
    assert summary["skills"]["sql"]["status"] == "confirmed"
    assert summary["skills"]["python"]["status"] == "single"
    assert summary["skills"]["excel"]["status"] == "single"  # unknown id mapped through the alias "Excel"
    assert summary["skills"]["statistics"]["status"] == "none"
    assert [a["skill_id"] for a in summary["added"]] == ["cloud_computing"]  # 2 job ads
    assert summary["skills"]["cloud_computing"]["status"] == "confirmed"
    assert "machine_learning" not in [a["skill_id"] for a in summary["added"]]  # only 1 ad
    assert summary["not_in_catalogue"] == [{"name": "Looker Studio", "count": 2}]
    cite = summary["skills"]["sql"]["citations"][0]
    assert cite["kind"] == "job_ad" and cite["grounded"] is True and cite["quote"] == "Must have SQL."


def test_too_few_ads_widen_to_any_page_and_web_pages_never_add_skills():
    web = [_page("https://www.talentcorp.com.my/career-guide", ("cloud_computing", "cloud")),
           _page("https://example.org/data-careers", ("cloud_computing", "cloud"))]
    fake = FakeSearch(ADS[:1], web, grounded=("hiredly.com", "talentcorp.com.my"))
    result = _run(fake)
    assert len(fake.prompts) == 2 and result["widened"] is True
    summary = result["summary"]
    assert summary["skills"]["cloud_computing"]["status"] == "confirmed"  # 3 sources of any kind...
    assert summary["added"] == []  # ...but only one is a job ad
    kinds = {c["url"]: (c["kind"], c["grounded"]) for c in summary["skills"]["cloud_computing"]["citations"]}
    assert kinds["https://www.talentcorp.com.my/career-guide"] == ("web", True)
    assert kinds["https://example.org/data-careers"] == ("web", False)  # not among Google's sources


def test_same_page_twice_counts_once():
    duplicate = [ADS[0], {**ADS[0], "quotes": [{"skill_id": "sql", "skill_name": "SQL", "quote": "SQL again."}]}, ADS[1]]
    summary = _run(FakeSearch(duplicate))["summary"]
    assert len(summary["skills"]["sql"]["citations"]) == 2


def test_aggregate_drops_unticked_sources_and_added_skills():
    result = _run(FakeSearch(ADS))
    again = search.aggregate(get_reference().roles["data_analyst"], result["sources"], get_reference().skills,
                             drop_sources={"https://www.jobstreet.com.my/job/111"})
    assert again["skills"]["sql"]["status"] == "single" and again["added"] == []
    kept = search.aggregate(get_reference().roles["data_analyst"], result["sources"], get_reference().skills,
                            drop_added={"cloud_computing"})
    assert kept["added"] == [] and kept["skills"]["cloud_computing"]["status"] == "confirmed"


@pytest.mark.parametrize("url,kind", [
    ("https://www.jobstreet.com.my/job/1", "job_ad"), ("https://my.hiredly.com/jobs/x", "job_ad"),
    ("https://myfuturejobs.gov.my/job/2", "job_ad"), ("https://www.linkedin.com/jobs/view/3", "job_ad"),
    ("https://www.linkedin.com/pulse/article", "web"), ("https://www.mdec.my/report", "web"),
])
def test_job_boards_are_recognised(url, kind):
    assert search.page_kind(url) == kind


# --- refresh, review and effect through the API -------------------------------------------------

ADMIN = {"X-Admin-Token": "test-admin-token"}


@pytest.fixture
def searched(client, monkeypatch):
    """A finished evidence run: data_analyst finds ADS, ux_designer's search fails, the rest find nothing."""
    from app.evidence import refresh
    real = search.search_role

    def fake_search_role(role, skills, **_):
        if role["id"] == "ux_designer":
            raise TimeoutError("search took too long at https://example.org/?q=secret")
        return real(role, skills, grounded=FakeSearch(ADS if role["id"] == "data_analyst" else []))

    monkeypatch.setattr(search, "search_role", fake_search_role)
    monkeypatch.setitem(refresh._status, "state", "idle")
    assert client.post("/api/evidence/refresh").status_code == 401
    assert client.post("/api/evidence/refresh", headers=ADMIN).status_code == 202
    for _ in range(500):
        state = client.get("/api/evidence/refresh", headers=ADMIN).json()
        if state["state"] != "running":
            break
    assert state["state"] == "done", state
    return state


def _pending_for(client, role_id: str) -> str:
    return next(p["id"] for p in client.get("/api/evidence/pending", headers=ADMIN).json() if p["role_id"] == role_id)


def test_failed_role_does_not_stop_the_run(client, searched):
    assert searched["failed"] == ["ux_designer"]
    assert any("UX / UI designer: search failed" in s and "example.org" not in s for s in searched["steps"])
    pending = client.get("/api/evidence/pending", headers=ADMIN).json()
    assert len(pending) == len(searched["saved"]) == len(get_reference().roles) - 1
    analyst = next(p for p in pending if p["role_id"] == "data_analyst")
    assert analyst["job_ads"] == 3 and analyst["added"] == ["cloud_computing"]
    assert client.get("/api/evidence/pending").status_code == 401


def test_approved_evidence_adds_skill_to_matching(client, searched):
    pid = client.post("/api/profiles", json={"skills": ["sql", "cloud_computing"]}).json()["id"]
    fit = lambda: next(r["fit"] for r in client.get(f"/api/profiles/{pid}/matches").json()["roles"]
                       if r["role_id"] == "data_analyst")
    before = fit()
    assert "evidence" not in client.get("/api/roles/data_analyst").json()  # nothing until approved

    evidence_id = _pending_for(client, "data_analyst")
    detail = client.get(f"/api/evidence/pending/{evidence_id}", headers=ADMIN).json()
    assert detail["summary"]["added"][0]["skill_id"] == "cloud_computing" and "sql" in detail["role_skills"]
    decision = {"reviewer": "Team Reviewer"}
    assert client.post(f"/api/evidence/pending/{evidence_id}/approve", json=decision).status_code == 401
    assert client.post(f"/api/evidence/pending/{evidence_id}/approve", json=decision, headers=ADMIN).status_code == 200

    role = client.get("/api/roles/data_analyst").json()
    assert {"skill_id": "cloud_computing", "weight": 1, "source": "evidence"} in role["skills"]
    assert role["evidence"]["skills"]["sql"]["status"] == "confirmed"
    assert role["evidence"]["reviewed_by"] == "Team Reviewer"
    assert fit() > before
    tree = client.get(f"/api/profiles/{pid}/tree", params={"role": "data_analyst"}).json()
    cloud = next(n for n in tree["nodes"] if n["skill_id"] == "cloud_computing")
    assert cloud["added_from_ads"] is True and cloud["evidence"]["job_ads"] == 2
    analyst = next(r for r in client.get(f"/api/profiles/{pid}/matches").json()["roles"] if r["role_id"] == "data_analyst")
    assert analyst["evidence"]["skills"]["sql"]["status"] == "confirmed"
    assert client.post(f"/api/evidence/pending/{evidence_id}/approve", json=decision, headers=ADMIN).status_code == 404


def test_unticked_sources_are_dropped_before_statuses_are_recomputed(client, searched):
    evidence_id = _pending_for(client, "data_analyst")
    decision = {"reviewer": "Team Reviewer", "drop_sources": ["https://www.jobstreet.com.my/job/111"]}
    assert client.post(f"/api/evidence/pending/{evidence_id}/approve", json=decision, headers=ADMIN).json()["added"] == []
    role = client.get("/api/roles/data_analyst").json()
    assert role["evidence"]["skills"]["sql"]["status"] == "single"
    assert not any(rs.get("source") == "evidence" for rs in role["skills"])


def test_untick_an_added_skill_keeps_its_evidence_but_does_not_add_it(client, searched):
    evidence_id = _pending_for(client, "data_analyst")
    decision = {"reviewer": "Team Reviewer", "drop_added": ["cloud_computing"]}
    client.post(f"/api/evidence/pending/{evidence_id}/approve", json=decision, headers=ADMIN)
    role = client.get("/api/roles/data_analyst").json()
    assert all(rs["skill_id"] != "cloud_computing" for rs in role["skills"])
    assert role["evidence"]["skills"]["sql"]["status"] == "confirmed"


def test_rejected_evidence_changes_nothing(client, searched):
    from app import store
    evidence_id = _pending_for(client, "data_analyst")
    decision = {"reviewer": "Team Reviewer", "reason": "Ads were from Singapore"}
    assert client.post(f"/api/evidence/pending/{evidence_id}/reject", json=decision, headers=ADMIN).status_code == 200
    assert "evidence" not in client.get("/api/roles/data_analyst").json()
    kept = store.get_evidence(evidence_id)
    assert kept["state"] == "rejected" and kept["reason"] == "Ads were from Singapore"


def test_odd_evidence_ids_are_not_found(client):
    for bad in ["..%2Fx", "a/b", "%2E%2E"]:
        assert client.get(f"/api/evidence/pending/{bad}", headers=ADMIN).status_code == 404


def test_google_redirect_links_are_resolved_to_the_real_page():
    redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"
    ads = [_page(redirect, ("sql", "SQL")), _page("https://vertexaisearch.cloud.google.com/grounding-api-redirect/dead", ("sql", "SQL")),
           ADS[1]]
    real = {redirect: "https://my.hiredly.com/jobs/acme-data-analyst"}
    ref = get_reference()
    result = search.search_role(ref.roles["data_analyst"], ref.skills, grounded=FakeSearch(ads, grounded=()),
                                resolve=real.get)
    urls = [p["url"] for p in result["sources"]]
    assert urls == ["https://my.hiredly.com/jobs/acme-data-analyst", "https://www.jobstreet.com.my/job/111"]
    assert result["sources"][0]["kind"] == "job_ad" and result["sources"][0]["grounded"] is True  # it came from Google
    assert result["widened"] is False


@pytest.mark.parametrize("url", ["https://careers.shopee.com.my/job-detail/1", "https://jobs.bytedance.com/en/position/2",
                                 "https://apply.workable.com/acme/j/3", "https://boards.greenhouse.io/acme/jobs/4"])
def test_employer_career_sites_are_job_ads(url):
    assert search.page_kind(url) == "job_ad"


def test_one_wrongly_tagged_quote_can_be_unticked_without_dropping_its_page():
    result = _run(FakeSearch(ADS))
    role, skills = get_reference().roles["data_analyst"], get_reference().skills
    drop = {"https://www.jobstreet.com.my/job/111#cloud_computing"}
    summary = search.aggregate(role, result["sources"], skills, drop_sources=drop)
    assert summary["skills"]["cloud_computing"]["status"] == "single" and summary["added"] == []
    assert summary["skills"]["sql"]["status"] == "confirmed"  # the page's other quote still counts



@pytest.mark.parametrize("url,kind", [
    ("https://www.michaelpage.com.my/job-detail/ai-automation-engineer/ref/jn-1", "job_ad"),
    ("https://www.hays.com.my/job-detail/data-analyst-kuala-lumpur_123", "job_ad"),
    ("https://www.randstad.com.my/jobs/data-analyst_kuala-lumpur_456/", "job_ad"),
    ("https://example.com/careers/jobs/789", "job_ad"),
    ("https://kdci.co/blog/top-administrative-roles-to-outsource/", "web"),
])
def test_recruitment_agencies_and_job_paths_are_job_ads(url, kind):
    assert search.page_kind(url) == kind


def test_stop_cancels_searches_not_started_and_keeps_what_was_found(client, monkeypatch):
    from app.evidence import refresh

    real = search.search_role
    calls = []

    def fake_search_role(role, skills, **_):
        calls.append(role["id"])
        if len(calls) == 1:
            assert client.post("/api/evidence/refresh/stop").status_code == 401
            assert client.post("/api/evidence/refresh/stop", headers=ADMIN).status_code == 200
        return real(role, skills, grounded=FakeSearch(ADS))

    monkeypatch.setattr(search, "search_role", fake_search_role)
    monkeypatch.setattr(refresh, "PARALLEL", 1)  # one at a time, so the others are still queued
    monkeypatch.setitem(refresh._status, "state", "idle")
    assert client.post("/api/evidence/refresh", headers=ADMIN).status_code == 202
    for _ in range(500):
        state = client.get("/api/evidence/refresh", headers=ADMIN).json()
        if state["state"] not in ("running",):
            break
    assert state["state"] == "stopped" and state["stopping"] is False
    assert len(calls) == 1 and len(state["saved"]) == 1  # the running search finished and was kept
    assert any(f"{len(get_reference().roles) - 1} not searched" in s for s in state["steps"])
    assert client.post("/api/evidence/refresh/stop", headers=ADMIN).status_code == 409  # nothing running now
