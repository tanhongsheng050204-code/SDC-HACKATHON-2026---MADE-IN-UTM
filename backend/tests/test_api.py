def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["llm_mode"] == "offline"


def test_primary_journey(client):
    cv = ("Data entry clerk at a logistics firm for six years. I use Excel daily, including pivot "
          "tables, and help with customer service on the phone.")
    extracted = client.post("/api/intake/extract", json={"text": cv}).json()
    assert {"data_entry", "excel", "customer_service"} <= set(extracted["skills"])

    created = client.post("/api/profiles", json={
        "current_role_id": "data_entry_clerk", "skills": extracted["skills"], "interests": [8]})
    assert created.status_code == 201
    pid = created.json()["id"]

    baseline = client.get(f"/api/profiles/{pid}/matches", params={"scenario": "baseline"}).json()
    fast = client.get(f"/api/profiles/{pid}/matches", params={"scenario": "accelerated"}).json()
    assert len(baseline["roles"]) >= 5
    assert [r["role_id"] for r in baseline["roles"]] != [r["role_id"] for r in fast["roles"]]

    top = baseline["roles"][0]["role_id"]
    plan = client.get(f"/api/profiles/{pid}/pathway", params={"role": top}).json()
    assert "steps" in plan and "grounding" in plan

    assert client.delete(f"/api/profiles/{pid}").status_code == 204
    assert client.get(f"/api/profiles/{pid}").status_code == 404


def test_demo_profile(client):
    body = client.post("/api/profiles/demo/student").json()
    assert body["story"] and body["skills"]


def test_validation(client):
    assert client.post("/api/profiles", json={"skills": ["not_a_skill"]}).status_code == 422
    assert client.post("/api/profiles", json={"skills": ["excel"], "display_name": "me@x.com"}).status_code == 422
    assert client.post("/api/intake/extract", json={"text": "too short"}).status_code == 422
    assert client.get("/api/profiles/nope/matches").status_code == 404


def test_intake_turn(client):
    first = client.post("/api/intake/turn", json={"messages": []}).json()
    assert not first["is_complete"] and first["next_question"]
    reply = client.post("/api/intake/turn", json={"messages": [
        {"role": "assistant", "content": first["next_question"]},
        {"role": "user", "content": "I'm a customer service agent and use Excel."}]}).json()
    assert {"customer_service", "excel"} <= set(reply["skills_found"])


def test_snapshot_import_requires_admin(client):
    assert client.post("/api/signals/import", json={}).status_code == 401
    listed = client.get("/api/signals").json()
    assert listed[0]["illustrative"] is True and listed[0]["signal_count"] >= 10


def test_fairness_demographic_fields_are_rejected(client):
    """Recommendations cannot depend on age, gender or background: the API refuses them."""
    for field, value in [("age", 52), ("gender", "female"), ("ethnicity", "x"), ("religion", "x")]:
        response = client.post("/api/profiles", json={"skills": ["excel"], field: value})
        assert response.status_code == 422, field


def test_fairness_name_does_not_change_ranking(client):
    ids = [client.post("/api/profiles", json={"skills": ["excel", "sql"], "display_name": n}).json()["id"]
           for n in ("Aisyah", "Muthu", "Wei Jie")]
    rankings = [[r["role_id"] for r in client.get(f"/api/profiles/{i}/matches").json()["roles"]] for i in ids]
    assert rankings[0] == rankings[1] == rankings[2]


def test_health_names_the_model(client):
    assert "offline" in client.get("/api/health").json()["llm_model"].lower()


def _snapshot(**overrides):
    base = {"snapshot_id": "2099-01-01-test", "source": "Test source", "source_url": "https://example.org",
            "published": "2025-01-07", "imported": "2099-01-01", "horizon_year": 2030, "illustrative": True,
            "signals": [{"role_id": "data_entry_clerk", "net_growth_pct": -20, "automation_exposure": 0.8,
                         "ai_complementarity": 0.2}]}
    return {**base, **overrides}


def test_snapshot_import_rejects_unsafe_ids_and_bad_numbers(client):
    admin = {"X-Admin-Token": "test-admin-token"}
    for bad_id in ["../../app/x", r"..\..\x","/tmp/x", "C:/x", "a/b", "", ".hidden", "x" * 120]:
        response = client.post("/api/signals/import", json=_snapshot(snapshot_id=bad_id), headers=admin)
        assert response.status_code == 422, bad_id
    bad_signal = {"role_id": "data_entry_clerk", "net_growth_pct": "lots", "automation_exposure": 5,
                  "ai_complementarity": 0.2}
    assert client.post("/api/signals/import", json=_snapshot(signals=[bad_signal]),
                       headers=admin).status_code == 422


def test_snapshot_import_writes_inside_signals_dir(client, tmp_path, monkeypatch):
    import shutil

    from app.config import get_settings
    from app.reference import get_reference

    data = tmp_path / "data"
    shutil.copytree(get_settings().data_dir, data)
    monkeypatch.setenv("DATA_DIR", str(data))
    get_settings.cache_clear()
    get_reference.cache_clear()
    response = client.post("/api/signals/import", json=_snapshot(), headers={"X-Admin-Token": "test-admin-token"})
    assert response.status_code == 201
    assert (data / "signals" / "2099-01-01-test.json").exists()
    assert client.get("/api/health").json()["snapshot"] == "2099-01-01-test"


def test_intake_turn_in_chinese_still_finds_english_tool_names(client):
    first = client.post("/api/intake/turn", json={"messages": [], "language": "zh"}).json()
    assert "工作" in first["next_question"]
    reply = client.post("/api/intake/turn", json={"language": "zh", "messages": [
        {"role": "assistant", "content": first["next_question"]},
        {"role": "user", "content": "我是客服，每天用 Excel 做报表。"}]}).json()
    assert "excel" in reply["skills_found"]
