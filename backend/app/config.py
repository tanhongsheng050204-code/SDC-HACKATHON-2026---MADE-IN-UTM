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
    database_url: str  # Postgres (Supabase) when set; otherwise SQLite at database_path
    data_dir: Path
    cors_origins: tuple[str, ...]
    cors_origin_regex: str | None
    contact_email: str
    openalex_api_key: str
    supabase_url: str
    supabase_jwt_secret: str  # legacy HS256 secret; empty = verify with the project's public keys
    frontend_dist: Path | None  # built React app served at /, so one process hosts everything
    runpod_api_key: str
    runpod_llm_endpoint: str  # Serverless endpoint ID of a vLLM worker; empty = no open-model CV reading
    runpod_llm_model: str
    runpod_whisper_endpoint: str  # Serverless endpoint ID of a faster-whisper worker; empty = browser speech only
    runpod_whisper_model: str
    runpod_timeout_seconds: int
    sentry_dsn: str  # error tracking; empty = off
    sentry_environment: str
    smtp_host: str
    smtp_port: int
    smtp_user: str  # e.g. the team Gmail address; empty = email is not set up
    smtp_password: str  # a Gmail app password, never the account password
    mail_from: str
    cron_secret: str  # header X-Cron-Secret for /api/cron/*; also signs unsubscribe links
    app_url: str  # the site, for links in emails
    public_api_url: str  # this API, for the one-click unsubscribe header

    @property
    def email_available(self) -> bool:
        return bool(self.smtp_user and self.smtp_password and self.cron_secret)

    @property
    def llm_mode(self) -> str:
        return "gemini" if self.gemini_api_key else "offline"

    @property
    def llm_model_label(self) -> str:
        """Shown in the app, as the rules require naming the language model used."""
        cv = f"; CV reading: {self.runpod_llm_model} on RunPod" if self.runpod_api_key and self.runpod_llm_endpoint else ""
        if self.gemini_api_key:
            return f"Google {self.gemini_model}{cv}"
        return f"No language model (offline rules and templates){cv}"


def _frontend_dist() -> Path | None:
    configured = os.environ.get("FRONTEND_DIST")
    path = Path(configured) if configured else BACKEND_DIR.parent / "frontend" / "dist"
    return path if (path / "index.html").exists() else None


@lru_cache
def get_settings() -> Settings:
    _load_dotenv(BACKEND_DIR / ".env")
    return Settings(
        gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
        gemini_embedding_model=os.environ.get("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
        gemini_timeout_seconds=int(os.environ.get("GEMINI_TIMEOUT_SECONDS", "15")),
        admin_token=os.environ.get("ADMIN_TOKEN", ""),
        database_path=Path(os.environ.get("DATABASE_PATH", str(BACKEND_DIR / "laluan.db"))),
        database_url=os.environ.get("DATABASE_URL", ""),
        data_dir=Path(os.environ.get("DATA_DIR", str(BACKEND_DIR / "data"))),
        contact_email=os.environ.get("CONTACT_EMAIL", ""),
        openalex_api_key=os.environ.get("OPENALEX_API_KEY", ""),
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_jwt_secret=os.environ.get("SUPABASE_JWT_SECRET", ""),
        frontend_dist=_frontend_dist(),
        runpod_api_key=os.environ.get("RUNPOD_API_KEY", ""),
        runpod_llm_endpoint=os.environ.get("RUNPOD_LLM_ENDPOINT", ""),
        runpod_llm_model=os.environ.get("RUNPOD_LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
        runpod_whisper_endpoint=os.environ.get("RUNPOD_WHISPER_ENDPOINT", ""),
        runpod_whisper_model=os.environ.get("RUNPOD_WHISPER_MODEL", "small"),
        runpod_timeout_seconds=int(os.environ.get("RUNPOD_TIMEOUT_SECONDS", "20")),
        sentry_dsn=os.environ.get("SENTRY_DSN", ""),
        sentry_environment=os.environ.get("SENTRY_ENVIRONMENT") or "production",
        smtp_host=os.environ.get("SMTP_HOST") or "smtp.gmail.com",
        smtp_port=int(os.environ.get("SMTP_PORT") or "587"),
        smtp_user=os.environ.get("SMTP_USER", ""),
        smtp_password=os.environ.get("SMTP_PASSWORD", ""),
        mail_from=os.environ.get("MAIL_FROM") or os.environ.get("SMTP_USER", ""),
        cron_secret=os.environ.get("CRON_SECRET", ""),
        app_url=(os.environ.get("APP_URL") or "https://laluan-psi.vercel.app").rstrip("/"),
        public_api_url=(os.environ.get("PUBLIC_API_URL") or "https://laluan-api.onrender.com").rstrip("/"),
        cors_origins=tuple(
            o.strip()
            for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()
        ),
        # Hosts like Vercel serve one site under several addresses (per-deploy URLs, team alias).
        cors_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
    )
