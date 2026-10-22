"""Emerging roles: a labelled prediction, sourced from the web and approved by a person."""

import copy

import pytest

from app.evidence import emerging, search
from app.reference import get_reference

ADMIN = {"X-Admin-Token": "test-admin-token"}


def _answer(cap_id: str, **over) -> dict:
    base = {
        "title": {"en": f"AI {cap_id} specialist", "ms": f"Pakar AI {cap_id}", "zh": f"AI {cap_id} 专员"},
        "summary": {"en": "Runs AI tools for a team.", "ms": "Mengendalikan alat AI.", "zh": "为团队运行 AI 工具。"},
        "skills": ["genai_tools", "prompt_engineering", "not_a_skill"],
        "stepping_stone": "ai_operations_specialist",
        "stepping_reason": {"en": "Closest role today.", "ms": "Peranan terdekat.", "zh": "最接近的现有职位。"},
        "sdg": 8, "sdg_reason": {"en": "Decent work.", "ms": "Pekerjaan wajar.", "zh": "体面工作。"},
        "sources": [{"url": "https://www.jobstreet.com.my/job/9", "title": "AI Prompt Specialist",
                     "quote": "We are hiring an AI prompt specialist to design prompts."}],
    }
    base.update(over)
    return base


def fake_grounded(answer: dict):
    def call(prompt: str):
        return answer, [{"title": "jobstreet.com.my", "uri": "https://vertexaisearch.cloud.google.com/x"}]
    return call


GOOGLE_PAGE = "https://www.jobstreet.com.my/job/95378380"  # where Google's redirect really leads


@pytest.fixture(autouse=True)
def offline_links(monkeypatch):
    """Google's redirect resolves to a real ad, and that ad holds the quote; no network in tests."""
    monkeypatch.setattr(search, "resolve_redirect", lambda url: GOOGLE_PAGE if "vertexaisearch" in url else None)
    monkeypatch.setattr(emerging, "_page_text",
                        lambda url: "<li>We are hiring an AI prompt specialist to design prompts.</li>" if url == GOOGLE_PAGE else None)


def test_links_are_googles_own_and_sites_google_did_not_read_are_dropped():
    ref = get_reference()
    cap = ref.capabilities[0]
    answer = _answer(cap["id"], sources=[
        {"url": "https://www.jobstreet.com.my/job/ai-prompt-specialist-made-up", "title": "AI Prompt Specialist",
         "quote": "We are hiring an AI prompt specialist to design prompts."},
        {"url": "https://www.not-read-by-google.com/page", "title": "Elsewhere", "quote": "Something else."}])
    body = emerging.search_capability(cap, None, ref, grounded=fake_grounded(answer))
    assert [s["url"] for s in body["sources"]] == [GOOGLE_PAGE]  # the model's slug is replaced, the other site dropped
    assert body["sources"][0]["quote_on_page"] is True


def test_a_quote_not_on_the_linked_page_is_marked():
    ref = get_reference()
    cap = ref.capabilities[0]
    answer = _answer(cap["id"], sources=[{"url": "https://www.jobstreet.com.my/job/9", "title": "x",
                                          "quote": "A sentence the page does not contain."}])
    assert emerging.search_capability(cap, None, ref, grounded=fake_grounded(answer))["sources"][0]["quote_on_page"] is False
    assert emerging.quote_on_page("https://blocked.example/x", "Any quote.") is None  # page could not be read


def test_without_a_trend_refresh_every_capability_is_a_candidate():
    ref = get_reference()
    picked = emerging.candidates(ref)
    assert [c["id"] for c, _ in picked] == [c["id"] for c in ref.capabilities]
    assert all(m is None for _, m in picked)  # momentum not measured yet: said so, never invented


