from pathlib import Path
from typing import Optional
from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ (so ./data/dev.db is not tied to shell cwd)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    app_name: str = "OpenStudy Backend"
    app_env: str = "dev"
    api_base_url: str = "http://localhost:8000"

    database_url: str = "postgresql+asyncpg://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres"
    # Optional: Supabase — split host/password so @/# in passwords never break the URL.
    database_host: Optional[str] = None
    database_user: str = "postgres"
    database_password: str = ""
    database_port: int = 5432
    database_name: str = "postgres"
    database_ssl: bool = True
    database_ssl_insecure: bool = False

    jwt_secret_key: str = "CHANGE_ME"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # Preferred alias for direct OpenAI-style key naming.
    gpt_api_key: str = ""
    ohmygpt_api_key: str = ""
    ohmygpt_base_url: str = "https://api.ohmygpt.com/v1"
    ai_scoring_provider: str = "heuristic"
    ai_scoring_model: str = "gpt-5.4-mini"
    ai_scoring_temperature: float = 0.1
    ai_scoring_timeout_sec: float = 20.0
    ai_scoring_max_tokens: int = 600
    quiz_generation_provider: str = "heuristic"
    quiz_generation_model: str = "gpt-5.4-mini"
    quiz_generation_temperature: float = 0.4
    quiz_generation_timeout_sec: float = 25.0
    quiz_generation_max_tokens: int = 800
    quiz_audio_max_bytes: int = 8 * 1024 * 1024

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def normalize_ai_key_aliases(self) -> "Settings":
        if not self.ohmygpt_api_key.strip() and self.gpt_api_key.strip():
            self.ohmygpt_api_key = self.gpt_api_key.strip()
        return self

    @model_validator(mode="after")
    def assemble_database_url(self) -> "Settings":
        host = (self.database_host or "").strip()
        if not host:
            return self
        pwd = (self.database_password or "").strip()
        if not pwd:
            # Password not set yet — keep DATABASE_URL from .env (e.g. local SQLite).
            return self
        u = quote_plus(self.database_user)
        p = quote_plus(pwd)
        self.database_url = (
            f"postgresql+asyncpg://{u}:{p}@{host}:{self.database_port}/{self.database_name}"
        )
        return self

    @model_validator(mode="after")
    def resolve_sqlite_path_under_backend(self) -> "Settings":
        """Anchor relative SQLite paths to backend/ and ensure data/ exists."""
        url = self.database_url
        prefix = "sqlite+aiosqlite:///"
        if not url.startswith(prefix):
            return self
        rest = url[len(prefix) :]
        if not rest.startswith("./"):
            return self
        path = (_BACKEND_ROOT / rest[2:]).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        self.database_url = f"sqlite+aiosqlite:///{path}"
        return self


settings = Settings()
