"""
DevPulse FastAPI application entrypoint.
- CORS configured to lock to FRONTEND_URL
- Routers registered here
- Health check endpoint for deployment probing
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import get_settings
from app.routers import auth as auth_router
from app.routers import users
from app.routers import posts

settings = get_settings()


@asynccontextmanager
async def lifespan(app_fastapi: FastAPI):
    """Application lifespan: startup / shutdown hooks."""
    # Import models so they're registered with Base.metadata
    from app import models  # noqa: F401
    yield


app = FastAPI(
    title="DevPulse API",
    description="Social media platform for developers — Milestone 2: Posts & Profiles",
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
app.include_router(users.router)
app.include_router(posts.router)

# Mount uploads directory for static file serving
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "devpulse-api"}