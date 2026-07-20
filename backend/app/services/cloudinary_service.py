"""
Cloudinary upload service.

Requires these env vars (add to .env):
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret

Get these from https://cloudinary.com/console after creating a free account.

Install the SDK:
    pip install cloudinary
"""

import cloudinary
import cloudinary.uploader
from fastapi import UploadFile

from app.core.config import get_settings

settings = get_settings()

cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret,
    secure=True,
)


def upload_avatar_image(image: UploadFile, user_id: str) -> str:
    """Uploads an avatar image to Cloudinary and returns its public URL."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise ValueError("File must be an image")

    result = cloudinary.uploader.upload(
        image.file,
        folder="devpulse/avatars",
        public_id=f"user_{user_id}",  # overwrites previous avatar for this user
        overwrite=True,
        resource_type="image",
        transformation=[
            {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
    )
    return result["secure_url"]