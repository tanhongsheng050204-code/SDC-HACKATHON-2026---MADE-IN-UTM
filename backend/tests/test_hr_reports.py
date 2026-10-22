"""Saved HR analyses: aggregate results only, kept with the HR person's account."""
import json

from app import store
from tests.test_email import login

CSV = "role,skills\n" + "Data entry clerk,Excel; data entry\n" * 6 + "Data analyst,SQL; Python\n" * 2


def test_save_list_open_and_delete_an_analysis(client):
    hr = login("hr-1", "hr@acme.my")
    assert client.post("/api/workforce/saved", json={"csv": CSV, "name": "Q4 team"}).status_code == 401
    made = client.post("/api/workforce/saved", json={"csv": CSV, "name": "Q4 team", "scenario": "accelerated"}, headers=hr)
    assert made.status_code == 201
    summary = made.json()
    assert summary["employees"] == 8 and summary["at_risk"] == 6 and summary["scenario"] == "accelerated"
    listed = client.get("/api/workforce/saved", headers=hr).json()
    assert [r["id"] for r in listed] == [summary["id"]] and "result" not in listed[0]
    full = client.get(f"/api/workforce/saved/{summary['id']}", headers=hr).json()
    assert full["result"]["employees"] == 8 and full["result"]["grant_plan"]
    assert client.delete(f"/api/workforce/saved/{summary['id']}", headers=hr).status_code == 204
    assert client.get("/api/workforce/saved", headers=hr).json() == []


def test_the_csv_is_never_stored_and_others_cannot_see_it(client):
    hr = login("hr-2")
    marker = "Data entry clerk,Excel; data entry; zzuniqueskill"
    made = client.post("/api/workforce/saved", json={"csv": CSV + marker, "name": "Ops"}, headers=hr).json()
    stored = store.get_hr_report("hr-2", made["id"])
    assert "zzuniqueskill" not in json.dumps(stored)
    other = login("hr-3")
    assert client.get(f"/api/workforce/saved/{made['id']}", headers=other).status_code == 404
    assert client.delete(f"/api/workforce/saved/{made['id']}", headers=other).status_code == 404
    assert client.get("/api/workforce/saved", headers=other).json() == []


def test_files_that_identify_people_are_refused_before_saving(client):
    hr = login("hr-4")
    bad = client.post("/api/workforce/saved", json={"csv": "name,role,skills\nAli,Data entry clerk,Excel", "name": "x"}, headers=hr)
    assert bad.status_code == 422 and client.get("/api/workforce/saved", headers=hr).json() == []
