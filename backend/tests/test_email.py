"""Email: opt-in only for Google logins, the weekly digest, job alerts with de-duplication by state,
one-click unsubscribe, and the cron secret. SMTP is never reached: mailer.send is replaced."""
import datetime as dt

import jwt
import pytest

from app import mailer, store
from app.services import alerts, openings
from tests.test_auth import SECRET

CRON = {"X-Cron-Secret": "test-cron-secret"}
POSTINGS = [
    {"title": "Data Analyst", "company": "Acme", "location": "Shah Alam, Selangor", "posted": "2026-10-20", "url": "https://jobs.example/1"},
    {"title": "Junior Data Analyst", "company": "Beta", "location": "George Town, Penang", "posted": "2026-10-19", "url": "https://jobs.example/2"},
    {"title": "Data Analyst (Remote)", "company": None, "location": "Malaysia", "posted": "2026-10-18", "url": "https://jobs.example/3"},
]


def login(sub: str, email: str | None = "siti@example.com") -> dict:
    claims = {"sub": sub, "aud": "authenticated", "exp": dt.datetime.now(dt.UTC) + dt.timedelta(minutes=30)}
    if email:
        claims["email"] = email
    return {"Authorization": f"Bearer {jwt.encode(claims, SECRET, algorithm='HS256')}"}


@pytest.fixture
def email_on(client, monkeypatch):
    from app.config import get_settings
    for key, value in {"SMTP_USER": "team@example.com", "SMTP_PASSWORD": "app-password", "CRON_SECRET": "test-cron-secret",
                       "APP_URL": "https://laluan.test", "PUBLIC_API_URL": "https://api.laluan.test"}.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    sent = []
    monkeypatch.setattr(mailer, "send", lambda message: sent.append(message))
    postings = list(POSTINGS)
    monkeypatch.setattr(openings, "all_titled", lambda role_id, **_: list(postings))
    yield {"sent": sent, "postings": postings}
    get_settings.cache_clear()


def owned_profile(client, sub="user-1", target="data_analyst") -> str:
    pid = client.post("/api/profiles", json={"display_name": "Siti", "skills": ["excel", "data_entry"],
                                             "current_role_id": "data_entry_clerk"}).json()["id"]
    assert client.post("/api/me/claim", json={"profile_id": pid}, headers=login(sub)).status_code == 200
    if target:
        client.put(f"/api/profiles/{pid}/target", json={"role_id": target}, headers=login(sub))
    return pid


def opt_in(client, pid, sub="user-1", **body):
    return client.put(f"/api/profiles/{pid}/email", json={"digest": True, "alerts": "off", "language": "en", **body},
                      headers=login(sub))


def _body(message) -> str:
    return message.get_body(("plain",)).get_content()


def test_only_logged_in_owners_can_opt_in(client, email_on):
    anon = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    assert client.get(f"/api/profiles/{anon}/email").json()["logged_in"] is False
    assert client.put(f"/api/profiles/{anon}/email", json={"digest": True}).status_code == 401
    assert client.put(f"/api/profiles/{anon}/email", json={"digest": True}, headers=login("user-9")).status_code == 403
    pid = owned_profile(client)
    assert opt_in(client, pid, sub="someone-else").status_code == 404
    assert client.put(f"/api/profiles/{pid}/email", json={"digest": True}, headers=login("user-1", email=None)).status_code == 422


def test_email_off_by_default_and_not_set_up_is_refused(client):
    pid = owned_profile(client)
    got = client.get(f"/api/profiles/{pid}/email", headers=login("user-1")).json()
    assert got == {"available": False, "logged_in": True, "email": "siti@example.com", "settings": None}
    assert opt_in(client, pid).status_code == 503
    assert store.get_email_settings(pid) is None


def test_opt_in_records_consent_and_turning_off_forgets_the_address(client, email_on):
    pid = owned_profile(client)
    assert client.put(f"/api/profiles/{pid}/email", json={"digest": False, "alerts": "weekly"}, headers=login("user-1")).status_code == 422
    body = opt_in(client, pid, alerts="instant", state="selangor").json()
    assert body["settings"] == {"digest": True, "alerts": "instant", "state": "selangor", "language": "en"}
    assert store.get_email_settings(pid)["email"] == "siti@example.com"
    client.put(f"/api/profiles/{pid}/email", json={"digest": False, "alerts": "off"}, headers=login("user-1"))
    assert store.get_email_settings(pid) is None
    kinds = [(c["kind"], c["given"]) for c in store.list_consents(pid)]
    assert kinds[-4:] == [("email_digest", True), ("job_alerts_instant", True), ("email_digest", False), ("job_alerts", False)]


