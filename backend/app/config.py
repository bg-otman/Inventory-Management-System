import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mizan"
    _db_url: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+psycopg2://mizan:mizan_secret@localhost:5432/mizan_db"
    )

    @property
    def DATABASE_URL(self) -> str:
        url = self._db_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY", 
        "mizan_super_secret_session_key_production_2026_morocco_balance"
    )
    SESSION_COOKIE_NAME: str = "mizan_session"
    SESSION_MAX_AGE_SECONDS: int = 60 * 60 * 24 * 7  # 7 days
    BACKUP_DIR: str = os.getenv(
        "BACKUP_DIR", 
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../backups"))
    )
    UPLOAD_DIR: str = os.getenv(
        "UPLOAD_DIR", 
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../uploads"))
    )
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    class Config:
        env_file = ".env"

settings = Settings()
