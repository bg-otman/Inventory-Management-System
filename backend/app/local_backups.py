"""SQLite snapshots, manual export/import, and weekly catch-up while open."""

import hashlib
import json
import re
import sqlite3
import threading
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from fastapi import HTTPException
from .db import DATA_DIR, DB_PATH, DB_LOCK, engine, Base
from .local_migrations import SCHEMA_VERSION, SUPPORTED_VERSIONS, upgrade_database

ROOT = DATA_DIR / "backups"
STATUS = DATA_DIR / "backup-status.json"
NAME = re.compile(r"inventory-(?:recovery-|imported-)?[A-Za-z0-9_-]+\.db")


def utc():
    return datetime.now(timezone.utc).isoformat()


def status_write(data):
    temp = STATUS.with_suffix(".tmp")
    temp.write_text(json.dumps(data), encoding="utf-8")
    temp.replace(STATUS)


def validate(path):
    try:
        with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
            if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise ValueError("Damaged database.")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in SUPPORTED_VERSIONS:
                raise ValueError("Wrong desktop backup version.")
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            expected_tables = set(Base.metadata.tables)
            if version < 3:
                expected_tables -= {"receipts", "payment_offsets"}
            if not expected_tables.issubset(tables):
                raise ValueError("Missing Inventory tables.")
            for table in Base.metadata.tables.values():
                if table.name not in expected_tables:
                    continue
                columns = {r[1] for r in db.execute(f'PRAGMA table_info("{table.name}")')}
                expected = {c.name for c in table.columns}
                if version < 5 and table.name == "warehouses":
                    expected.discard("active")
                if version < 5 and table.name == "documents":
                    expected -= {"source_id", "notes", "revision"}
                if version < 5 and table.name == "settings":
                    expected -= {"next_quote", "next_delivery"}
                if version < 4 and table.name == "products":
                    expected.discard("wholesale_price")
                if version < 4 and table.name == "document_lines":
                    expected.discard("warehouse_id")
                if version == 1 and table.name == "products":
                    expected.discard("supplier_id")
                if version < 3 and table.name == "payments":
                    expected -= {"direction", "notes"}
                if version < 3 and table.name == "settings":
                    expected.discard("next_receipt")
                if not expected.issubset(columns):
                    raise ValueError("Incompatible Inventory columns.")
            if db.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("Invalid database references.")
            settings = db.execute("SELECT data FROM settings WHERE id=1").fetchone()
            if not settings or not isinstance(json.loads(settings[0]), dict):
                raise ValueError("Missing company settings.")
            if db.execute("SELECT 1 FROM stock WHERE quantity<0 LIMIT 1").fetchone():
                raise ValueError("Invalid stock balances.")
    except (sqlite3.Error, ValueError, OSError, TypeError) as error:
        raise HTTPException(
            422, "Cette sauvegarde n’est pas valide pour cette version d’Inventory Desktop."
        ) from error


def snapshot_locked(recovery=False):
    ROOT.mkdir(parents=True, exist_ok=True)
    prefix = "inventory-recovery-" if recovery else "inventory-"
    name = (
        prefix
        + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        + "-"
        + uuid.uuid4().hex[:8]
        + ".db"
    )
    target = ROOT / name
    temp = target.with_suffix(".tmp")
    try:
        with closing(sqlite3.connect(DB_PATH)) as src, closing(sqlite3.connect(temp)) as dst:
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE")
        validate(temp)
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)
    if not recovery:
        regular = sorted(
            (
                p
                for p in ROOT.glob("inventory-*.db")
                if not p.name.startswith(("inventory-recovery-", "inventory-imported-"))
            ),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for old in regular[4:]:
            old.unlink()
    return {"name": name, "created_at": utc(), "status": "success", "recovery": recovery}


def backup():
    with DB_LOCK:
        try:
            result = snapshot_locked()
            status_write(
                {"id": uuid.uuid4().hex, "kind": "backup", "status": "success", "created_at": utc()}
            )
            return result
        except Exception:
            status_write(
                {"id": uuid.uuid4().hex, "kind": "backup", "status": "failed", "created_at": utc()}
            )
            raise


def resolve_backup(name):
    if not NAME.fullmatch(name):
        raise HTTPException(404, "Sauvegarde introuvable.")
    path = ROOT / name
    if not path.is_file():
        raise HTTPException(404, "Sauvegarde introuvable.")
    return path


def list_backups():
    items = []
    if ROOT.exists():
        for path in ROOT.glob("inventory-*.db"):
            if NAME.fullmatch(path.name):
                items.append(
                    {
                        "name": path.name,
                        "created_at": datetime.fromtimestamp(
                            path.stat().st_mtime, timezone.utc
                        ).isoformat(),
                        "status": "success",
                        "recovery": path.name.startswith("inventory-recovery-"),
                        "imported": path.name.startswith("inventory-imported-"),
                    }
                )
    jobs = []
    try:
        jobs = [json.loads(STATUS.read_text(encoding="utf-8"))]
    except (OSError, ValueError):
        pass
    return {
        "enabled": True,
        "schedule": "Weekly while open; catch up on launch",
        "retention": 4,
        "backups": sorted(items, key=lambda x: x["created_at"], reverse=True),
        "jobs": jobs,
    }


def restore(name):
    source = resolve_backup(name)
    with DB_LOCK:
        validate(source)
        # Upgrade a separate copy before touching the live database. Original
        # version-1 backups remain usable for recovery with the old application.
        prepared = ROOT / ("restore-" + uuid.uuid4().hex + ".tmp")
        try:
            with (
                closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src,
                closing(sqlite3.connect(prepared)) as dst,
            ):
                src.backup(dst)
            upgrade_database(prepared)
            validate(prepared)
            recovery = snapshot_locked(recovery=True)
        except Exception:
            prepared.unlink(missing_ok=True)
            raise
        # Dispose pooled connections before restoring. SQLite's backup API is
        # transactional and includes committed WAL data without deleting files.
        engine.dispose()
        try:
            with (
                closing(sqlite3.connect(prepared)) as src,
                closing(sqlite3.connect(DB_PATH)) as dst,
            ):
                src.backup(dst)
            engine.dispose()
            status_write(
                {
                    "id": uuid.uuid4().hex,
                    "kind": "restore",
                    "status": "success",
                    "created_at": utc(),
                }
            )
        except Exception:
            engine.dispose()
            status_write(
                {"id": uuid.uuid4().hex, "kind": "restore", "status": "failed", "created_at": utc()}
            )
            raise
        finally:
            prepared.unlink(missing_ok=True)
    return {"ok": True, "recovery": recovery["name"]}


def import_backup(content):
    with DB_LOCK:
        ROOT.mkdir(parents=True, exist_ok=True)
        name = (
            "inventory-imported-"
            + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            + "-"
            + uuid.uuid4().hex[:8]
            + ".db"
        )
        temp = (ROOT / name).with_suffix(".tmp")
        try:
            temp.write_bytes(content)
            validate(temp)
            temp.replace(ROOT / name)
        finally:
            temp.unlink(missing_ok=True)
    return {"name": name, "created_at": utc(), "status": "success", "imported": True}


def due():
    regular = [
        p
        for p in ROOT.glob("inventory-*.db")
        if not p.name.startswith(("inventory-recovery-", "inventory-imported-"))
    ]
    return not regular or time.time() - max(p.stat().st_mtime for p in regular) >= 7 * 86400


def scheduler():
    while True:
        try:
            if due():
                backup()
        except Exception:
            pass  # Failure is visible in the Backup screen.
        time.sleep(60)
