"""Automatic re-planning, the fairness check and the SDG view for Malaysia."""
import copy
from dataclasses import replace

from app.reference import get_reference
from app.services import fairness, matching, region, replan

CLERK = {"id": "x", "display_name": None, "current_role_id": "data_entry_clerk", "skills": ["excel", "data_entry"],
         "experience_years": 3, "completed_courses": [], "audience": "worker", "preferences": {},
         "target_role_id": "data_analyst", "skill_levels": {}}


def _with_new_forecast(ref, role_id: str, growth: float):
    """The reference data plus one newer snapshot in which a role's growth changed."""
    snap = copy.deepcopy(ref.latest_snapshot)
    snap["snapshot_id"], snap["imported"] = "2099-01-01-test", "2099-01-01"
    for row in snap["signals"]:
        if row["role_id"] == role_id:
            row["net_growth_pct"] = growth
    return replace(ref, snapshots=[*ref.snapshots, snap])


def test_a_new_forecast_that_moves_roles_is_reported_with_a_suggestion():
    ref = get_reference()
    newer = _with_new_forecast(ref, "data_analyst", -40.0)  # the destination turns declining
    result = replan.compare(newer, CLERK)
    assert result["changed"] and result["to_snapshot"]["id"] == "2099-01-01-test"
    dest = result["destination"]
    assert dest["role_id"] == "data_analyst" and dest["rank_after"] > dest["rank_before"]
    assert dest["label_after"] == "declining"
    assert any(m["role_id"] == "data_analyst" for m in result["moves"])


def test_nothing_changed_means_nothing_reported():
    ref = get_reference()
    same = replace(ref, snapshots=[*ref.snapshots, {**copy.deepcopy(ref.latest_snapshot), "snapshot_id": "same", "imported": "2099-01-02"}])
    result = replan.compare(same, CLERK)
    assert not result["changed"] and result["moves"] == []


def test_replan_endpoint(client):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    body = client.get(f"/api/profiles/{pid}/replan").json()
    assert set(body) == {"changed", "to_snapshot", "from_snapshot", "moves", "destination", "new_top"}


def test_fairness_check_passes_and_is_public(client):
    body = client.get("/api/fairness").json()
    assert body["passed"] and body["failures"] == [] and body["checks"] >= 50
    assert body["profiles"] == 3 and body["cvs"] == 5 and "gender" in body["not_collected"]


def test_fairness_check_catches_a_ranking_that_depends_on_the_name(monkeypatch):
    real = matching.match

    def biased(ref, profile, scenario, *a, **k):
        out = real(ref, profile, scenario, *a, **k)
        if (profile.get("display_name") or "").startswith("Tan"):
            out["roles"] = list(reversed(out["roles"]))
        return out

    monkeypatch.setattr(matching, "match", biased)
    result = fairness.run(get_reference())
    assert not result["passed"] and any("Tan Mei Ling" in f for f in result["failures"])


def test_profiles_reject_demographic_fields(client):
    for field, value in {"age": 30, "gender": "female", "ethnicity": "Malay", "religion": "x"}.items():
        assert client.post("/api/profiles", json={"skills": ["excel"], field: value}).status_code == 422


def test_region_view_counts_destinations_and_hides_small_groups(client):
    for role, n in (("data_analyst", 3), ("care_worker", 1)):
        for _ in range(n):
            pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
            client.put(f"/api/profiles/{pid}/target", json={"role_id": role})
    demo = client.post("/api/profiles/demo/clerk").json()["id"]
    client.put(f"/api/profiles/{demo}/target", json={"role_id": "data_analyst"})  # demo copies are not counted
    body = client.get("/api/sdg/region").json()
    assert body["region"] == "Malaysia" and body["people"] == 4
    roles = {r["role_id"]: r["people"] for r in body["roles"]}
    assert roles == {"data_analyst": 3, "care_worker": None}  # one person is hidden as "fewer than 3"
    assert all(g["people"] is None or g["people"] >= region.MIN_GROUP for g in body["goals"])
