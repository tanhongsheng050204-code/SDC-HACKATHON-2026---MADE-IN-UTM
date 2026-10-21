"""Published AI-exposure estimates, Malaysian AI use, programme links and identity statements."""

import csv
from pathlib import Path

import pytest

from app.reference import get_reference
from app.services import exposure, identity

DATA = Path(__file__).resolve().parents[1] / "data"


def _clerk(client) -> str:
    return client.post("/api/profiles/demo/clerk").json()["id"]


def test_every_role_has_occupation_codes_and_the_data_covers_them():
    ref = get_reference()
    assert set(ref.role_occupations) == set(ref.roles)
    for role_id, codes in ref.role_occupations.items():
        scores = ref.ai_exposure["roles"][role_id]
        if codes["soc"] is None:
            assert scores == {} and codes["note"], role_id  # not compared, and the page says why
        else:
            assert "openai" in scores and "ilo" in scores, role_id
            assert all(0 <= s["percentile"] <= 100 for s in scores.values())


def test_ilo_table_is_complete_and_matches_the_paper():
    with (DATA / "raw" / "ilo_wp140_table_a1.csv").open(encoding="utf-8") as f:
        rows = {r["isco08"]: r for r in csv.DictReader(f)}
    assert len(rows) > 400
    assert rows["4132"]["occupation"] == "Data Entry Clerks" and rows["4132"]["mean"] == "0.7"
    assert rows["4132"]["gradient"] == "Gradient 4" and rows["7411"]["gradient"] == "Not Exposed"
    assert not any(ch.isdigit() for r in rows.values() for ch in r["occupation"])


def test_percentile_counts_ties_as_half():
    from scripts.build_ai_exposure import percentile
    assert percentile(0.0, [0.0, 0.0, 0.5, 1.0]) == 25.0
    assert percentile(1.0, [0.0, 0.5, 1.0]) == pytest.approx(83.3)


def test_role_band_and_ranks(client):
    clerk = client.get("/api/roles/data_entry_clerk/exposure").json()
    assert [s["id"] for s in clerk["sources"]] == ["anthropic", "openai", "ilo"]
    assert clerk["band"]["low"] <= clerk["band"]["mean"] <= clerk["band"]["high"]
    assert clerk["laluan"]["rank"] == 1 and clerk["published_ranks"]["low"] == 1 and not clerk["flag"]
    assert clerk["malaysia"]["name"].startswith("Office and Administrative")
    new = client.get("/api/roles/ai_operations_specialist/exposure").json()
    assert new["sources"] == [] and new["band"] is None and new["note"]


def test_flag_marks_roles_where_laluan_is_outside_every_study():
    ref = get_reference()
    r = exposure.ranks(ref)
    for role_id in exposure.flagged(ref):
        published = [r[s][role_id] for s in exposure.SOURCES if role_id in r[s]]
        own = r["laluan"][role_id]
        assert own < min(published) - exposure.TOLERANCE or own > max(published) + exposure.TOLERANCE


def test_map_plots_compared_roles_and_lists_the_rest(client):
    data = client.get("/api/exposure/map", params={"scenario": "accelerated"}).json()
    plotted = {p["role_id"] for p in data["points"]}
    assert {m["role_id"] for m in data["missing"]} == {"ai_operations_specialist"}
    assert len(plotted) + len(data["missing"]) == len(get_reference().roles)
    clerk = next(p for p in data["points"] if p["role_id"] == "data_entry_clerk")
    matches = client.post("/api/profiles/demo/clerk").json()["id"]
    role = next(r for r in client.get(f"/api/profiles/{matches}/matches", params={"scenario": "accelerated"}).json()["roles"]
                if r["role_id"] == "data_entry_clerk")
    assert clerk["outlook"] == role["outlook"]["accelerated"]["index"]


def test_malaysia_ai_use(client):
    data = client.get("/api/malaysia/ai-use").json()
    assert data["month"] and data["requests"] and data["licence"] == "CC BY"
    assert all(r["mys_pct"] > 0 for r in data["requests"])
    assert data["requests"] == sorted(data["requests"], key=lambda r: -r["mys_pct"])


def test_tasks_carry_observed_ai_use_where_published(client):
    data = client.get("/api/roles/data_entry_clerk/tasks").json()
    observed = [t["observed"] for t in data["tasks"] if t["observed"]]
    assert observed and all(0 <= o["automation_pct"] <= 100 for o in observed)
    assert data["observed_source"]["licence"] == "CC BY"


def test_programme_links(client):
    dev = client.get("/api/roles/software_developer/programmes").json()
    assert dev["mycol"]["entry"]["match"] == "listed" and dev["mycol"]["entry"]["page"]
    clerk = client.get("/api/roles/data_entry_clerk/programmes").json()
    assert clerk["mycol"]["entry"] is None and clerk["jelajah_ai"]["url"].startswith("https://")
    assert client.get("/api/roles/astronaut/programmes").status_code == 404


def test_identity_statement_uses_only_profile_facts(client):
    pid = _clerk(client)
    data = client.get(f"/api/profiles/{pid}/roles/data_analyst/identity").json()
    assert data["mode"] == "rules"
    assert data["statement"].startswith("I'm a data entry clerk who already brings")
    assert data["facts"]["building"] and data["facts"]["building"] in data["statement"]


def test_rules_statement_for_a_student_with_no_matching_skills():
    text = identity.rules_statement({"target": "Data analyst", "current": None, "have": [], "building": "SQL"})
    assert text == "I'm starting out moving into work as a data analyst. I'm building SQL next."


def test_model_statement_off_the_facts_falls_back(monkeypatch):
    identity._model_statement.cache_clear()
    monkeypatch.setattr(identity, "generate_json", lambda prompt: {"statement": "I am a rocket scientist."})
    assert identity._model_statement("Data analyst", None, ("Spreadsheets",), "SQL", "en") is None
    identity._model_statement.cache_clear()
    monkeypatch.setattr(identity, "generate_json", lambda prompt: {"statement": "I bring spreadsheets."})
    assert identity._model_statement("Data analyst", None, ("Spreadsheets",), "SQL", "en") == "I bring spreadsheets."
    identity._model_statement.cache_clear()


def test_future_card_shows_the_rules_statement(client):
    pid = _clerk(client)
    card = client.post(f"/api/profiles/{pid}/cards", json={"role_id": "data_analyst"}).json()
    view = client.get(f"/api/cards/{card['id'] if 'id' in card else card['card_id']}").json()
    assert view["identity"].startswith("I'm a data entry clerk")
