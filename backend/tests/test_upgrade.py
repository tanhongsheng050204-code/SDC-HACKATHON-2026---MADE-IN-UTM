"""Your job, with AI: the current role, AI-assisted, before any move; long shots; the shortest route."""

from app import store
from app.reference import get_reference
from app.services import matching, upgrade


def _profile(key: str) -> dict:
    p = get_reference().demo_profiles[key]
    return {**p, "preferences": p.get("preferences") or {}, "completed_courses": [], "skill_levels": {}}


def test_every_role_is_drafted_and_every_ai_skill_has_a_course():
    ref = get_reference()
    taught = {s for c in ref.courses for s in c["skills"]}
    assert set(ref.ai_upgrade) == set(ref.roles)
    for role_id, entry in ref.ai_upgrade.items():
        own = {rs["skill_id"] for rs in ref.roles[role_id]["skills"]}
        for s in entry["ai_skills"]:
            assert s["skill_id"] in ref.skills and s["skill_id"] in taught and s["skill_id"] not in own, (role_id, s)
            assert s["why"].strip()


def test_clerk_levels_up_in_place_with_a_short_plan():
    ref = get_reference()
    card = upgrade.for_profile(ref, _profile("clerk"))
    assert card["role_id"] == "data_entry_clerk" and card["title"] == "Data entry clerk"
    assert {s["skill_id"] for s in card["ai_skills"]} >= {"genai_tools", "critical_thinking"}
    assert 0 < card["total_hours"] <= 40  # a short plan: her existing skills all count
    assert card["readiness"] >= 0.5
    assert {t["change"] for t in card["tasks"]} <= {"check", "faster", "yours"}


def test_ai_jobs_and_people_without_a_job_get_no_ai_assisted_version(client):
    ref = get_reference()
    assert upgrade.for_profile(ref, {**_profile("clerk"), "current_role_id": "ai_ml_engineer"}) is None
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    assert client.get(f"/api/profiles/{pid}/ai-assisted").status_code == 404
    pid = client.post("/api/profiles", json={"skills": ["excel", "data_entry"], "current_role_id": "data_entry_clerk"}).json()["id"]
    body = client.get(f"/api/profiles/{pid}/ai-assisted").json()
    assert body["steps"] and all(set(s) >= {"course", "skills"} for s in body["steps"])


def test_approved_emerging_roles_from_this_job_are_where_it_can_lead(client):
    store.save_evidence("em-1", "emerging", "document_understanding",
                        {"title": {"en": "Document AI checker", "ms": "x", "zh": "x"}, "stepping_stone": "data_entry_clerk",
                         "capability_id": "document_understanding"})
    store.decide_evidence("em-1", "approved", "Team Reviewer", store.get_evidence("em-1")["body"])
    card = upgrade.for_profile(get_reference(), _profile("clerk"))
    assert [x["title"]["en"] for x in card["leads_to"]] == ["Document AI checker"]


def test_long_shots_get_a_stepping_stone_and_workers_get_a_shortest_route():
    ref = get_reference()
    result = matching.match(ref, _profile("clerk"), "baseline")
    long_shots = [r for r in result["roles"] if r["long_shot"]]
    assert long_shots and all(r["fit"] < matching.LONG_SHOT_FIT or r["requirements"]["needs_licence"]
                              or not r["why"]["has_core_skill"] for r in long_shots)
    assert any(r["stepping_stone"] for r in long_shots)
    shortest = next(r for r in result["roles"] if r["role_id"] == result["shortest_route"])
    assert shortest["outlook"]["baseline"]["label"] in ("growing", "emerging") and not shortest["is_current_role"]
    assert matching.match(ref, _profile("student"), "baseline")["shortest_route"] is None  # no current job
