"""Behind the scenes: rate limits on AI endpoints, request logs without personal data, security
headers, and Sentry events stripped of anything personal."""
import json
import logging

from app import observability, ratelimit


def _coach(client, pid, ip="203.0.113.7"):
    return client.post("/api/coach", json={"profile_id": pid, "question": "How long will the plan take?"},
                       headers={"X-Forwarded-For": f"{ip}, 10.0.0.1"})


def test_coach_is_limited_per_profile_with_a_friendly_429(client, monkeypatch):
    monkeypatch.setitem(ratelimit.LIMITS, "coach", (100, 3))
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    assert [_coach(client, pid).status_code for _ in range(3)] == [200, 200, 200]
    blocked = _coach(client, pid, ip="198.51.100.9")  # a new address does not reset the profile's count
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == ratelimit.MESSAGE
    assert 1 <= int(blocked.headers["Retry-After"]) <= ratelimit.WINDOW_SECONDS
    other = client.post("/api/profiles/demo/clerk").json()["id"]
    assert _coach(client, other).status_code == 200  # other people are not affected


def test_cv_extraction_is_limited_per_ip(client, monkeypatch):
    monkeypatch.setitem(ratelimit.LIMITS, "cv", (2, None))
    send = lambda ip: client.post("/api/intake/extract", json={"text": "I use Excel every day for data entry and reports. " * 3},
                                  headers={"X-Forwarded-For": ip}).status_code
    assert [send("203.0.113.1"), send("203.0.113.1"), send("203.0.113.1")] == [200, 200, 429]
    assert send("203.0.113.2") == 200


def test_a_refused_call_does_not_use_up_the_window(monkeypatch):
    monkeypatch.setitem(ratelimit.LIMITS, "voice", (1, None))

    class Req:
        headers = {"x-forwarded-for": "192.0.2.5"}
        client = None
    ratelimit.check(Req(), "voice")
    for _ in range(3):
        try:
            ratelimit.check(Req(), "voice")
        except Exception as error:
            assert error.status_code == 429
    from app import store
    with store._connect() as conn:
        rows = [dict(r) for r in conn.execute("SELECT who FROM rate_hits WHERE bucket='voice' AND who<>'all'").fetchall()]
    assert len(rows) == 1 and rows[0]["who"] != "192.0.2.5"  # one hit, stored as a hash, never the address


def test_limits_live_in_the_database_so_a_restart_or_second_server_keeps_them(client, monkeypatch):
    import importlib

    from app.config import get_settings
    monkeypatch.setenv("RATE_LIMIT_SALT", "shared-by-every-instance")  # as on Render
    get_settings.cache_clear()
    monkeypatch.setitem(ratelimit.LIMITS, "coach", (100, 2))
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    assert [_coach(client, pid).status_code for _ in range(2)] == [200, 200]
    importlib.reload(ratelimit)  # nothing is kept in memory: a fresh module still sees the hits
    monkeypatch.setitem(ratelimit.LIMITS, "coach", (100, 2))
    assert _coach(client, pid).status_code == 429
    from app import store
    with store._connect() as conn:
        stored = " ".join(r["who"] for r in conn.execute("SELECT who FROM rate_hits").fetchall())
    assert pid not in stored and "203.0.113.7" not in stored


def test_admin_actions_are_logged_with_who_and_when(client):
    admin = {"X-Admin-Token": "test-admin-token"}
    from tests.test_email import login
    client.post("/api/counsellor/request", json={"name": "Puan Aminah", "organisation": "KV Shah Alam"}, headers=login("c-9"))
    client.post("/api/admin/counsellors/c-9", json={"approve": True, "decided_by": "Admin Tan"}, headers=admin)
    client.post("/api/admin/counsellors/c-9", json={"approve": False, "decided_by": "Admin Lee"}, headers=admin)
    assert client.get("/api/admin/log").status_code == 401
    log = client.get("/api/admin/log", headers=admin).json()
    assert [(e["action"], e["subject"], e["actor"]) for e in log[:2]] == [
        ("counsellor_revoked", "c-9", "Admin Lee"), ("counsellor_approved", "c-9", "Admin Tan")]
    assert all(e["created_at"] for e in log)


def test_security_headers_on_api_responses(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert "max-age=" in r.headers["Strict-Transport-Security"]
    assert "microphone=(self)" in r.headers["Permissions-Policy"]
    assert "Content-Security-Policy" not in client.get("/docs").headers  # Swagger loads from a CDN


def test_request_log_has_route_template_but_no_ids_or_ip(client, caplog):
    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    observability.log.propagate = True
    try:
        with caplog.at_level(logging.INFO, logger="laluan.request"):
            client.get(f"/api/profiles/{pid}/matches?scenario=slow", headers={"X-Forwarded-For": "203.0.113.99"})
    finally:
        observability.log.propagate = False
    lines = [json.loads(r.getMessage()) for r in caplog.records if r.name == "laluan.request"]
    assert {"method": "GET", "route": "/api/profiles/{profile_id}/matches", "status": 200} == \
        {k: lines[-1][k] for k in ("method", "route", "status")}
    text = caplog.text
    assert pid not in text and "203.0.113.99" not in text and "slow" not in text


def test_sentry_events_are_stripped_of_personal_data():
    event = {
        "request": {"method": "POST", "url": "https://api/api/profiles/0b6c3f1e-1d2a-4c5b-9e8f-112233445566/pathway?role=x",
                    "data": {"question": "I'm Siti, 012-345 6789"}, "headers": {"Authorization": "Bearer abc"},
                    "cookies": {"a": "b"}, "query_string": "role=x"},
        "user": {"ip_address": "203.0.113.1"}, "breadcrumbs": {"values": [{"message": "x"}]},
        "exception": {"values": [{"value": "bad input from siti@mail.my",
                                  "stacktrace": {"frames": [{"function": "f", "vars": {"cv": "secret"}}]}}]},
    }
    out = observability.scrub_event(event)
    assert out["request"] == {"method": "POST", "url": "https://api/api/profiles/{id}/pathway"}
    assert "user" not in out and "breadcrumbs" not in out
    assert "siti@mail.my" not in out["exception"]["values"][0]["value"]
    assert "vars" not in out["exception"]["values"][0]["stacktrace"]["frames"][0]


def test_sentry_stays_off_without_a_dsn():
    from app.config import get_settings
    assert get_settings().sentry_dsn == "" and observability.init_sentry(get_settings()) is False


def test_a_global_cap_stops_faked_addresses(client, monkeypatch):
    monkeypatch.setitem(ratelimit.GLOBAL, "cv", 3)
    send = lambda ip: client.post("/api/intake/extract", json={"text": "I use Excel every day for data entry and reports. " * 3},
                                  headers={"X-Forwarded-For": ip}).status_code
    assert [send(f"203.0.113.{n}") for n in range(4)] == [200, 200, 200, 429]


def test_without_a_shared_salt_each_process_keys_its_own_hashes(monkeypatch):
    """No fallback to a fixed or reused secret: an unset RATE_LIMIT_SALT means a random key per process."""
    import importlib

    from app.config import get_settings
    monkeypatch.setenv("RATE_LIMIT_SALT", "")
    get_settings.cache_clear()
    first = ratelimit._hash("ip", "192.0.2.5")
    importlib.reload(ratelimit)
    assert ratelimit._hash("ip", "192.0.2.5") != first
    get_settings.cache_clear()
