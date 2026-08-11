"""
Cloudinary upload service.

Requires these env vars (add to .env):
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret

Get these from https://cloudinary.com/console after creating a free account.
"""

import os
import shutil
import uuid
import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from app.core.config import get_settings

settings = get_settings()

if settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def is_cloudinary_configured() -> bool:
    return bool(
        settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    )


def upload_image_to_cloudinary_or_local(image: UploadFile, folder: str, prefix: str = "img") -> str:
    """
    Uploads an image to Cloudinary if credentials are configured.
    Falls back to local file storage if Cloudinary is not configured.
    Returns the secure public URL of the uploaded image.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise ValueError("File must be an image")

    if is_cloudinary_configured():
        result = cloudinary.uploader.upload(
            image.file,
            folder=f"devpulse/{folder}",
            resource_type="image",
        )
        return result["secure_url"]

    # Fallback to local uploads storage if Cloudinary env vars are missing
    uploads_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
    )
    os.makedirs(uploads_dir, exist_ok=True)

    ext = os.path.splitext(image.filename)[1] if image.filename else ".jpg"
    filename = f"{prefix}_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(uploads_dir, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    return f"{settings.public_backend_url}/uploads/{filename}"


def upload_avatar_image(image: UploadFile, user_id: str) -> str:
    """Uploads an avatar image to Cloudinary or local fallback."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise ValueError("File must be an image")

    if is_cloudinary_configured():
        result = cloudinary.uploader.upload(
            image.file,
            folder="devpulse/avatars",
            public_id=f"user_{user_id}",
            overwrite=True,
            resource_type="image",
            transformation=[
                {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
                {"quality": "auto", "fetch_format": "auto"},
            ],
        )
        return result["secure_url"]
    return upload_image_to_cloudinary_or_local(image, folder="avatars", prefix=f"user_{user_id}")


def upload_post_image(image: UploadFile) -> str:
    """Uploads a post image to Cloudinary (devpulse/posts) or local fallback."""
    return upload_image_to_cloudinary_or_local(image, folder="posts", prefix="post")


def upload_chat_image(image: UploadFile) -> str:
    """Uploads a chat attachment image to Cloudinary (devpulse/chat) or local fallback."""
    return upload_image_to_cloudinary_or_local(image, folder="chat", prefix="chat")