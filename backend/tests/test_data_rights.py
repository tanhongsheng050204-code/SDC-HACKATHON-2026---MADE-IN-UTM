"""Data rights: a dated consent record at creation, Download my data, and delete removes everything."""
from app import store


def test_new_profiles_record_consent(client):
    pid = client.post("/api/profiles", json={"skills": ["excel"], "current_role_id": "data_entry_clerk"}).json()["id"]
    demo = client.post("/api/profiles/demo/clerk").json()["id"]
    for p in (pid, demo):
        consents = store.list_consents(p)
        assert [(c["kind"], c["given"]) for c in consents] == [("profile_storage", True)]
        assert consents[0]["version"] and consents[0]["created_at"]


def test_download_my_data_has_every_table(client):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": True})
    client.post(f"/api/profiles/{pid}/cards", json={"role_id": "data_analyst"})
    store.set_skill_level(pid, "sql", 1)
    r = client.get(f"/api/profiles/{pid}/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    body = r.json()
    assert body["profile"]["id"] == pid and body["profile"]["completed_courses"] == ["khan_statistics"]
    assert [e["kind"] for e in body["progress_events"]] == ["destination_set", "course_finished"]
    assert body["consents"][0]["kind"] == "profile_storage"
    assert body["proven_skills"] == [{"skill_id": "sql", "level": 1, "proven_at": body["proven_skills"][0]["proven_at"]}]
    assert len(body["future_cards"]) == 1 and body["survey_answers"]  # the demo arrives with its survey done
    assert {"exported_at", "about"} <= set(body)


def test_export_follows_the_same_access_rule(client):
    assert client.get("/api/profiles/no-such-profile/export").status_code == 404


def test_delete_removes_every_new_table(client):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": "khan_statistics", "done": True})
    assert client.delete(f"/api/profiles/{pid}").status_code == 204
    rows = store.export_rows(pid)
    assert all(v == [] for v in rows.values())
    assert client.get(f"/api/profiles/{pid}/export").status_code == 404


def test_an_owned_profile_exports_only_to_its_account(client):
    from tests.test_auth import token
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    assert client.post("/api/me/claim", json={"profile_id": pid}, headers=token("owner-1")).status_code == 200
    assert client.get(f"/api/profiles/{pid}/export").status_code == 404
    assert client.get(f"/api/profiles/{pid}/export", headers=token("someone-else")).status_code == 404
    assert client.get(f"/api/profiles/{pid}/export", headers=token("owner-1")).status_code == 200
