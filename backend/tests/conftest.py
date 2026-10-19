import os

import pytest

# Offline and isolated for every test run: no key, a throwaway database.
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_TOKEN"] = "test-admin-token"


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
