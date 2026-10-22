"""Career-centre classes: admin-approved counsellors, join codes, consent to share, leaving at once,
and a dashboard limited to the agreed fields."""
from app import store
from app.services import classes
from tests.test_email import login, owned_profile

ADMIN = {"X-Admin-Token": "test-admin-token"}


def approved_counsellor(client, sub="counsellor-1") -> dict:
    client.post("/api/counsellor/request", json={"name": "Puan Aminah", "organisation": "Kolej Vokasional Shah Alam"},
                headers=login(sub, "aminah@kv.edu.my"))
    client.post(f"/api/admin/counsellors/{sub}", json={"approve": True, "decided_by": "Admin Tan"}, headers=ADMIN)
    return login(sub, "aminah@kv.edu.my")


def test_only_approved_counsellors_make_classes(client):
    assert client.post("/api/classes", json={"name": "DKM 2"}).status_code == 401
    pending = login("c-2")
    assert client.post("/api/counsellor/request", json={"name": "Encik Lim", "organisation": "UiTM"}, headers=pending).json()["status"] == "pending"
    assert client.post("/api/classes", json={"name": "DKM 2"}, headers=pending).status_code == 403
    assert client.post("/api/admin/counsellors/c-2", json={"approve": True, "decided_by": "Admin"}).status_code == 401
    assert [c["user_id"] for c in client.get("/api/admin/counsellors", headers=ADMIN).json()] == ["c-2"]
    teacher = approved_counsellor(client)
    made = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher)
    assert made.status_code == 201 and len(made.json()["code"]) == 8
    assert client.get("/api/counsellor/me", headers=teacher).json()["classes"][0]["name"] == "DKM 2"


def test_join_shows_what_is_shared_then_dashboard_shows_only_those_fields(client):
    teacher = approved_counsellor(client)
    klass = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher).json()
    pid = owned_profile(client, sub="student-1")
    store.set_skill_level(pid, "sql", 2)
    client.put(f"/api/profiles/{pid}/plan", json={"target_date": "2099-01-01", "weekly_hours": 4}, headers=login("student-1"))
    assert client.get(f"/api/class-codes/{klass['code']}").status_code == 401
    preview = client.get(f"/api/class-codes/{klass['code'].lower()}", headers=login("student-1")).json()
    assert preview == {"name": "DKM 2", "counsellor": "Puan Aminah", "organisation": "Kolej Vokasional Shah Alam",
                       "shared": list(classes.SHARED)}
    joined = client.post("/api/classes/join", json={"code": klass["code"], "profile_id": pid}, headers=login("student-1"))
    assert joined.status_code == 200 and joined.json()[0]["name"] == "DKM 2"
    assert store.list_consents(pid)[-1]["kind"] == "class_share"
    board = client.get(f"/api/classes/{klass['id']}", headers=teacher).json()
    student = board["students"][0]
    assert set(student) == set(classes.SHARED) | {"key"}
    assert student["display_name"] == "Siti" and student["destination"] == "Data analyst"
    assert student["skills_proven"] == [{"name": "SQL", "level": 2}] and student["status"] in ("on_track", "ahead", "behind")
    assert "skills" not in student and board["counts"]["no_date"] == 0


def test_leaving_removes_access_at_once(client):
    teacher = approved_counsellor(client)
    klass = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher).json()
    pid = owned_profile(client, sub="student-1")
    client.post("/api/classes/join", json={"code": klass["code"], "profile_id": pid}, headers=login("student-1"))
    assert client.delete(f"/api/profiles/{pid}/classes/{klass['id']}", headers=login("student-1")).json() == []
    assert client.get(f"/api/classes/{klass['id']}", headers=teacher).json()["students"] == []
    kinds = [(c["kind"], c["given"]) for c in store.list_consents(pid)]
    assert kinds[-2:] == [("class_share", True), ("class_share", False)]


def test_only_the_classes_own_counsellor_sees_it_and_revoking_stops_them(client):
    teacher = approved_counsellor(client)
    klass = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher).json()
    other = approved_counsellor(client, sub="counsellor-2")
    assert client.get(f"/api/classes/{klass['id']}", headers=other).status_code == 404
    client.post("/api/admin/counsellors/counsellor-1", json={"approve": False, "decided_by": "Admin"}, headers=ADMIN)
    assert client.get(f"/api/classes/{klass['id']}", headers=teacher).status_code == 403
    pid = owned_profile(client, sub="student-1")
    assert client.post("/api/classes/join", json={"code": klass["code"], "profile_id": pid}, headers=login("student-1")).status_code == 404


def test_students_must_log_in_and_own_the_profile(client):
    teacher = approved_counsellor(client)
    code = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher).json()["code"]
    anon = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    assert client.post("/api/classes/join", json={"code": code, "profile_id": anon}).status_code == 401
    assert client.post("/api/classes/join", json={"code": code, "profile_id": anon}, headers=login("student-9")).status_code == 403
    assert client.post("/api/classes/join", json={"code": "WRONGCODE", "profile_id": anon}, headers=login("student-9")).status_code in (403, 404)


def test_deleting_the_profile_or_the_class_removes_memberships(client):
    teacher = approved_counsellor(client)
    klass = client.post("/api/classes", json={"name": "DKM 2"}, headers=teacher).json()
    pid = owned_profile(client, sub="student-1")
    client.post("/api/classes/join", json={"code": klass["code"], "profile_id": pid}, headers=login("student-1"))
    assert client.get(f"/api/profiles/{pid}/export", headers=login("student-1")).json()["classes"][0]["name"] == "DKM 2"
    client.delete(f"/api/profiles/{pid}", headers=login("student-1"))
    assert store.member_ids(klass["id"]) == []
    assert client.delete(f"/api/classes/{klass['id']}", headers=teacher).status_code == 204
    assert store.get_class(klass["id"]) is None


def test_the_anonymous_class_view_still_works(client):
    sample = client.get("/api/class/sample").text
    assert client.post("/api/class/analyse", json={"csv": sample}).status_code == 200
