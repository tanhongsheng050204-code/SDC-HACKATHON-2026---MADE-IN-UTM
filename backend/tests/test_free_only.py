"""The pathway's "Free courses only" option."""

from app.reference import get_reference


def _plan(client, pid, role, free_only):
    return client.get(f"/api/profiles/{pid}/pathway", params={"role": role, "free_only": free_only}).json()


def _profile(client, skills=("excel", "communication", "data_entry")) -> str:
    return client.post("/api/profiles", json={"skills": list(skills)}).json()["id"]


def test_free_only_plans_use_free_or_audit_courses(client):
    pid = _profile(client)
    for role_id in get_reference().roles:
        plan = _plan(client, pid, role_id, True)
        assert plan["free_only"] is True
        assert all(s["course"]["cost"] in ("free", "free_audit") for s in plan["steps"]), role_id


def test_free_only_off_is_the_normal_plan(client):
    pid = _profile(client)
    normal = client.get(f"/api/profiles/{pid}/pathway", params={"role": "sustainability_analyst"}).json()
    off = _plan(client, pid, "sustainability_analyst", False)
    assert [s["course"]["id"] for s in normal["steps"]] == [s["course"]["id"] for s in off["steps"]]
    assert off["free_only"] is False


def test_skills_without_a_free_course_are_reported_uncovered(client):
    pid = _profile(client)
    ref = get_reference()
    changed = 0
    for role_id in ref.roles:
        normal, free = _plan(client, pid, role_id, False), _plan(client, pid, role_id, True)
        # Every skill the paid plan taught is either still taught by a free course or reported.
        taught_free = {k["skill_id"] for s in free["steps"] for k in s["skills"]}
        for s in normal["steps"]:
            for k in s["skills"]:
                assert k["skill_id"] in taught_free or k["skill_id"] in free["uncovered_skills"], (role_id, k)
        changed += set(free["uncovered_skills"]) != set(normal["uncovered_skills"])
    assert changed >= 1  # some roles have skills only paid courses teach