def test_with_momentum_only_accelerating_capabilities_count_fastest_first():
    ref = get_reference()
    snap = copy.deepcopy(ref.latest_snapshot)
    snap["capability_momentum"] = {c["id"]: 0.0 for c in ref.capabilities} | {"llm_agents": 0.8, "mlops": 0.3,
                                                                             "code_generation": -0.4}
    changed = type(ref)(**{**vars(ref), "snapshots": [*ref.snapshots, snap]})
    assert [(c["id"], m) for c, m in emerging.candidates(changed)] == [("llm_agents", 0.8), ("mlops", 0.3)]


def test_search_keeps_catalogue_skills_and_a_real_stepping_stone():
    ref = get_reference()
    cap = ref.capabilities[0]
    body = emerging.search_capability(cap, 0.5, ref, grounded=fake_grounded(_answer(cap["id"])))
    assert body["capability_id"] == cap["id"] and body["momentum"] == 0.5
    assert body["skills"] == ["genai_tools", "prompt_engineering"]  # unknown ids dropped
    assert body["stepping_stone"] == "ai_operations_specialist"
    assert body["sdg"] == {"number": 8, "reason": {"en": "Decent work.", "ms": "Pekerjaan wajar.", "zh": "体面工作。"}}
    src = body["sources"][0]
    assert src["kind"] == "job_ad" and src["grounded"] is True and src["quote"].startswith("We are hiring")


@pytest.mark.parametrize("bad,reason", [
    ({"stepping_stone": "astronaut"}, "stepping stone"),
    ({"sources": []}, "no source"),
    ({"skills": ["not_a_skill"]}, "no catalogue skill"),
    ({"title": {"en": "Data analyst", "ms": "", "zh": ""}}, "already a catalogue role"),
])
def test_unusable_answers_are_refused(bad, reason):
    ref = get_reference()
    cap = ref.capabilities[0]
    with pytest.raises(emerging.Unusable, match=reason):
        emerging.search_capability(cap, None, ref, grounded=fake_grounded(_answer(cap["id"], **bad)))


@pytest.fixture
def found(client, monkeypatch):
    """A finished emerging-roles run: every capability finds a role except code_generation."""
    from app.evidence import refresh
    real = emerging.search_capability

    def fake(cap, momentum, ref, **_):
        if cap["id"] == "code_generation":
            raise emerging.Unusable("no source")
        return real(cap, momentum, ref, grounded=fake_grounded(_answer(cap["id"])))

    monkeypatch.setattr(emerging, "search_capability", fake)
    monkeypatch.setitem(refresh._status, "state", "idle")
    assert client.post("/api/evidence/refresh?mode=emerging").status_code == 401
    assert client.post("/api/evidence/refresh?mode=emerging", headers=ADMIN).status_code == 202
    for _ in range(500):
        state = client.get("/api/evidence/refresh", headers=ADMIN).json()
        if state["state"] != "running":
            break
    assert state["state"] == "done", state
    return state


def _pending(client) -> list[dict]:
    return client.get("/api/evidence/pending?kind=emerging", headers=ADMIN).json()


def test_nothing_is_shown_until_a_person_approves(client, found):
    assert found["failed"] == ["code_generation"]
    pending = _pending(client)
    assert len(pending) == 7 and all(p["title"] for p in pending)
    assert client.get("/api/emerging").json()["roles"] == []


def test_approved_cards_show_carry_over_skills_and_the_stepping_stone(client, found):
    pid = client.post("/api/profiles", json={"skills": ["genai_tools", "excel"]}).json()["id"]
    first = _pending(client)[0]
    detail = client.get(f"/api/evidence/pending/{first['id']}", headers=ADMIN).json()
    assert detail["kind"] == "emerging" and detail["sources"]
    decision = {"reviewer": "Team Reviewer"}
    assert client.post(f"/api/evidence/pending/{first['id']}/approve", json=decision, headers=ADMIN).status_code == 200
    roles = client.get("/api/emerging", params={"profile_id": pid}).json()["roles"]
    assert len(roles) == 1
    card = roles[0]
    assert card["carry_over"] == [{"skill_id": "genai_tools", "name": "Using generative AI tools"}]
    assert [s["skill_id"] for s in card["to_learn"]] == ["prompt_engineering"]
    assert card["stepping_stone"]["role_id"] == "ai_operations_specialist" and card["stepping_stone"]["title"]
    assert card["reviewed_by"] == "Team Reviewer" and card["sdg"]["number"] == 8


