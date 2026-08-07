"""
Chat image upload handling.
"""

import os
import shutil
import uuid

from fastapi import UploadFile

from app.core.config import get_settings


def save_chat_image(image: UploadFile) -> str:
    """Validates and saves an uploaded chat image, returns its public URL."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise ValueError("File must be an image")

    uploads_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
    )
    os.makedirs(uploads_dir, exist_ok=True)

    ext = image.filename.split(".")[-1] if image.filename and "." in image.filename else "jpg"
    filename = f"chat_{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(uploads_dir, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    settings = get_settings()
    return f"{settings.backend_url}/uploads/{filename}"