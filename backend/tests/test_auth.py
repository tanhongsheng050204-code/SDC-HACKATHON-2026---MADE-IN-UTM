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
