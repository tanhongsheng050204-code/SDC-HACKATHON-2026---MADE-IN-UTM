"""The four-step journey and the chosen target role."""


def _profile(client, **extra) -> str:
    body = {"skills": ["excel", "data_entry", "communication"], **extra}
    return client.post("/api/profiles", json=body).json()["id"]


def _steps(client, pid) -> dict:
    data = client.get(f"/api/profiles/{pid}/journey").json()
    return {s["id"]: s["done"] for s in data["steps"]} | {"next": data["next"]}


def test_a_new_graduate_starts_at_explore(client):
    pid = _profile(client, audience="graduate")
    assert _steps(client, pid) == {"stand": True, "explore": False, "build": False, "apply": False, "next": "explore"}


def test_target_role_is_chosen_cleared_and_validated(client):
    pid = _profile(client)
    profile = client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"}).json()
    assert profile["target_role_id"] == "data_analyst"
    journey = client.get(f"/api/profiles/{pid}/journey").json()
    assert journey["target_title"] == "Data analyst" and journey["next"] == "build"
    assert client.put(f"/api/profiles/{pid}/target", json={"role_id": "astronaut"}).status_code == 422
    assert client.put(f"/api/profiles/{pid}/target", json={"role_id": None}).json()["target_role_id"] is None


def test_target_survives_a_profile_edit(client):
    pid = _profile(client)
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    edited = client.put(f"/api/profiles/{pid}", json={"skills": ["excel", "sql"]}).json()
    assert edited["target_role_id"] == "data_analyst"


def test_finishing_a_course_completes_build(client):
    pid = _profile(client)
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    plan = client.get(f"/api/profiles/{pid}/pathway", params={"role": "data_analyst"}).json()
    assert _steps(client, pid)["build"] is False
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": plan["steps"][0]["course"]["id"]})
    assert _steps(client, pid)["build"] is True


def test_finished_interview_or_target_card_completes_apply(client):
    pid = _profile(client)
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    client.post(f"/api/profiles/{pid}/cards", json={"role_id": "software_developer"})
    assert _steps(client, pid)["apply"] is False  # a card for another role doesn't count
    client.post(f"/api/profiles/{pid}/cards", json={"role_id": "data_analyst"})
    assert _steps(client, pid)["apply"] is True

    other = _profile(client)
    turns = [{"question": f"Q{i}", "answer": "An answer with some detail."} for i in range(5)]
    reply = client.post("/api/interview", json={"profile_id": other, "role_id": "data_analyst", "turns": turns}).json()
    assert reply["done"] and _steps(client, other)["apply"] is True


def test_workers_need_a_current_job_for_the_first_step(client):
    pid = _profile(client, audience="worker", current_role_id="data_entry_clerk")
    assert _steps(client, pid)["stand"] is True