def test_at_most_six_cards_and_rejected_ones_never_show(client, found):
    pending = _pending(client)
    for p in pending[:6]:
        client.post(f"/api/evidence/pending/{p['id']}/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN)
    client.post(f"/api/evidence/pending/{pending[6]['id']}/reject",
                json={"reviewer": "Team Reviewer", "reason": "Not a real job title"}, headers=ADMIN)
    shown = client.get("/api/emerging").json()["roles"]
    assert len(shown) == 6 and pending[6]["subject"] not in {r["capability_id"] for r in shown}


def test_live_search_is_unreviewed_cached_and_rate_limited(client, found, monkeypatch):
    first = _pending(client)[0]
    client.post(f"/api/evidence/pending/{first['id']}/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN)
    cap_id = first["subject"]
    calls = []

    def live(role, skills, **_):
        calls.append(role["title"])
        return {"sources": [{"url": "https://www.hiredly.com/jobs/1", "title": "Job", "employer": "Acme",
                             "kind": "job_ad", "grounded": True, "quotes": [{"skill_id": None, "skill_name": "x", "quote": "q"}]}]}

    monkeypatch.setattr(search, "search_role", live)
    emerging.clear_live_cache()
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    url = f"/api/emerging/{cap_id}/search"
    body = client.post(url, json={"profile_id": pid}).json()
    assert body["reviewed"] is False and body["sources"][0]["employer"] == "Acme"
    client.post(url, json={"profile_id": pid})
    assert len(calls) == 1  # same role, same day: cached
    other = [p["subject"] for p in _pending(client)][:5]
    for cap in other:  # four more different searches use up the hour's allowance
        client.post(f"/api/evidence/pending/{next(p['id'] for p in _pending(client) if p['subject'] == cap)}/approve",
                    json={"reviewer": "Team Reviewer"}, headers=ADMIN)
    statuses = [client.post(f"/api/emerging/{cap}/search", json={"profile_id": pid}).status_code for cap in other]
    assert statuses.count(429) >= 1 and statuses[0] == 200
    assert client.post("/api/emerging/not_a_capability/search", json={"profile_id": pid}).status_code == 404


def test_role_openings_are_live_unreviewed_job_ads_first_and_share_the_limit(client, monkeypatch):
    calls = []

    def live(role, skills, **_):
        calls.append(role["id"])
        return {"sources": [
            {"url": "https://example.org/blog", "title": "Blog", "employer": "", "kind": "web", "grounded": True, "quotes": []},
            {"url": "https://www.jobstreet.com.my/job/1", "title": "Data Analyst", "employer": "Acme Sdn Bhd",
             "kind": "job_ad", "grounded": True, "quotes": [{"skill_id": "sql", "skill_name": "SQL", "quote": "Strong SQL"}]}]}

    monkeypatch.setattr(search, "search_role", live)
    emerging.clear_live_cache()
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    body = client.post("/api/roles/data_analyst/openings", json={"profile_id": pid}).json()
    assert body["reviewed"] is False and body["sources"][0]["kind"] == "job_ad" and body["sources"][0]["quote"] == "Strong SQL"
    client.post("/api/roles/data_analyst/openings", json={"profile_id": pid})
    assert calls == ["data_analyst"]  # cached for the day
    roles = ["admin_assistant", "ux_designer", "care_worker", "software_developer", "sustainability_analyst"]
    statuses = [client.post(f"/api/roles/{r}/openings", json={"profile_id": pid}).status_code for r in roles]
    assert statuses[:4] == [200] * 4 and statuses[4] == 429  # five searches an hour per profile
    assert client.post("/api/roles/nope/openings", json={"profile_id": pid}).status_code == 404
