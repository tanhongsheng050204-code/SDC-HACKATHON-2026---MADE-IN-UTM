"""A day in this job: drafted from our own data, then a richer version from approved job ads."""

import pytest

from app import store
from app.evidence import day, search
from app.reference import get_reference
from tests.test_evidence import ADS, FakeAds

ADMIN = {"X-Admin-Token": "test-admin-token"}
TEXT = {"en": "You check records all day.", "ms": "Anda menyemak rekod.", "zh": "你整天核对记录。"}


def fake_generate(answer):
    prompts = []

    def call(prompt, timeout_seconds=None):
        prompts.append(prompt)
        return answer
    call.prompts = prompts
    return call


def test_every_role_has_a_day_in_all_three_languages():
    ref = get_reference()
    assert set(ref.day_in_job) == set(ref.roles)
    for role_id, entry in ref.day_in_job.items():
        assert all(entry["text"][lang].strip() for lang in day.LANGS), role_id
        assert entry["basis"] == "data", role_id


def test_facts_come_from_our_data_only():
    facts = day.facts(get_reference(), "data_entry_clerk")
    assert facts["tasks"] and facts["main_skills"][0] == "Data entry"
    assert "working at a desk" in facts["work_setting"]
    assert "RM2,693" in facts["pay"] and "whole occupation group" in facts["pay"]
    assert facts["sdg_reasons"] and "from_malaysian_job_ads" not in facts


def test_draft_needs_all_three_languages():
    ref = get_reference()
    entry = day.draft(ref, "data_analyst", generate=fake_generate(TEXT))
    assert entry["text"] == TEXT and entry["basis"] == "data" and entry["reviewed_by"] is None
    with pytest.raises(day.Unusable):
        day.draft(ref, "data_analyst", generate=fake_generate({**TEXT, "zh": " "}))
    with pytest.raises(day.Unusable):
        day.draft(ref, "data_analyst", generate=fake_generate({**TEXT, "en": "x" * (day.MAX_CHARS + 1)}))


def test_role_page_reads_the_committed_text(client):
    body = client.get("/api/roles/care_worker/day").json()
    assert body["basis"] == "data" and set(body["text"]) == {"en", "ms", "zh"}
    assert "facts" not in body
    assert client.get("/api/roles/nope/day").status_code == 404


def test_approving_evidence_drafts_a_richer_version_for_review(client, monkeypatch):
    generate = fake_generate({"en": "Ads ask for SQL daily.", "ms": "Iklan minta SQL.", "zh": "招聘广告要求SQL。"})
    monkeypatch.setattr(day, "queue_in_background", lambda role_id, body: day.queue_for(role_id, body, generate=generate))
    role = get_reference().roles["data_analyst"]
    store.save_evidence("ev-1", "role", "data_analyst", search.search_role(role, get_reference().skills, fetch=FakeAds(ADS)))
    before = client.get("/api/roles/data_analyst/day").json()["text"]

    client.post("/api/evidence/pending/ev-1/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN)
    assert "from_malaysian_job_ads" in generate.prompts[0]  # the approved quotes are offered to the draft
    pending = client.get("/api/evidence/pending?kind=day", headers=ADMIN).json()
    assert [(p["role_id"], p["basis"]) for p in pending] == [("data_analyst", "job_ads")]
    assert client.get("/api/roles/data_analyst/day").json()["text"] == before  # nothing until approved

    detail = client.get(f"/api/evidence/pending/{pending[0]['id']}", headers=ADMIN).json()
    assert detail["current"] == before and detail["facts"]["from_malaysian_job_ads"]
    client.post(f"/api/evidence/pending/{pending[0]['id']}/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN)
    shown = client.get("/api/roles/data_analyst/day").json()
    assert shown["text"]["en"] == "Ads ask for SQL daily." and shown["basis"] == "job_ads"
    assert shown["reviewed_by"] == "Team Reviewer"


def test_a_failed_draft_does_not_undo_the_evidence_approval(client, monkeypatch):
    def broken(prompt, timeout_seconds=None):
        raise TimeoutError("slow")
    monkeypatch.setattr(day, "queue_in_background", lambda role_id, body: day.queue_for(role_id, body, generate=broken))
    role = get_reference().roles["data_analyst"]
    store.save_evidence("ev-2", "role", "data_analyst", search.search_role(role, get_reference().skills, fetch=FakeAds(ADS)))
    assert client.post("/api/evidence/pending/ev-2/approve", json={"reviewer": "Team Reviewer"}, headers=ADMIN).status_code == 200
    assert client.get("/api/evidence/pending?kind=day", headers=ADMIN).json() == []
    assert client.get("/api/roles/data_analyst").json()["evidence"]["reviewed_by"] == "Team Reviewer"
