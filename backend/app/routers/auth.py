"""
Auth router — email/password + OTP flow.
All cookie management happens here (routers own HTTP concerns).
Business logic is delegated to auth_service.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.core.security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import get_settings
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    OTPResendRequest,
    OTPVerifyRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from app.services import auth_service
from jose import JWTError
from fastapi import Cookie, HTTPException, Request
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()

oauth = OAuth()
if settings.google_client_id and settings.google_client_secret:
    oauth.register(
        name='google',
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )
if settings.github_client_id and settings.github_client_secret:
    oauth.register(
        name='github',
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        access_token_url='https://github.com/login/oauth/access_token',
        access_token_params=None,
        authorize_url='https://github.com/login/oauth/authorize',
        authorize_params=None,
        api_base_url='https://api.github.com/',
        client_kwargs={'scope': 'user:email'},
    )

def _set_auth_cookies(response: Response, user_id: str, role: str) -> None:
    """Set httpOnly JWT cookies on a response."""
    access_token = create_access_token(user_id, role)
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
    )


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    Create a new user account.
    Sends a 6-digit OTP to the provided email for verification.
    """
    auth_service.register_user(
        full_name=payload.full_name,
        email=payload.email,
        password=payload.password,
        db=db,
    )
    return {"message": "Registration successful. Please check your email for a verification code."}


@router.post(
    "/verify-otp",
    response_model=AuthResponse,
    summary="Verify email with OTP",
)
def verify_otp(payload: OTPVerifyRequest, response: Response, db: Session = Depends(get_db)):
    """
    Verify the OTP sent to the user's email.
    On success, issues JWT cookies and marks the account as verified.
    """
    user = auth_service.verify_otp(
        email=payload.email,
        code=payload.code,
        db=db,
    )
    _set_auth_cookies(response, user.id, user.role)
    return {"message": "Email verified successfully.", "user": user}


@router.post(
    "/resend-otp",
    response_model=MessageResponse,
    summary="Resend OTP verification code",
)
def resend_otp(payload: OTPResendRequest, db: Session = Depends(get_db)):
    """
    Resend the OTP to the user's email.
    Rate-limited to 5 requests per hour per user.
    """
    auth_service.resend_otp(email=payload.email, db=db)
    return {"message": "A new verification code has been sent to your email."}


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request a password reset OTP",
)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request a password reset email.
    Always returns a success message to prevent email enumeration.
    """
    auth_service.request_password_reset(email=payload.email, db=db)
    return {"message": "If that email is registered, we have sent a password reset code."}


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password with OTP",
)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Verify the OTP and set a new password.
    """
    auth_service.reset_password(
        email=payload.email,
        code=payload.code,
        new_password=payload.new_password,
        db=db,
    )
    return {"message": "Your password has been reset successfully. You can now log in."}


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login with email and password",
)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate with email + password.
    Issues httpOnly JWT cookies on success.
    """
    user = auth_service.authenticate_user(
        email=payload.email,
        password=payload.password,
        db=db,
    )
    _set_auth_cookies(response, user.id, user.role)
    return {"message": "Login successful.", "user": user}


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout — clear auth cookies",
)
def logout(response: Response):
    """Clear access and refresh token cookies."""
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")
    return {"message": "Logged out successfully."}


@router.post(
    "/refresh",
    response_model=MessageResponse,
    summary="Rotate refresh token",
)
def refresh_token(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """
    Use a valid refresh token to issue a fresh access + refresh token pair.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )
    if not refresh_token:
        raise credentials_exc

    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise credentials_exc

    if payload.get("type") != "refresh":
        raise credentials_exc

    user_id: str = payload.get("sub", "")
    from sqlalchemy import select
    from app.models.user import User
    result = db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise credentials_exc

    _set_auth_cookies(response, user.id, user.role)
    return {"message": "Token refreshed."}


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user",
)
def get_me(current_user: CurrentUser):
    """Return the currently authenticated user's profile."""
    return current_user


# ── OAuth ─────────────────────────────────────────────────────────────────────

@router.get("/google", tags=["OAuth"])
async def login_google(request: Request):
    """Redirect to Google OAuth login."""
    if not oauth.google:
        raise HTTPException(status_code=500, detail="Google OAuth not configured in environment")
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback", tags=["OAuth"])
async def auth_google(request: Request, db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    if not oauth.google:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    user_info = token.get("userinfo")
    if not user_info:
        raise HTTPException(status_code=400, detail="Could not fetch user info from Google")
        
    email = user_info.get("email")
    full_name = user_info.get("name") or email.split("@")[0]
    provider_id = user_info.get("sub")
    
    user = auth_service.authenticate_oauth_user(email, full_name, "google", provider_id, db)
    
    response = RedirectResponse(url=f"{settings.frontend_url}/feed")
    _set_auth_cookies(response, user.id, user.role)
    return response


@router.get("/github", tags=["OAuth"])
async def login_github(request: Request):
    """Redirect to GitHub OAuth login."""
    if not oauth.github:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured in environment")
    redirect_uri = settings.github_redirect_uri
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/github/callback", tags=["OAuth"])
async def auth_github(request: Request, db: Session = Depends(get_db)):
    """Handle GitHub OAuth callback."""
    if not oauth.github:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")
    try:
        token = await oauth.github.authorize_access_token(request)
        resp = await oauth.github.get('user', token=token)
        user_info = resp.json()
        
        # GitHub might not return email in 'user' if the email is marked private
        email = user_info.get("email")
        if not email:
            emails_resp = await oauth.github.get('user/emails', token=token)
            emails = emails_resp.json()
            primary_email = next((e for e in emails if e.get("primary")), None)
            if primary_email:
                email = primary_email.get("email")
                
        if not email:
            raise HTTPException(status_code=400, detail="Could not fetch email from GitHub")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    full_name = user_info.get("name") or user_info.get("login") or email.split("@")[0]
    provider_id = str(user_info.get("id"))
    
    user = auth_service.authenticate_oauth_user(email, full_name, "github", provider_id, db)
    
    response = RedirectResponse(url=f"{settings.frontend_url}/feed")
    _set_auth_cookies(response, user.id, user.role)
    return response
