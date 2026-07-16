import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "Orbit CRM API"
    app_version: str = "1.0.0"
    debug: bool = True

    database_url: Optional[str] = None

    upload_dir: str = "app/storage"

    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def db_url(self) -> str:
        url = self.database_url
        if url and url.strip():
            url = url.strip()
            if "postgres" in url and "+" not in url:
                url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            return url
        return "sqlite+aiosqlite:///./orbit.db"

    @property
    def is_postgres(self) -> bool:
        return self.database_url is not None and "postgres" in self.database_url

    @property
    def storage_path(self) -> str:
        os.makedirs(self.upload_dir, exist_ok=True)
        return os.path.abspath(self.upload_dir)


settings = Settings()
