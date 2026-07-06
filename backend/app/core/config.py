from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All configuration is read from environment variables (or a .env file).
    Never hard-code secrets — always use this class.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql://<PLACEHOLDER>:<PLACEHOLDER>@localhost:5432/<PLACEHOLDER>"

    # ── JWT ───────────────────────────────────────────────────────────────────
    secret_key: str = "<PLACEHOLDER>"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # ── CORS ──────────────────────────────────────────────────────────────────
    frontend_url: str = "http://localhost:3000"

    # ── Environment ───────────────────────────────────────────────────────────
    environment: str = "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    # ── Google OAuth ──────────────────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # ── GitHub OAuth ──────────────────────────────────────────────────────────
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/auth/github/callback"

    # ── SMTP ──────────────────────────────────────────────────────────────────
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = "<PLACEHOLDER>"
    smtp_password: str = "<PLACEHOLDER>"
    smtp_from_email: str = "<PLACEHOLDER>"
    smtp_from_name: str = "DevPulse"
    smtp_use_tls: bool = True


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — call get_settings() anywhere instead of Settings()."""
    return Settings()
