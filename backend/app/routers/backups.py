from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.backup import BackupRecord
from app.models.user import User
from app.schemas.backup import (
    BackupRecordResponse, BackupStatusResponse, RestoreRequest
)
from app.services.auth_service import require_owner, verify_password
from app.services.backup_service import run_backup, run_restore

router = APIRouter(prefix="/backups", tags=["backups"])

@router.get("", response_model=List[BackupRecordResponse])
def list_backups(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    return db.query(BackupRecord).order_by(BackupRecord.created_at.desc()).limit(20).all()

@router.get("/status", response_model=BackupStatusResponse)
def get_backup_status(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    last_success = db.query(BackupRecord).filter(
        BackupRecord.status == "success"
    ).order_by(BackupRecord.created_at.desc()).first()

    last_record = db.query(BackupRecord).order_by(BackupRecord.created_at.desc()).first()
    has_failure = (last_record is not None and last_record.status == "failed")
    failure_msg = last_record.error_message if has_failure else None

    return BackupStatusResponse(
        last_successful_backup=last_success.created_at if last_success else None,
        next_scheduled_run="Every Sunday at 02:00 UTC",
        backup_schedule="Sunday at 02:00 UTC",
        has_recent_failure=has_failure,
        last_failure_message=failure_msg
    )

@router.post("/now", response_model=BackupRecordResponse)
def trigger_backup_now(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    record = run_backup(db, backup_type="manual", user_id=current_user.id)
    return record

@router.post("/restore")
def restore_backup(
    payload: RestoreRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    # Verify owner password for safety
    if not verify_password(payload.confirmation_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect owner password. Restoration requires valid owner authentication."
        )

    try:
        run_restore(db, payload.backup_filename, user_id=current_user.id)
        return {
            "message": f"Successfully restored database from snapshot '{payload.backup_filename}'",
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Restoration failed: {str(e)}"
        )
