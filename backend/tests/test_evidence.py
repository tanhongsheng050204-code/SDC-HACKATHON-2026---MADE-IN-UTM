"""Cited skill evidence: real Malaysian job ads (freehire), matched to our skills, reviewed by a person."""

import pytest

from app.evidence import search
from app.reference import get_reference


def _ad(url: str, *sentences: str, tags: tuple[str, ...] = (), title: str = "Data Analyst",
        company: str = "Acme Sdn Bhd") -> dict:
    """A posting as app/evidence/ads.py returns it."""
    return {"url": url, "title": title, "company": company, "posted": "2026-10-20",
            "description": "<ul>" + "".join(f"<li>{s}</li>" for s in sentences) + "</ul>", "tags": list(tags)}


class FakeAds:
    """Stands in for app/evidence/ads.for_role: returns `ads` for any role, records each call."""

    def __init__(self, ads: list[dict]):
        self.ads, self.calls = ads, []

    def __call__(self, role_id: str, max_ads: int) -> list[dict]:
        self.calls.append((role_id, max_ads))
        return self.ads[:max_ads]


ADS = [
    _ad("https://www.jobstreet.com.my/job/111", "Strong SQL skills are required.", "Experience with AWS or GCP.",
        tags=("Looker Studio",)),  # Acme
    _ad("https://www.jobstreet.com.my/job/222", "Write SQL queries daily.", "Cloud computing knowledge (AWS).",
        "Machine learning is a plus.", company="Beta Bhd"),
    _ad("https://www.jobstreet.com.my/job/333", "Python for data cleaning.", "Familiar with Microsoft Excel.",
        "Exposure to cloud computing on Azure.", tags=("looker studio", "SQL"), company="Gamma Sdn Bhd"),
    _ad("https://www.jobstreet.com.my/job/444", "Good communication skills.",
        "A paragraph that runs on " + "and on " * 60 + "with SQL", company="Delta Sdn Bhd"),
]


def _run(fake: FakeAds) -> dict:
    ref = get_reference()
    return search.search_role(ref.roles["data_analyst"], ref.skills, fetch=fake)


def test_real_ads_confirm_role_skills_with_their_own_sentences_and_links():
    fake = FakeAds(ADS)
    result = _run(fake)
    summary = result["summary"]
    assert fake.calls == [("data_analyst", search.MAX_ADS)] and result["ads_read"] == 4 and result["widened"] is False
    assert summary["skills"]["sql"]["status"] == "confirmed" and summary["skills"]["sql"]["sources"] == 3
    assert summary["skills"]["python"]["status"] == "single"
    assert summary["skills"]["excel"]["status"] == "single"
    assert summary["skills"]["statistics"]["status"] == "none"
    cite = summary["skills"]["sql"]["citations"][0]
    assert cite == {"url": "https://www.jobstreet.com.my/job/111", "title": "Data Analyst", "employer": "Acme Sdn Bhd",
                    "kind": "job_ad", "grounded": True, "quote": "Strong SQL skills are required."}
    # Every quote is a sentence from the ad itself (or names a tag the site put on it): nothing is written by a model.
    texts = " ".join(a["description"] for a in ADS)
    assert all(c["quote"] in texts or c["quote"].startswith("Skill listed on the ad")
               for s in summary["skills"].values() for c in s["citations"])


def test_a_catalogue_skill_joins_the_role_only_when_enough_ads_ask_for_it():
    summary = _run(FakeAds(ADS))["summary"]
    assert [a["skill_id"] for a in summary["added"]] == ["cloud_computing"]  # 3 of 4 ads
    assert "machine_learning" not in [a["skill_id"] for a in summary["added"]]  # 1 ad
    many = ADS + [_ad(f"https://www.jobstreet.com.my/job/{n}", "Good communication skills.", company=f"Firm {n}")
                  for n in range(500, 520)]
    assert _run(FakeAds(many))["summary"]["added"] == []  # 3 of 24 ads is under the 20% share


def test_site_tags_outside_the_catalogue_are_listed_for_the_team():
    summary = _run(FakeAds(ADS))["summary"]
    assert summary["not_in_catalogue"] == [{"name": "looker studio", "count": 2}]  # one entry, any capitals


def test_overlong_paragraphs_are_not_quoted():
    summary = _run(FakeAds(ADS))["summary"]
    assert "https://www.jobstreet.com.my/job/444" not in {c["url"] for c in summary["skills"]["sql"]["citations"]}


