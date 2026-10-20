"""'What if I learn...?': try skills on for size; nothing is saved."""

SKILLS = ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"]


def _rank(result, role_id):
    return next(r for r in result["roles"] if r["role_id"] == role_id)


def test_what_if_moves_rank_without_saving(client):
    pid = client.post("/api/profiles", json={"skills": SKILLS}).json()["id"]
    plain = client.get(f"/api/profiles/{pid}/matches").json()
    what_if = client.get(f"/api/profiles/{pid}/matches", params={"extra": "sql,python,data_visualization"}).json()
    before, after = _rank(plain, "data_analyst"), _rank(what_if, "data_analyst")
    assert after["fit"] > before["fit"] and after["rank"] <= before["rank"]
    assert after["rank_without_extra"] == before["rank"]
    assert "rank_without_extra" not in before
    assert client.get(f"/api/profiles/{pid}").json()["skills"] == SKILLS


def test_what_if_rejects_unknown_or_too_many_skills(client):
    pid = client.post("/api/profiles", json={"skills": SKILLS}).json()["id"]
    assert client.get(f"/api/profiles/{pid}/matches", params={"extra": "astrophysics"}).status_code == 422
    many = ",".join(["sql", "python", "statistics", "git", "seo", "solar_pv", "ui_design", "ux_research",
                     "mlops", "javascript", "power_bi"])
    assert client.get(f"/api/profiles/{pid}/matches", params={"extra": many}).status_code == 422
