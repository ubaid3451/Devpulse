from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
import os
import uuid
import shutil
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.user import User
from app.schemas.user_profile import UserProfileUpdate

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/{username}")
def get_user_profile(
    username: str,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "created_at": user.created_at
    }


@router.patch("/me/profile")
def update_profile(
    profile_in: UserProfileUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    if profile_in.bio is not None:
        current_user.bio = profile_in.bio
    if profile_in.avatar_url is not None:
        current_user.avatar_url = profile_in.avatar_url
    if profile_in.full_name is not None:
        current_user.full_name = profile_in.full_name
        
    db.commit()
    db.refresh(current_user)
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url,
        "bio": current_user.bio,
        "created_at": current_user.created_at
    }


@router.post("/me/avatar")
def upload_avatar(
    current_user: CurrentUser,
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    ext = os.path.splitext(image.filename)[1] if image.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(uploads_dir, filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
        
    image_url = f"http://localhost:8000/uploads/{filename}"
    
    current_user.avatar_url = image_url
    db.commit()
    db.refresh(current_user)
    
    return {
        "avatar_url": image_url
    }
