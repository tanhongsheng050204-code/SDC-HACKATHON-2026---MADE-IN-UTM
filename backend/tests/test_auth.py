"""Supabase login tokens: who owns a profile, and that anonymous and demo use keep working."""

import datetime as dt

import jwt

from app import store

SECRET = "test-jwt-secret-long-enough-for-hs256"  # set as SUPABASE_JWT_SECRET in conftest.py


def token(sub: str, minutes: int = 30) -> dict:
    exp = dt.datetime.now(dt.UTC) + dt.timedelta(minutes=minutes)
    encoded = jwt.encode({"sub": sub, "aud": "authenticated", "exp": exp}, SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {encoded}"}


def anonymous_profile(client) -> str:
    return client.post("/api/profiles", json={"skills": ["excel", "data_entry"]}).json()["id"]


def test_me_needs_a_token(client):
    assert client.get("/api/me").status_code == 401


def test_me_returns_no_profile_for_new_user(client):
    assert client.get("/api/me", headers=token("user-a")).json() == {"user_id": "user-a", "profile_id": None}


def test_forged_token_is_refused(client):
    forged = jwt.encode({"sub": "x", "aud": "authenticated"}, "not-the-secret", algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_claim_attaches_anonymous_profile_and_locks_it(client):
    pid = anonymous_profile(client)
    assert client.post("/api/me/claim", json={"profile_id": pid}, headers=token("user-a")).json() == {"profile_id": pid}
    assert client.get("/api/me", headers=token("user-a")).json()["profile_id"] == pid
    assert client.get(f"/api/profiles/{pid}").status_code == 404
    assert client.get(f"/api/profiles/{pid}", headers=token("user-b")).status_code == 404
    assert client.get(f"/api/profiles/{pid}/matches").status_code == 404
    assert client.get(f"/api/profiles/{pid}", headers=token("user-a")).status_code == 200
    assert client.get(f"/api/profiles/{pid}/matches", headers=token("user-a")).status_code == 200


def test_claim_conflict_asks_then_replaces(client):
    first, second = anonymous_profile(client), anonymous_profile(client)
    client.post("/api/me/claim", json={"profile_id": first}, headers=token("user-a"))
    conflict = client.post("/api/me/claim", json={"profile_id": second}, headers=token("user-a"))
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["existing_profile_id"] == first
    replaced = client.post("/api/me/claim", json={"profile_id": second, "replace": True}, headers=token("user-a"))
    assert replaced.json() == {"profile_id": second}
    assert client.get(f"/api/profiles/{first}", headers=token("user-a")).status_code == 404
    assert client.get("/api/me", headers=token("user-a")).json()["profile_id"] == second


def test_replacing_keeps_the_name_and_leaves_one_row_per_account(client):
    from app import store

    first, second = anonymous_profile(client), anonymous_profile(client)
    client.post("/api/me/claim", json={"profile_id": first}, headers=token("user-a"))
    store.update_profile(first, "Aina", None, [])
    client.post("/api/me/claim", json={"profile_id": second, "replace": True}, headers=token("user-a"))
    assert client.get(f"/api/profiles/{second}", headers=token("user-a")).json()["display_name"] == "Aina"
    with store._connect() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM profiles WHERE user_id=?", ("user-a",)).fetchone()["n"] == 1


def test_owned_profile_cannot_be_claimed_by_someone_else(client):
    pid = anonymous_profile(client)
    client.post("/api/me/claim", json={"profile_id": pid}, headers=token("user-a"))
    assert client.post("/api/me/claim", json={"profile_id": pid}, headers=token("user-b")).status_code == 404


def test_demo_profiles_cannot_be_claimed(client):
    demo = client.post("/api/profiles/demo/clerk").json()["id"]
    assert client.post("/api/me/claim", json={"profile_id": demo}, headers=token("user-a")).status_code == 404
    assert client.get(f"/api/profiles/{demo}").status_code == 200


def test_expired_token_is_refused_but_anonymous_still_works(client):
    owned = anonymous_profile(client)
    client.post("/api/me/claim", json={"profile_id": owned}, headers=token("user-a"))
    assert client.get(f"/api/profiles/{owned}", headers=token("user-a", minutes=-5)).status_code == 401
    other = anonymous_profile(client)
    assert client.get(f"/api/profiles/{other}").status_code == 200


def test_coach_respects_ownership(client):
    pid = anonymous_profile(client)
    client.post("/api/me/claim", json={"profile_id": pid}, headers=token("user-a"))
    body = {"profile_id": pid, "question": "Is my job at risk?"}
    assert client.post("/api/coach", json=body).status_code == 404
    assert client.post("/api/coach", json=body, headers=token("user-a")).status_code == 200


def test_purge_keeps_owned_profiles(client):
    owned, loose = anonymous_profile(client), anonymous_profile(client)
    client.post("/api/me/claim", json={"profile_id": owned}, headers=token("user-a"))
    with store._connect() as conn:
        conn.execute("UPDATE profiles SET updated_at='2000-01-01T00:00:00+00:00'")
    assert store.purge_older_than(30) == 1
    assert store.get_profile(owned) is not None and store.get_profile(loose) is None


def test_unreachable_key_server_is_503_not_401(client, monkeypatch):
    """A Supabase key-server outage must not look like an expired login (which signs people out)."""
    from app import auth
    from app.config import get_settings

    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    get_settings.cache_clear()

    class Down:
        def get_signing_key_from_jwt(self, _token):
            raise jwt.PyJWKClientError("Fail to fetch data from the url")

    monkeypatch.setattr(auth, "_jwks", lambda url: Down())
    try:
        assert client.get("/api/me", headers=token("user-a")).status_code == 503
    finally:
        get_settings.cache_clear()


def test_replacing_a_saved_profile_is_one_step(client):
    first, second = anonymous_profile(client), anonymous_profile(client)
    store.attach_user(first, "user-z")
    store.replace_owned_profile(first, second, "user-z")
    assert store.get_profile(first) is None
    assert store.profile_for_user("user-z")["id"] == second


def test_token_from_a_server_clock_slightly_ahead_is_accepted(client):
    # Supabase's clock ran 2 s ahead of this PC: a fresh token looked "issued in the future" and
    # every login was refused as expired. A small leeway absorbs normal clock drift.
    now = dt.datetime.now(dt.UTC)
    fresh = jwt.encode({"sub": "user-skew", "aud": "authenticated", "iat": now + dt.timedelta(seconds=5),
                        "nbf": now + dt.timedelta(seconds=5), "exp": now + dt.timedelta(hours=1)}, SECRET, algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {fresh}"}).status_code == 200


def test_long_expired_token_is_still_refused(client):
    assert client.get("/api/me", headers=token("user-old", minutes=-5)).status_code == 401
