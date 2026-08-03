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
from app.routers import chat
from app.routers import admin

settings = get_settings()


@asynccontextmanager
async def lifespan(app_fastapi: FastAPI):
    """Application lifespan: startup / shutdown hooks."""
    import logging
    import uuid as _uuid
    from app import models  # noqa: F401
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.models.admin_permission import AdminPermission, VALID_PERMISSIONS
    from app.core.security import hash_password

    db = SessionLocal()
    log = logging.getLogger(__name__)
    try:
        # ── 1. Auto-create / update master superadmin account from .env ────────
        if settings.admin_email and settings.admin_password:
            existing = db.query(User).filter(
                User.email == settings.admin_email.lower()
            ).first()
            if existing:
                existing.role = "superadmin"
                existing.is_verified = True
                existing.hashed_password = hash_password(settings.admin_password)
            else:
                existing = User(
                    id=str(_uuid.uuid4()),
                    email=settings.admin_email.lower(),
                    username=settings.admin_username,
                    full_name="DevPulse Admin",
                    hashed_password=hash_password(settings.admin_password),
                    role="superadmin",
                    is_verified=True,
                    is_active=True,
                )
                db.add(existing)
                db.flush()   # get the id before seeding permissions

        # ── 2. Promote ADMIN_EMAILS list to admin (not superadmin) ─────────────
        for email in settings.admin_emails_list:
            if email == (settings.admin_email or "").lower():
                continue  # already handled above as superadmin
            target = db.query(User).filter(User.email == email).first()
            if target and target.role not in ("admin", "superadmin"):
                target.role = "admin"

        db.commit()
        log.info("Admin setup complete.")
    except Exception as e:
        db.rollback()
        log.warning(f"Admin setup failed: {e}")
    finally:
        db.close()

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
app.include_router(chat.router)
app.include_router(admin.router)

# Mount uploads directory for static file serving
uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "devpulse-api"}

# ── WebSocket pass-through wrapper ────────────────────────────────────────────
# Starlette's CORSMiddleware and SessionMiddleware don't handle WebSocket
# upgrade requests correctly — they return 403 Forbidden. This ASGI wrapper
# sits outside all middleware: for WebSocket connections it routes directly
# to the underlying FastAPI/Starlette router (skipping CORS & session),
# while HTTP requests go through the normal middleware stack.

_fastapi_app = app  # the full app with middleware (for HTTP)


async def _ws_bypass_asgi(scope, receive, send):
    if scope["type"] == "websocket":
        # Ensure FastAPI's dependency injection (Depends) works inside the endpoint
        scope.setdefault("app", _fastapi_app)
        # Route directly to the router, bypassing CORSMiddleware/SessionMiddleware
        await _fastapi_app.router(scope, receive, send)
    else:
        # HTTP and lifespan go through the full middleware stack
        await _fastapi_app(scope, receive, send)


# Re-export so `uvicorn app.main:app` picks up the wrapper
app = _ws_bypass_asgi