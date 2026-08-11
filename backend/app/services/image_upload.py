"""
Chat image upload handling.
"""

from fastapi import UploadFile
from app.services import cloudinary_service


def save_chat_image(image: UploadFile) -> str:
    """Validates and saves an uploaded chat image (Cloudinary or local fallback), returns public URL."""
    return cloudinary_service.upload_chat_image(image)