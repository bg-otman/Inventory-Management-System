from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class BackupRecordResponse(BaseModel):
    id: int
    filename: str
    size_bytes: int
    status: str
    backup_type: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class BackupStatusResponse(BaseModel):
    last_successful_backup: Optional[datetime] = None
    next_scheduled_run: Optional[str] = None
    backup_schedule: str = "Sunday at 02:00 UTC"
    has_recent_failure: bool = False
    last_failure_message: Optional[str] = None

class RestoreRequest(BaseModel):
    backup_filename: str
    confirmation_password: str
