"""
Chat image upload — delegates to Cloudinary (was: local disk).
Kept as a thin wrapper so the import in chat.py doesn't need to change.
"""

from fastapi import UploadFile
from app.services.cloudinary_service import upload_chat_image


def save_chat_image(image: UploadFile) -> str:
    """Uploads a chat image to Cloudinary and returns its public URL."""
    return upload_chat_image(image)