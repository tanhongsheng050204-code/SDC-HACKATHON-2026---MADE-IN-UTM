"""Delete demo copies left alone for a day and anonymous profiles left alone for 30 days (retention
rule in docs/05-BACKEND_SCHEMA.md). The API also does this at every start. Profiles saved to an
account stay until their owner deletes them."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import store  # noqa: E402

if __name__ == "__main__":
    store.init_db()
    print(f"Deleted {store.purge_stale()}")
