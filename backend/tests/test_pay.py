"""Pay jump in ringgit: DOSM group medians, labelled as such, never invented for a finer level."""

from app.reference import get_reference
from app.services import matching

CLERK = {"skills": ["data_entry", "excel", "office_admin"], "current_role_id": "data_entry_clerk"}


def _role(result, role_id):
    return next(r for r in result["roles"] if r["role_id"] == role_id)


def test_pay_change_for_clerk_to_analyst_is_3431():
    result = matching.match(get_reference(), CLERK, "baseline")
    analyst = _role(result, "data_analyst")
    assert analyst["pay"]["group"] == "Professionals" and analyst["pay"]["median_rm"] == 6124
    assert analyst["pay"]["table"].startswith("Appendix table A10")
    assert analyst["pay_change_rm"] == 6124 - 2693 == 3431


def test_same_group_gives_no_pay_change():
    result = matching.match(get_reference(), CLERK, "baseline")
    assert _role(result, "admin_assistant")["pay_change_rm"] is None  # both clerical support workers


def test_no_current_role_gives_no_pay_change():
    result = matching.match(get_reference(), {"skills": ["excel"], "current_role_id": None}, "baseline")
    assert all(r["pay_change_rm"] is None and r["pay"]["median_rm"] for r in result["roles"])


def test_future_card_shows_the_pay_line(client):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    card = client.post(f"/api/profiles/{pid}/cards", json={"role_id": "data_analyst"}).json()["card_id"]
    view = client.get(f"/api/cards/{card}").json()
    assert view["pay"]["median_rm"] == 6124 and view["pay"]["source"].startswith("DOSM")
