"""The application tracker: jobs saved or applied for, kept with the profile and nothing else."""


def _profile(client):
    return client.post("/api/profiles", json={"skills": ["excel", "data_entry"], "display_name": "Aisyah"}).json()["id"]


def test_track_a_job_from_saved_to_interview(client):
    pid = _profile(client)
    made = client.post(f"/api/profiles/{pid}/applications", json={
        "role_id": "ai_operations_specialist", "title": "AI Operations Executive", "employer": "Acme Sdn Bhd",
        "url": "https://www.jobstreet.com.my/job/1", "note": "Call Aisyah at 012-345 6789 or aisyah@mail.my"})
    assert made.status_code == 201
    app = made.json()
    assert app["status"] == "saved" and app["employer"] == "Acme Sdn Bhd"
    assert "012-345 6789" not in app["note"] and "aisyah@mail.my" not in app["note"]  # contact details removed
    moved = client.patch(f"/api/profiles/{pid}/applications/{app['id']}", json={"status": "interview", "interview_date": "2026-11-03"}).json()
    assert moved["status"] == "interview" and moved["interview_date"] == "2026-11-03" and moved["title"] == "AI Operations Executive"
    assert [a["id"] for a in client.get(f"/api/profiles/{pid}/applications").json()] == [app["id"]]
    assert client.delete(f"/api/profiles/{pid}/applications/{app['id']}").status_code == 204
    assert client.get(f"/api/profiles/{pid}/applications").json() == []


def test_bad_input_is_refused(client):
    pid = _profile(client)
    base = f"/api/profiles/{pid}/applications"
    assert client.post(base, json={"title": "X", "url": "javascript:alert(1)"}).status_code == 422
    assert client.post(base, json={"title": "X", "status": "hired"}).status_code == 422
    assert client.post(base, json={"title": "X", "role_id": "astronaut"}).status_code == 422
    assert client.post(base, json={"title": "X", "cv": "..."}).status_code == 422  # no extra fields, never a CV
    assert client.patch(f"{base}/nope", json={"status": "applied"}).status_code == 404


def test_applications_are_in_my_data_and_go_with_the_profile(client):
    pid = _profile(client)
    client.post(f"/api/profiles/{pid}/applications", json={"title": "Data Analyst", "status": "applied"})
    export = client.get(f"/api/profiles/{pid}/export").json()
    rows = export["job_applications"] if "job_applications" in export else export["data"]["job_applications"]
    assert rows[0]["title"] == "Data Analyst" and rows[0]["status"] == "applied"
    assert client.delete(f"/api/profiles/{pid}").status_code in (200, 204)
    from app import store
    assert store.list_applications(pid) == []


def test_someone_elses_profile_looks_missing(client):
    pid = _profile(client)
    other = _profile(client)
    made = client.post(f"/api/profiles/{pid}/applications", json={"title": "Data Analyst"}).json()
    assert client.patch(f"/api/profiles/{other}/applications/{made['id']}", json={"status": "offer"}).status_code == 404
    assert client.get(f"/api/profiles/{pid}/applications").json()[0]["status"] == "saved"