def test_same_ad_twice_counts_once():
    summary = _run(FakeAds([ADS[0], ADS[0], ADS[1]]))["summary"]
    assert summary["skills"]["sql"]["sources"] == 2
    repost = {**ADS[1], "url": "https://www.jobstreet.com.my/job/999"}  # the same ad posted again, new link
    assert _run(FakeAds([ADS[0], ADS[1], repost]))["summary"]["skills"]["sql"]["sources"] == 2


def test_generic_words_in_ads_do_not_count_as_skills():
    assert search.skills_in("Ensure compliance with cash-handling procedures and audit requirements.") == []
    assert search.skills_in("Proficient in writing and conversing in English.") == []
    assert search.skills_in("Administer 5 ml doses as prescribed.") == []
    assert search.skills_in("Experience in risk assessment and SQL.") == ["risk_assessment", "sql"]


def test_aggregate_drops_unticked_sources_and_added_skills():
    result = _run(FakeAds(ADS))
    role, skills = get_reference().roles["data_analyst"], get_reference().skills
    again = search.aggregate(role, result["sources"], skills, drop_sources={"https://www.jobstreet.com.my/job/111"},
                             ads_read=result["ads_read"])
    assert again["skills"]["sql"]["status"] == "confirmed" and again["added"] == []  # cloud now in 2 of 4
    kept = search.aggregate(role, result["sources"], skills, drop_added={"cloud_computing"}, ads_read=result["ads_read"])
    assert kept["added"] == [] and kept["skills"]["cloud_computing"]["status"] == "confirmed"


def test_ad_sentences_are_split_from_html():
    from app.evidence import ads
    parts = ads.sentences("<p>About us.</p><ul><li>SQL &amp; Python</li><li>Excel</li></ul><p>We pay well. Apply now.</p>")
    assert parts == ["About us.", "SQL & Python", "Excel", "We pay well.", "Apply now."]


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
    """A finished evidence run: data_analyst reads ADS, ux_designer's ads cannot be fetched, the rest find none."""
    from app.evidence import refresh
    real = search.search_role

    def fake_search_role(role, skills, **_):
        if role["id"] == "ux_designer":
            raise TimeoutError("search took too long at https://example.org/?q=secret")
        return real(role, skills, fetch=FakeAds(ADS if role["id"] == "data_analyst" else []))

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
    assert analyst["job_ads"] == 4 and analyst["added"] == ["cloud_computing"]  # every ad quoted a skill
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
    assert cloud["added_from_ads"] is True and cloud["evidence"]["job_ads"] == 3
    analyst = next(r for r in client.get(f"/api/profiles/{pid}/matches").json()["roles"] if r["role_id"] == "data_analyst")
    assert analyst["evidence"]["skills"]["sql"]["status"] == "confirmed"
    assert client.post(f"/api/evidence/pending/{evidence_id}/approve", json=decision, headers=ADMIN).status_code == 404


def test_unticked_sources_are_dropped_before_statuses_are_recomputed(client, searched):
    evidence_id = _pending_for(client, "data_analyst")
    decision = {"reviewer": "Team Reviewer", "drop_sources": ["https://www.jobstreet.com.my/job/111",
                                                              "https://www.jobstreet.com.my/job/222"]}
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


@pytest.mark.parametrize("url", ["https://careers.shopee.com.my/job-detail/1", "https://jobs.bytedance.com/en/position/2",
                                 "https://apply.workable.com/acme/j/3", "https://boards.greenhouse.io/acme/jobs/4"])
def test_employer_career_sites_are_job_ads(url):
    assert search.page_kind(url) == "job_ad"


def test_one_wrongly_matched_quote_can_be_unticked_without_dropping_its_ad():
    result = _run(FakeAds(ADS))
    role, skills = get_reference().roles["data_analyst"], get_reference().skills
    drop = {"https://www.jobstreet.com.my/job/111#cloud_computing"}
    summary = search.aggregate(role, result["sources"], skills, drop_sources=drop, ads_read=result["ads_read"])
    assert summary["skills"]["cloud_computing"]["sources"] == 2 and summary["added"] == []
    assert summary["skills"]["sql"]["status"] == "confirmed"  # the ad's other quote still counts


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
        return real(role, skills, fetch=FakeAds(ADS))

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
