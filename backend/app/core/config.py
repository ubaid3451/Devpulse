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
    backend_url: str = "http://localhost:8000"

    # ── Environment ───────────────────────────────────────────────────────────
    environment: str = "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def public_backend_url(self) -> str:
        if self.backend_url and "localhost" not in self.backend_url:
            return self.backend_url.rstrip("/")
        if self.is_production:
            return "https://13.126.205.138.nip.io"
        return self.backend_url.rstrip("/")

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

    # ── Cloudinary ────────────────────────────────────────────────────────────
    cloudinary_cloud_name: str = "devpulse"
    cloudinary_api_key: str = "142434116449543"
    cloudinary_api_secret: str = "2V7PbPuUUQnWOqXwWrO-gn45NCM"

    # ── Admin ───────────────────────────────────────────────────────────────────
    admin_emails: str = ""
    admin_email: str = ""
    admin_password: str = ""
    admin_username: str = "devpulse_admin"

    @property
    def admin_emails_list(self) -> list[str]:
        """All admin emails: ADMIN_EMAILS list + ADMIN_EMAIL single value."""
        emails = [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]
        if self.admin_email.strip():
            single = self.admin_email.strip().lower()
            if single not in emails:
                emails.append(single)
        return emails


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — call get_settings() anywhere instead of Settings()."""
    return Settings()