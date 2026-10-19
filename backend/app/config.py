"""Settings from the environment (and backend/.env when present). No key means offline mode."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"'))


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    gemini_embedding_model: str
    gemini_timeout_seconds: int
    admin_token: str
    database_path: Path
    data_dir: Path
    cors_origins: tuple[str, ...]
    contact_email: str

    @property
    def llm_mode(self) -> str:
        return "gemini" if self.gemini_api_key else "offline"

    @property
    def llm_model_label(self) -> str:
        """Shown in the app, as the rules require naming the language model used."""
        if self.gemini_api_key:
            return f"Google {self.gemini_model}"
        return "No language model (offline rules and templates)"


@lru_cache
def get_settings() -> Settings:
    _load_dotenv(BACKEND_DIR / ".env")
    return Settings(
        gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        gemini_embedding_model=os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
        gemini_timeout_seconds=int(os.environ.get("GEMINI_TIMEOUT_SECONDS", "15")),
        admin_token=os.environ.get("ADMIN_TOKEN", ""),
        database_path=Path(os.environ.get("DATABASE_PATH", str(BACKEND_DIR / "laluan.db"))),
        data_dir=Path(os.environ.get("DATA_DIR", str(BACKEND_DIR / "data"))),
        contact_email=os.environ.get("CONTACT_EMAIL", ""),
        cors_origins=tuple(
            o.strip()
            for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()
        ),
    )