def test_cron_needs_the_secret(client, email_on, monkeypatch):
    assert client.post("/api/cron/weekly").status_code == 401
    assert client.post("/api/cron/alerts", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    monkeypatch.setenv("CRON_SECRET", "")
    from app.config import get_settings
    get_settings.cache_clear()
    assert client.post("/api/cron/weekly", headers={"X-Cron-Secret": ""}).status_code == 401


def test_weekly_digest_content_and_no_second_send_in_the_same_week(client, email_on):
    pid = owned_profile(client)
    client.put(f"/api/profiles/{pid}/plan", json={"weekly_hours": 5}, headers=login("user-1"))
    opt_in(client, pid, alerts="weekly", state="selangor")
    r = client.post("/api/cron/weekly", headers=CRON).json()
    assert r == {"email": "ok", "sent": 1, "skipped": 0, "failed": 0}
    message = email_on["sent"][0]
    text = _body(message)
    assert message["To"] == "siti@example.com" and message["Subject"] == "Your Laluan week"
    assert "Hello Siti," in text and "% ready for Data analyst" in text and "Course hours finished this week: 0 of 5." in text
    assert "Next course:" in text
    assert "jobs.example/1" in text and "jobs.example/3" in text and "jobs.example/2" not in text  # Penang filtered out
    assert message["List-Unsubscribe"].startswith("<https://api.laluan.test/api/email/unsubscribe?token=")
    assert message["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert "https://laluan.test/?unsubscribe=" in text
    assert client.post("/api/cron/weekly", headers=CRON).json()["sent"] == 0  # same week: nothing twice
    assert len(store.sent_job_keys(pid)) == 2


def test_instant_job_alerts_send_only_new_ads(client, email_on):
    pid = owned_profile(client)
    opt_in(client, pid, digest=False, alerts="instant", state="anywhere")
    assert client.post("/api/cron/alerts", headers=CRON).json()["sent"] == 1
    assert all(f"jobs.example/{n}" in _body(email_on["sent"][0]) for n in (1, 2, 3))
    assert client.post("/api/cron/alerts", headers=CRON).json()["sent"] == 0
    email_on["postings"].insert(0, {"title": "Data Analyst", "company": "New Co", "location": "Kuala Lumpur",
                                    "posted": "2026-10-22", "url": "https://jobs.example/4"})
    assert client.post("/api/cron/alerts", headers=CRON).json()["sent"] == 1
    latest = _body(email_on["sent"][-1])
    assert "jobs.example/4" in latest and "jobs.example/1" not in latest
    assert "Stop job alerts with one click" in latest


def test_one_click_unsubscribe(client, email_on):
    pid = owned_profile(client)
    opt_in(client, pid, alerts="instant")
    assert client.post("/api/email/unsubscribe", params={"token": f"{pid}.alerts.0000"}).status_code == 400
    stop_alerts = alerts.unsubscribe_token(pid, "alerts")
    assert client.post("/api/email/unsubscribe", params={"token": stop_alerts}).json() == {"done": "alerts"}
    assert store.get_email_settings(pid)["alerts"] == "off" and store.get_email_settings(pid)["digest"] is True
    assert client.post("/api/email/unsubscribe", params={"token": alerts.unsubscribe_token(pid, "all")}).status_code == 200
    assert store.get_email_settings(pid) is None
    assert client.post("/api/email/unsubscribe", params={"token": alerts.unsubscribe_token(pid, "all")}).status_code == 200


def test_profile_released_from_the_account_gets_no_email(client, email_on):
    pid = owned_profile(client)
    opt_in(client, pid)
    with store._connect() as conn:
        conn.execute("UPDATE profiles SET user_id=? WHERE id=?", ("another-account", pid))
    assert client.post("/api/cron/weekly", headers=CRON).json()["sent"] == 0


def test_delete_removes_email_settings_and_sent_ads(client, email_on):
    pid = owned_profile(client)
    opt_in(client, pid, alerts="instant")
    client.post("/api/cron/alerts", headers=CRON)
    assert client.delete(f"/api/profiles/{pid}", headers=login("user-1")).status_code == 204
    assert store.get_email_settings(pid) is None and store.sent_job_keys(pid) == set()


def test_state_matching():
    assert alerts.states_in("Petaling Jaya, Selangor, Malaysia") == {"selangor"}
    assert alerts.states_in("KL Sentral") == {"kuala_lumpur"}
    assert alerts.matches_state("Bayan Lepas, Penang", "pulau_pinang")
    assert not alerts.matches_state("Bayan Lepas, Penang", "johor")
    assert alerts.matches_state("Malaysia", "johor")  # no state given: kept, shown as such
    assert alerts.matches_state("Johor Bahru", "anywhere")


def test_smtp_uses_starttls_and_login(monkeypatch, email_on):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port))
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self, context): calls.append(("starttls",))
        def login(self, user, password): calls.append(("login", user))
        def send_message(self, message): calls.append(("send", message["To"]))

    monkeypatch.undo()  # the real mailer.send, with SMTP faked below
    monkeypatch.setenv("SMTP_USER", "team@example.com"); monkeypatch.setenv("SMTP_PASSWORD", "pw")
    monkeypatch.setenv("CRON_SECRET", "s")
    from app.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    mailer.send(mailer.build("a@b.my", "Hi", "text", "<p>html</p>", "https://x/unsub"))
    assert calls == [("connect", "smtp.gmail.com", 587), ("starttls",), ("login", "team@example.com"), ("send", "a@b.my")]
