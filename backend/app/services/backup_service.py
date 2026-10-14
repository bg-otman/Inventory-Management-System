import os
import shutil
import subprocess
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from sqlalchemy.orm import Session as DBSession
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.config import settings
from app.database import SessionLocal
from app.models.backup import BackupRecord
from app.models.audit import ActivityLog

scheduler = BackgroundScheduler()

def get_backup_dir() -> str:
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    return settings.BACKUP_DIR

def run_backup(db: DBSession, backup_type: str = "manual", user_id: Optional[int] = None) -> BackupRecord:
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"mizan_backup_{backup_type}_{timestamp_str}.dump"
    filepath = os.path.join(get_backup_dir(), filename)

    error_msg = None
    status = "failed"
    size_bytes = 0

    try:
        # Determine how to run pg_dump: either local pg_dump or via docker exec
        if shutil.which("pg_dump"):
            # Direct pg_dump
            cmd = [
                "pg_dump",
                "-d", settings.DATABASE_URL,
                "-Fc",
                "-f", filepath
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if res.returncode != 0:
                raise RuntimeError(f"pg_dump failed: {res.stderr}")
        elif shutil.which("docker"):
            # Docker container execution
            container_backup_path = f"/backups/{filename}"
            cmd = [
                "docker", "exec", "mizan_postgres",
                "pg_dump", "-U", "mizan", "-d", "mizan_db",
                "-Fc", "-f", container_backup_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if res.returncode != 0:
                raise RuntimeError(f"docker pg_dump failed: {res.stderr}")
        else:
            raise RuntimeError("Neither pg_dump nor docker is available in system PATH")

        if os.path.exists(filepath):
            size_bytes = os.path.getsize(filepath)
            status = "success"
        else:
            raise RuntimeError(f"Backup file was not created at {filepath}")

    except Exception as e:
        error_msg = str(e)
        status = "failed"

    record = BackupRecord(
        filename=filename,
        filepath=filepath,
        size_bytes=size_bytes,
        status=status,
        backup_type=backup_type,
        error_message=error_msg
    )
    db.add(record)

    # Activity log
    log = ActivityLog(
        user_id=user_id,
        action="backup",
        entity_type="backup",
        entity_id=None,
        details=f"Backup {filename} status: {status}" + (f" ({error_msg})" if error_msg else "")
    )
    db.add(log)
    db.commit()
    db.refresh(record)

    # Enforce retention policy: retain the last 4 successful weekly backups
    if status == "success" and backup_type == "scheduled":
        clean_old_backups(db)

    return record


def clean_old_backups(db: DBSession, retain_count: int = 4):
    """Retains the last `retain_count` successful backups, deleting older files and records."""
    successful_backups = db.query(BackupRecord).filter(
        BackupRecord.status == "success",
        BackupRecord.backup_type == "scheduled"
    ).order_by(BackupRecord.created_at.desc()).all()

    if len(successful_backups) > retain_count:
        to_delete = successful_backups[retain_count:]
        for b in to_delete:
            if os.path.exists(b.filepath):
                try:
                    os.remove(b.filepath)
                except OSError:
                    pass
            db.delete(b)
        db.commit()


def run_restore(db: DBSession, filename: str, user_id: int) -> bool:
    """
    Restores the database from the specified backup snapshot:
    1. Creates a safety pre-restore backup of the current database.
    2. Restores the chosen snapshot using pg_restore.
    3. Records the restoration outcome.
    """
    filepath = os.path.join(get_backup_dir(), filename)
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Backup file {filename} not found")

    # Step 1: Pre-restore recovery backup
    pre_restore_record = run_backup(db, backup_type="pre_restore", user_id=user_id)
    if pre_restore_record.status != "success":
        raise RuntimeError("Failed to create safety pre-restore backup; aborting restore operation")

    # Step 2: Run pg_restore
    try:
        if shutil.which("pg_restore"):
            cmd = [
                "pg_restore",
                "-d", settings.DATABASE_URL,
                "--clean",
                "--if-exists",
                filepath
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            # Note: pg_restore may return 1 on non-fatal warnings (e.g. drop if exists), so check stderr
            if res.returncode not in (0, 1):
                raise RuntimeError(f"pg_restore failed: {res.stderr}")
        elif shutil.which("docker"):
            container_backup_path = f"/backups/{filename}"
            cmd = [
                "docker", "exec", "mizan_postgres",
                "pg_restore", "-U", "mizan", "-d", "mizan_db",
                "--clean", "--if-exists", container_backup_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if res.returncode not in (0, 1):
                raise RuntimeError(f"docker pg_restore failed: {res.stderr}")
        else:
            raise RuntimeError("Neither pg_restore nor docker is available in system PATH")

        # Step 3: Record restoration in activity log
        log = ActivityLog(
            user_id=user_id,
            action="restore",
            entity_type="backup",
            details=f"Successfully restored database from snapshot {filename}"
        )
        db.add(log)
        db.commit()
        return True

    except Exception as e:
        log = ActivityLog(
            user_id=user_id,
            action="restore_failed",
            entity_type="backup",
            details=f"Failed to restore from snapshot {filename}: {str(e)}"
        )
        db.add(log)
        db.commit()
        raise e


def scheduled_weekly_backup_job():
    db = SessionLocal()
    try:
        run_backup(db, backup_type="scheduled")
    finally:
        db.close()

def start_scheduler():
    if not scheduler.running:
        # Schedule every Sunday at 02:00 UTC
        scheduler.add_job(
            scheduled_weekly_backup_job,
            CronTrigger(day_of_week="sun", hour=2, minute=0, timezone="UTC"),
            id="weekly_backup_job",
            replace_existing=True
        )
        scheduler.start()

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
