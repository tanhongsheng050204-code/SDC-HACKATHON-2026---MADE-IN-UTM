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
