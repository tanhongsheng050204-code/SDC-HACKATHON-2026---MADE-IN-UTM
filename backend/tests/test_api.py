def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["llm_mode"] == "offline"


def test_primary_journey(client):
    cv = ("Data entry clerk at a logistics firm for six years. I use Excel daily, including pivot "
          "tables, and help with customer service on the phone.")
    extracted = client.post("/api/intake/extract", json={"text": cv}).json()
    assert {"data_entry", "excel", "customer_service"} <= set(extracted["skills"])

    created = client.post("/api/profiles", json={
        "current_role_id": "data_entry_clerk", "skills": extracted["skills"]})
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
    # The live forecast is the cited WEF snapshot; the illustrative seed is kept for history.
    assert listed[0]["illustrative"] is False and listed[0]["signal_count"] == 13
    assert "Future of Jobs Report 2025" in listed[0]["source"]
    assert any(s["illustrative"] for s in listed[1:])


def test_wef_snapshot_matches_the_extracted_figure():
    """Every growth figure in the snapshot is the value read from WEF Figure 2.3, and says so."""
    import csv
    import json
    import re
    from pathlib import Path

    data = Path(__file__).resolve().parents[1] / "data"
    wef = {r["occupation"]: float(r["net_growth_pct"])
           for r in csv.DictReader((data / "raw" / "wef_foj2025_figure_2_3.csv").open(encoding="utf-8"))}
    snapshot = json.loads((data / "signals" / "2026-10-20-wef-foj-2025.json").read_text(encoding="utf-8"))
    for s in snapshot["signals"]:
        occupation, quoted = re.search(r"\(p\. 21\): (.+?) ([+-][\d.]+)% net growth", s["note"]).groups()
        assert wef[occupation] == s["net_growth_pct"] == float(quoted), s["role_id"]
        assert "team's estimates" in s["note"]


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


def test_snapshot_import_is_stored_as_approved(client, tmp_path, monkeypatch):
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
    from app import store

    assert not (data / "signals" / "2099-01-01-test.json").exists()
    assert store.get_snapshot("2099-01-01-test")["state"] == "approved"
    assert client.get("/api/health").json()["snapshot"] == "2099-01-01-test"
    again = client.post("/api/signals/import", json=_snapshot(imported="2099-02-01"), headers={"X-Admin-Token": "test-admin-token"})
    assert again.status_code == 409


def test_intake_turn_in_chinese_still_finds_english_tool_names(client):
    first = client.post("/api/intake/turn", json={"messages": [], "language": "zh"}).json()
    assert "工作" in first["next_question"]
    reply = client.post("/api/intake/turn", json={"language": "zh", "messages": [
        {"role": "assistant", "content": first["next_question"]},
        {"role": "user", "content": "我是客服，每天用 Excel 做报表。"}]}).json()
    assert "excel" in reply["skills_found"]


def test_cors_allows_listed_origins_and_the_pattern(tmp_path, monkeypatch):
    """Vercel serves one site under several addresses; all of them must reach the API."""
    import importlib

    from fastapi.testclient import TestClient

    import app.main
    from app.config import get_settings

    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("CORS_ORIGINS", "https://laluan-psi.vercel.app")
    monkeypatch.setenv("CORS_ORIGIN_REGEX", r"https://laluan(-[a-z0-9]+)*\.vercel\.app")
    get_settings.cache_clear()
    try:
        with TestClient(importlib.reload(app.main).app) as c:
            def allowed(origin: str) -> str | None:
                return c.get("/api/health", headers={"Origin": origin}).headers.get("access-control-allow-origin")

            assert allowed("https://laluan-psi.vercel.app") == "https://laluan-psi.vercel.app"
            assert allowed("https://laluan-team-1000011.vercel.app") == "https://laluan-team-1000011.vercel.app"
            assert allowed("https://evil.example.com") is None
            assert allowed("https://laluan.vercel.app.evil.com") is None
    finally:
        monkeypatch.delenv("CORS_ORIGIN_REGEX")
        get_settings.cache_clear()
        importlib.reload(app.main)


def test_evaluation_cvs_are_the_synthetic_files_only(client):
    cvs = client.get("/api/eval/cvs").json()
    assert [c["name"] for c in cvs] == [f"cv{i}_{n}.txt" for i, n in
                                        enumerate(["clerk", "student", "service", "technician", "manager"], 1)]
    assert all(len(c["text"]) > 200 and set(c) == {"name", "text"} for c in cvs)


def test_built_app_is_served_beside_the_api(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Laluan</title>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('laluan')", encoding="utf-8")
    monkeypatch.setenv("FRONTEND_DIST", str(dist))
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "t.db"))
    import importlib

    from fastapi.testclient import TestClient

    from app import main
    from app.config import get_settings
    from app.reference import get_reference

    get_settings.cache_clear()
    get_reference.cache_clear()
    with TestClient(importlib.reload(main).app) as c:
        assert "<title>Laluan</title>" in c.get("/").text
        assert "<title>Laluan</title>" in c.get("/anything", params={"view": "roles"}).text
        assert c.get("/assets/app.js").text == "console.log('laluan')"
        assert c.get("/api/health").json()["status"] == "ok"
        assert c.get("/api/no-such-route").status_code == 404
    get_settings.cache_clear()
    monkeypatch.delenv("FRONTEND_DIST")
    importlib.reload(main)


def test_profile_rejects_interests_field(client):
    body = {"skills": ["excel"], "interests": [13]}
    assert client.post("/api/profiles", json=body).status_code == 422


def test_role_history_lists_every_forecast_oldest_first(client):
    body = client.get("/api/roles/data_analyst/history").json()
    points = body["points"]
    assert len(points) >= 2 and [p["imported"] for p in points] == sorted(p["imported"] for p in points)
    assert points[0]["illustrative"] is True and all("index" in p and p["snapshot_id"] for p in points)
    assert client.get("/api/roles/nope/history").status_code == 404
