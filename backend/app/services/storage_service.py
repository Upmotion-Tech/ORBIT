import os
import uuid
import shutil
from typing import Optional
from datetime import datetime

from fastapi import UploadFile

from app.core.config import settings


class StorageService:
    ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".xlsx", ".xls"}

    async def save(self, file: UploadFile, prefix: str = "") -> str:
        ext = os.path.splitext(file.filename or ".bin")[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            ext = ".bin"
        filename = f"{prefix}{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(settings.storage_path, filename)

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, "wb") as f:
            content = await file.read()
            f.write(content)

        return filename

    async def delete(self, filename: str) -> bool:
        filepath = os.path.join(settings.storage_path, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
        return False

    def get_url(self, filename: str) -> str:
        return f"/api/storage/{filename}"


storage_service = StorageService()
