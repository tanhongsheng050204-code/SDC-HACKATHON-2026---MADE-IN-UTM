"""Your own AI future: a custom adoption speed, and the tipping points it reveals."""

from app.reference import get_reference
from app.services import matching, tipping
from app.services.scenario import outlook, signals_from_snapshot

CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk"}


def _order(profile, adoption):
    return [r["role_id"] for r in matching.match(get_reference(), profile, "baseline", adoption=adoption)["roles"]]


def test_custom_adoption_matches_preset_at_same_value():
    ref = get_reference()
    preset = matching.match(ref, CLERK, "accelerated")["roles"]
    custom = matching.match(ref, CLERK, "accelerated", adoption=1.6)["roles"]
    assert [(r["role_id"], r["outlook"]["accelerated"]["index"]) for r in preset] == \
           [(r["role_id"], r["outlook"]["accelerated"]["index"]) for r in custom]


def test_custom_adoption_keeps_robust_picks_from_the_presets():
    ref = get_reference()
    plain = {r["role_id"] for r in matching.match(ref, CLERK, "baseline")["roles"] if r["robust_pick"]}
    custom = {r["role_id"] for r in matching.match(ref, CLERK, "baseline", adoption=2.0)["roles"] if r["robust_pick"]}
    assert plain == custom


def test_declining_point_solves_the_formula():
    ref = get_reference()
    found = tipping.find(ref, CLERK, None)["current_role"]
    assert found["role_id"] == "data_entry_clerk" and found["declining_at"] is not None
    signal = signals_from_snapshot(ref.latest_snapshot)["data_entry_clerk"]
    assert abs(outlook(signal, "x", found["declining_at"]).index - (-10)) <= 0.5
    assert found["declining_below"] is False  # this job shrinks as adoption speeds up


def test_overtake_is_real():
    ref = get_reference()
    moves = tipping.find(ref, CLERK, None)["overtakes"]
    assert moves and len(moves) <= 3
    for m in moves:
        step = tipping.STEP if m["direction"] == "above" else -tipping.STEP
        before, after = _order(CLERK, round(m["at"] - step, 2)), _order(CLERK, m["at"])
        assert before.index(m["role_id"]) > before.index(m["overtakes_role_id"])
        assert after.index(m["role_id"]) < after.index(m["overtakes_role_id"])


def test_no_tipping_point_returns_none():
    found = tipping.find(get_reference(), {"skills": ["sql"], "current_role_id": "data_analyst"}, None)
    assert found["current_role"]["declining_at"] is None


def test_adoption_out_of_range_is_refused(client):
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    assert client.get(f"/api/profiles/{pid}/matches", params={"adoption": 2.5}).status_code == 422
    assert client.get(f"/api/profiles/{pid}/matches", params={"adoption": 1.3}).status_code == 200
    assert client.get(f"/api/profiles/{pid}/tipping").status_code == 200
