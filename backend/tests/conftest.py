import os
import tempfile

import pytest

# Offline and isolated for every test run: no key, a throwaway database. The default database
# path matters too: tests that read reference data without the client fixture must never touch
# backend/laluan.db.
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(prefix="laluan-test-"), "default.db")
os.environ["DATABASE_URL"] = ""
os.environ["SUPABASE_JWT_SECRET"] = "test-jwt-secret-long-enough-for-hs256"
os.environ["SUPABASE_URL"] = ""
os.environ["RUNPOD_API_KEY"] = ""
os.environ["RUNPOD_LLM_ENDPOINT"] = ""
os.environ["RUNPOD_WHISPER_ENDPOINT"] = ""


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    from app.config import get_settings
    from app.reference import get_reference

    get_settings.cache_clear()
    get_reference.cache_clear()
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()
    get_reference.cache_clear()


@pytest.fixture(autouse=True)
def offline_history(monkeypatch):
    """Trend refreshes in tests never reach the network for the forecast history; tests that need
    history patch these again with fake series."""
    from app.trends import jobs, research

    def offline(*_args, **_kwargs):
        raise RuntimeError("no network in tests")

    monkeypatch.setattr(jobs, "collect_series", offline)
    monkeypatch.setattr(research, "collect_series", offline)


@pytest.fixture(autouse=True)
def offline_my_postings(monkeypatch):
    """Nor for Malaysian postings on freehire.me; test_trends patches in fake counts."""
    from app.trends import mypostings

    def offline(*_args, **_kwargs):
        raise ValueError("no network in tests")

    monkeypatch.setattr(mypostings, "collect", offline)
