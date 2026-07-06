"""
DevPulse FastAPI application entrypoint.
- CORS configured to lock to FRONTEND_URL
- Routers registered here
- Health check endpoint for deployment probing
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import auth as auth_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app_fastapi: FastAPI):
    """Application lifespan: startup / shutdown hooks."""
    # Import models so they're registered with Base.metadata
    from app import models  # noqa: F401
    yield


app = FastAPI(
    title="DevPulse API",
    description="Social media platform for developers — Milestone 1: Authentication",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,          # Required for cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# ── Sessions ──────────────────────────────────────────────────────────────────
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "devpulse-api"}
