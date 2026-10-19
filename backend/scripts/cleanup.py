"""Delete demo profiles not updated for 30 days (retention rule in docs/05-BACKEND_SCHEMA.md)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import store  # noqa: E402

if __name__ == "__main__":
    store.init_db()
    print(f"Deleted {store.purge_older_than(30)} profiles")
