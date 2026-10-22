"""Decision log, plan checks and counsellor check-ins (DECISIONS #66-68)."""
import datetime as dt

from app import store
from app.reference import get_reference
from app.services import plancheck, progress
from tests.test_classes import approved_counsellor
from tests.test_email import login, owned_profile


def _joined(client):
    teacher = approved_counsellor(client)
    klass = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher).json()
    pid = owned_profile(client, sub="student-1")
    client.post("/api/classes/join", json={"code": klass["code"], "profile_id": pid}, headers=login("student-1"))
    key = client.get(f"/api/classes/{klass['id']}", headers=teacher).json()["students"][0]["key"]
    return teacher, klass, pid, key


def test_choosing_a_destination_keeps_the_facts_and_reasons(client):
    pid = client.post("/api/profiles", json={"skills": ["excel", "data_entry"], "current_role_id": "data_entry_clerk"}).json()["id"]
    assert client.get(f"/api/profiles/{pid}/decision").json() is None
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_analyst"})
    d = client.get(f"/api/profiles/{pid}/decision").json()
    assert d["role_id"] == "data_analyst" and d["reasons"] == [] and d["changed"] == []
    assert d["then"]["fit"] == d["now"]["fit"] and d["then"]["snapshot_id"] == get_reference().latest_snapshot["snapshot_id"]
    assert client.put(f"/api/profiles/{pid}/decision/reasons", json={"reasons": ["my own words"]}).status_code == 422
    d = client.put(f"/api/profiles/{pid}/decision/reasons", json={"reasons": ["growing", "fits_skills", "growing"]}).json()
    assert d["reasons"] == ["growing", "fits_skills"]
    assert store.export_rows(pid)["destination_decisions"][0]["reasons"] == ["growing", "fits_skills"]


def test_plan_checks_name_their_numbers(client):
    pid = client.post("/api/profiles", json={"skills": ["excel"], "current_role_id": "data_entry_clerk"}).json()["id"]
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "registered_nurse"})
    soon = (progress.today() + dt.timedelta(days=14)).isoformat()
    client.put(f"/api/profiles/{pid}/plan", json={"target_date": soon, "weekly_hours": 1})
    checks = {c["kind"]: c for c in client.get(f"/api/profiles/{pid}/plan-check").json()}
    assert checks["hours_short"]["weekly_hours"] == 1 and checks["hours_short"]["need"] > 1
    assert checks["licence"]["level"] == "warn" and "Nursing Board" in checks["licence"]["licence"]
    client.put(f"/api/profiles/{pid}/target", json={"role_id": "data_entry_clerk"})
    assert any(c["kind"] == "declining" for c in plancheck.check(get_reference(), store.get_profile(pid)))


def test_checkin_agenda_and_actions_need_the_student_to_accept(client):
    teacher, klass, pid, key = _joined(client)
    base = f"/api/classes/{klass['id']}/students/{key}"
    agenda = client.get(f"{base}/checkin", headers=teacher).json()
    assert agenda["student"]["display_name"] == "Siti" and agenda["actions"] == [] and "skills" not in agenda["student"]
    course = agenda["options"]["courses"][0]["id"]
    later = (progress.today() + dt.timedelta(days=120)).isoformat()
    assert client.post(f"{base}/actions", json={"kind": "next_course", "value": "not-a-course"}, headers=teacher).status_code == 422
    assert client.post(f"{base}/actions", json={"kind": "weekly_hours", "value": "99"}, headers=teacher).status_code == 422
    client.post(f"{base}/actions", json={"kind": "target_date", "value": later}, headers=teacher)
    client.post(f"{base}/actions", json={"kind": "next_course", "value": course}, headers=teacher)
    assert store.get_profile(pid)["target_date"] != later  # nothing changes before the student says yes
    mine = client.get(f"/api/profiles/{pid}/actions", headers=login("student-1")).json()
    assert [a["status"] for a in mine] == ["proposed", "proposed"] and mine[0]["counsellor"] == "Puan Aminah"
    client.post(f"/api/profiles/{pid}/actions/{mine[0]['id']}", json={"answer": "accept"}, headers=login("student-1"))
    assert store.get_profile(pid)["target_date"] == later
    out = client.post(f"/api/profiles/{pid}/actions/{mine[1]['id']}", json={"answer": "accept"}, headers=login("student-1")).json()
    assert [a["status"] for a in out] == ["done", "accepted"]
    out = client.post(f"/api/profiles/{pid}/actions/{mine[1]['id']}", json={"answer": "done"}, headers=login("student-1")).json()
    assert out[1]["status"] == "done"
    assert client.post(f"/api/profiles/{pid}/actions/{mine[1]['id']}", json={"answer": "decline"}, headers=login("student-1")).status_code == 422
    assert [a["kind"] for a in store.export_rows(pid)["checkin_actions"]] == ["target_date", "next_course"]


def test_only_the_classes_counsellor_reaches_a_student_and_leaving_withdraws_proposals(client):
    teacher, klass, pid, key = _joined(client)
    base = f"/api/classes/{klass['id']}/students/{key}"
    other = approved_counsellor(client, sub="counsellor-2")
    assert client.get(f"{base}/checkin", headers=other).status_code == 404
    assert client.get(f"/api/classes/{klass['id']}/students/0000000000000000/checkin", headers=teacher).status_code == 404
    client.post(f"{base}/actions", json={"kind": "weekly_hours", "value": "6"}, headers=teacher)
    client.delete(f"/api/profiles/{pid}/classes/{klass['id']}", headers=login("student-1"))
    assert client.get(f"/api/profiles/{pid}/actions", headers=login("student-1")).json() == []
    assert client.get(f"{base}/checkin", headers=teacher).status_code == 404
