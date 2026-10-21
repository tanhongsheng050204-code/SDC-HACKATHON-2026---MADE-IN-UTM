"""Signal X-ray: every outlook number can be rebuilt step by step from its sources."""

import copy

from app import store
from app.reference import get_reference, reload_reference
from app.services import matching, xray

CLERK = {"skills": ["data_entry", "excel"], "current_role_id": "data_entry_clerk"}


def test_xray_final_matches_the_ranked_outlook():
    ref = get_reference()
    for scenario in ref.scenarios:
        for year in (None, 2027):
            ranked = {r["role_id"]: r for r in matching.match(ref, CLERK, scenario, year)["roles"]}
            for role_id, role in ranked.items():
                shown = xray.explain(ref, role_id, scenario, year)
                assert shown["final"] == role["outlook"][scenario]["index"], (role_id, scenario, year)
                assert shown["label"] == role["outlook"][scenario]["label"]
                assert shown["steps"][-1]["running_total"] == shown["final"]


def test_xray_says_when_no_refresh_is_approved():
    steps = xray.explain(get_reference(), "data_entry_clerk", "baseline", None)["steps"]
    labels = [s["label"] for s in steps]
    assert labels[0].startswith("Published baseline") and "WEF" in steps[0]["source"]
    trend = [s for s in steps if s["label"].startswith(("Job-posting", "AI research"))]
    assert len(trend) == 2 and all(s["value"] == 0 and "no trend refresh" in s["source"] for s in trend)


def test_xray_shows_trend_steps_when_snapshot_has_them(client):
    ref = get_reference()
    live = copy.deepcopy(ref.latest_snapshot)
    live.update(snapshot_id="2099-01-01-trend-test", imported="2099-01-01", baseline_snapshot_id=ref.latest_snapshot["snapshot_id"])
    for s in live["signals"]:
        base = s["net_growth_pct"]
        s.update(baseline_growth_pct=base, demand_points=-3.0, ai_points=-1.5, net_growth_pct=round(base - 4.5, 1))
    store.save_snapshot(live, "approved")
    ref = reload_reference()
    steps = xray.explain(ref, "data_entry_clerk", "baseline", None)["steps"]
    by_label = {s["label"].split(" (")[0]: s for s in steps}
    assert by_label["Job-posting demand"]["value"] == -3.0 and by_label["Job-posting demand"]["cap"] == "±15 points"
    assert by_label["AI research momentum"]["value"] == -1.5
    route = client.get("/api/roles/data_entry_clerk/xray", params={"scenario": "accelerated"}).json()
    ranked = next(r for r in matching.match(ref, CLERK, "accelerated")["roles"] if r["role_id"] == "data_entry_clerk")
    assert route["final"] == ranked["outlook"]["accelerated"]["index"]


def test_custom_adoption_is_explained():
    shown = xray.explain(get_reference(), "data_analyst", "baseline", None, adoption=1.3)
    swing = next(s for s in shown["steps"] if s["label"].startswith("AI adoption"))
    assert "1.3" in swing["label"] and swing["value"] != 0


def test_xray_unknown_role_is_404(client):
    assert client.get("/api/roles/astronaut/xray").status_code == 404


def test_xray_shows_malaysian_employment_when_the_snapshot_has_it(client):
    ref = get_reference()
    live = copy.deepcopy(ref.latest_snapshot)
    live.update(snapshot_id="2099-01-02-trend-test", imported="2099-01-02", baseline_snapshot_id=ref.latest_snapshot["snapshot_id"])
    for s in live["signals"]:
        base = s["net_growth_pct"]
        s.update(baseline_growth_pct=base, demand_points=1.0, local_points=-4.0, ai_points=0.5,
                 net_growth_pct=round(base - 2.5, 1))
    store.save_snapshot(live, "approved")
    ref = reload_reference()
    steps = xray.explain(ref, "data_entry_clerk", "baseline", None)["steps"]
    labels = [s["label"] for s in steps]
    assert labels[1:4] == ["Job-posting demand", "Malaysian employment", "AI research momentum"]
    local = steps[2]
    assert local["value"] == -4.0 and local["cap"] == "±10 points" and "OpenDOSM" in local["source"]
    assert steps[3]["running_total"] == round(steps[0]["value"] - 2.5, 1)
    ranked = next(r for r in matching.match(ref, CLERK, "baseline")["roles"] if r["role_id"] == "data_entry_clerk")
    assert steps[-1]["running_total"] == ranked["outlook"]["baseline"]["index"]
