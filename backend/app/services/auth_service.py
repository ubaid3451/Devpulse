"""
Authentication business logic.
All DB-touching operations live here; routers only deal with HTTP.
"""

import logging
import random
import re
import string
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.otp import OTPRecord
from app.models.user import User
from app.services.email_service import send_otp_email, send_password_reset_email

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
OTP_TTL_MINUTES = 10
OTP_RATE_LIMIT = 5          # max OTPs per user per hour
OTP_RATE_WINDOW_HOURS = 1


# ── Username helpers ───────────────────────────────────────────────────────────
def _slugify(text: str) -> str:
    """Convert any string to a safe username slug."""
    slug = re.sub(r"[^a-z0-9]", "_", text.lower().strip())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug[:40] or "user"


def _unique_username(base: str, db: Session) -> str:
    """Append random suffix until the username is unique."""
    username = base
    while True:
        result = db.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none() is None:
            return username
        suffix = "".join(random.choices(string.digits, k=4))
        username = f"{base[:36]}_{suffix}"


# ── OTP helpers ────────────────────────────────────────────────────────────────
def _generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def _check_rate_limit(user_id: str, db: Session) -> None:
    window_start = datetime.now(timezone.utc) - timedelta(hours=OTP_RATE_WINDOW_HOURS)
    result = db.execute(
        select(func.count(OTPRecord.id)).where(
            OTPRecord.user_id == user_id,
            OTPRecord.created_at >= window_start,
        )
    )
    count = result.scalar_one()
    if count >= OTP_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many OTP requests. Try again after {OTP_RATE_WINDOW_HOURS} hour(s).",
        )


def _create_otp(user: User, db: Session) -> str:
    """Check rate limit, create + persist OTP record, return the code."""
    _check_rate_limit(user.id, db)

    code = _generate_code()
    otp = OTPRecord(
        user_id=user.id,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
    )
    db.add(otp)
    db.commit()
    return code


# ── Public service functions ───────────────────────────────────────────────────

def register_user(
    full_name: str,
    email: str,
    password: str,
    db: Session,
) -> User:
    """
    Create a new email/password user (unverified).
    Sends OTP verification email.
    Raises 409 if email already exists.
    """
    # Check email uniqueness
    result = db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    username = _unique_username(_slugify(email.split("@")[0]), db)

    user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        username=username,
        is_verified=False,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send OTP (failure is logged, not raised)
    code = _create_otp(user, db)
    send_otp_email(email, code, full_name)
    logger.info("Registered user %s (id=%s)", email, user.id)

    return user


def authenticate_user(email: str, password: str, db: Session) -> User:
    """
    Verify credentials.
    Raises 401 for bad credentials, 403 for unverified, 403 for blocked.
    """
    result = db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please enter the OTP sent to your email.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Contact support.",
        )
    return user


def verify_otp(email: str, code: str, db: Session) -> User:
    """
    Validate OTP code for a user.
    Marks is_used=True and user.is_verified=True on success.
    Raises 400 for invalid/expired/used codes.
    """
    result = db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Fetch the most recent un-used OTP for this user
    otp_result = db.execute(
        select(OTPRecord)
        .where(
            OTPRecord.user_id == user.id,
            OTPRecord.is_used == False,  # noqa: E712
        )
        .order_by(OTPRecord.created_at.desc())
        .limit(1)
    )
    otp = otp_result.scalar_one_or_none()

    if not otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid OTP found")
    if otp.is_expired():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP has expired")
    if otp.code != code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP code")

    # Mark OTP as used and user as verified
    otp.is_used = True
    user.is_verified = True
    db.commit()
    db.refresh(user)

    logger.info("User %s verified via OTP", email)
    return user


def resend_otp(email: str, db: Session) -> None:
    """
    Generate a new OTP and re-send the email.
    Raises 404 if user not found, 429 on rate limit breach.
    """
    result = db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already verified")

    code = _create_otp(user, db)
    send_otp_email(email, code, user.full_name)
    logger.info("OTP resent for %s", email)

def authenticate_oauth_user(
    email: str, full_name: str, provider: str, provider_id: str, db: Session
) -> User:
    """
    Handle OAuth login/registration.
    If email exists, return the user (linking implicitly if provider matches).
    If not, create a new verified user.
    """
    result = db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        # Implicit account linking — if email exists, just log them in.
        # Ensure they are marked as verified since OAuth verified the email.
        if not user.is_verified:
            user.is_verified = True
            db.commit()
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been suspended. Contact support.",
            )
        return user

    # Create new OAuth user
    username = _unique_username(_slugify(email.split("@")[0]), db)

    user = User(
        email=email,
        full_name=full_name,
        username=username,
        is_verified=True,  # OAuth users are pre-verified
        is_active=True,
        oauth_provider=provider,
        oauth_provider_id=provider_id,
        # hashed_password remains None
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("Registered OAuth user %s via %s (id=%s)", email, provider, user.id)
    return user


def request_password_reset(email: str, db: Session) -> None:
    """
    Generate an OTP and send a password reset email if the user exists and is active.
    If the user does not exist, returns silently to prevent email enumeration.
    """
    result = db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        # Return silently to prevent enumeration attacks
        return
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Contact support.",
        )

    code = _create_otp(user, db)
    send_password_reset_email(email, code, user.full_name)
    logger.info("Password reset requested for %s", email)


def reset_password(email: str, code: str, new_password: str, db: Session) -> None:
    """
    Validate OTP and update the user's password.
    Raises 400 for invalid/expired OTPs.
    """
    result = db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Contact support.",
        )

    # Fetch the most recent un-used OTP for this user
    otp_result = db.execute(
        select(OTPRecord)
        .where(
            OTPRecord.user_id == user.id,
            OTPRecord.is_used == False,  # noqa: E712
        )
        .order_by(OTPRecord.created_at.desc())
        .limit(1)
    )
    otp = otp_result.scalar_one_or_none()

    if not otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid OTP found")
    if otp.is_expired():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP has expired")
    if otp.code != code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP code")

    # Mark OTP as used and update the user's password
    otp.is_used = True
    user.hashed_password = hash_password(new_password)
    db.commit()
    
    logger.info("Password reset successful for user %s", email)
