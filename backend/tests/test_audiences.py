"""The four groups in the brief get different, checkable behaviour (spec section 11)."""

import dataclasses

from app.reference import get_reference
from app.services import matching, pathway

CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk"}
GRAD = {"skills": ["excel", "social_media_marketing", "content_writing", "communication", "statistics"],
        "current_role_id": None, "audience": "graduate"}


def test_worker_and_switcher_need_a_current_role(client):
    for audience in ("worker", "switcher"):
        body = {"skills": ["excel"], "audience": audience}
        response = client.post("/api/profiles", json=body)
        assert response.status_code == 422 and "current role" in response.text, audience
    assert client.post("/api/profiles", json={"skills": ["excel"], "audience": "graduate"}).status_code == 201
    saved = client.post("/api/profiles", json={"skills": ["excel"], "audience": "switcher",
                                               "current_role_id": "customer_service_rep"}).json()
    assert saved["audience"] == "switcher"


def test_graduate_gets_entry_boost_on_entry_roles_only():
    ref = get_reference()
    roles = matching.match(ref, GRAD, "baseline")["roles"]
    for role in roles:
        expected = matching.ENTRY_BOOST if ref.roles[role["role_id"]]["entry_level"] else 0.0
        assert role["why"]["entry_points"] == expected, role["role_id"]
    as_worker = matching.match(ref, {**GRAD, "audience": "worker"}, "baseline")["roles"]
    assert all(r["why"]["entry_points"] == 0 for r in as_worker)


def test_switcher_current_role_is_set_apart():
    ref = get_reference()
    switcher = {**CLERK, "audience": "switcher"}
    result = matching.match(ref, switcher, "baseline")
    assert all(r["role_id"] != "data_entry_clerk" for r in result["roles"])
    assert result["current_role"]["role_id"] == "data_entry_clerk"
    assert [r["rank"] for r in result["roles"]] == list(range(1, len(result["roles"]) + 1))
    worker = matching.match(ref, CLERK, "baseline")
    assert worker["current_role"]["role_id"] == "data_entry_clerk"
    assert any(r["role_id"] == "data_entry_clerk" for r in worker["roles"])


def test_carry_over_lists_shared_skills():
    ref = get_reference()
    roles = {r["role_id"]: r for r in matching.match(ref, CLERK, "baseline")["roles"]}
    carried = {s["skill_id"] for s in roles["admin_assistant"]["carry_over"]}
    assert carried == {"office_admin", "excel"}  # skills the clerk has that both jobs use
    assert all(not r["carry_over"] for r in matching.match(ref, GRAD, "baseline")["roles"])


def test_worker_pathway_prefers_claimable_courses():
    ref = get_reference()
    paid = next(c for c in ref.courses if c["id"] == "sql_for_data_science")
    twin = {**paid, "id": "sql_claimable_twin", "title": "SQL (HRD Corp claimable)", "hrd_corp": "claimable"}
    patched = dataclasses.replace(ref, courses=[*ref.courses, twin])
    profile = {"skills": ["excel", "data_visualization", "problem_solving", "statistics", "python", "communication"],
               "current_role_id": "data_entry_clerk"}
    first = lambda p: [s["course"]["id"] for s in pathway.build(patched, p, "data_analyst", summarize=False)["steps"]]  # noqa: E731
    assert "sql_claimable_twin" in first({**profile, "audience": "worker"})
    assert "sql_claimable_twin" not in first({**profile, "audience": "graduate"})
