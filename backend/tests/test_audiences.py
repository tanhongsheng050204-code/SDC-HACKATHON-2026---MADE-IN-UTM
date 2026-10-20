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


# --- One guarantee per group in the brief, through the API with the demo people judges see. ---

def _demo(client, key):
    pid = client.post(f"/api/profiles/demo/{key}").json()["id"]
    return pid, client.get(f"/api/profiles/{pid}/matches").json()


def test_group_working_adult(client):
    pid, result = _demo(client, "clerk")
    assert result["current_role"]["role_id"] == "data_entry_clerk"
    assert result["current_role"]["outlook"]["baseline"]["label"] in {"declining", "stable", "growing", "emerging"}
    reachable = [r for r in result["roles"][:5] if not r["at_risk"] and r["fit"] >= 0.4]
    assert reachable, "a working adult at risk needs a reachable, non-declining role in the top five"
    plan = client.get(f"/api/profiles/{pid}/pathway", params={"role": reachable[0]["role_id"]}).json()
    assert plan["steps"]


def test_group_graduate(client):
    _, result = _demo(client, "student")
    entry = [r for r in result["roles"][:5] if r["why"]["entry_points"] > 0]
    assert entry, "a graduate needs at least one role they can start in among the top five"


def test_group_switcher(client):
    _, result = _demo(client, "switcher")
    assert result["current_role"]["role_id"] == "customer_service_rep"
    assert all(r["role_id"] != "customer_service_rep" for r in result["roles"][:5])
    assert len(result["roles"][0]["carry_over"]) >= 2


def test_group_hr(client):
    sample = client.get("/api/workforce/sample").text
    result = client.post("/api/workforce/analyse", json={"csv": sample}).json()
    assert result["employees"] == 160 and len(result["roles"]) < 160
    assert all("name" not in r and "person" not in r for r in result["roles"])
    assert result["moves"] and all(m["people"] >= 1 and m["avg_hours"] >= 0 for m in result["moves"])


def test_group_career_centre(client):
    sample = client.get("/api/class/sample").text
    result = client.post("/api/class/analyse", json={"csv": sample}).json()
    assert result["students"] == 40 and len(result["best_fit"]) < 40
    assert len(result["top_gaps"]) >= 3 and all(g["course"] for g in result["top_gaps"])
