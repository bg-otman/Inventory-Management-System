"""Upgrade a fixture created by the actual released v1.4.1 backend."""

import sqlite3
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.local_migrations import upgrade_database, upgrade_to_v5, SCHEMA_VERSION
from app.local_backups import validate
from app.schemas import DocumentInput
from app.documents import save
from app.services import state


def test_real_v4_upgrade_is_exact_and_idempotent(tmp_path):
    path = tmp_path / "v4.db"
    with sqlite3.connect(path) as db:
        db.executescript((Path(__file__).parent / "fixtures/schema4.sql").read_text())
        tables = [
            "stock",
            "payments",
            "allocations",
            "receipts",
            "movements",
            "operations",
            "activity",
        ]
        before = {t: db.execute("SELECT * FROM " + t).fetchall() for t in tables}
        prices = db.execute(
            "SELECT id,price,purchase_cost,wholesale_price,sku,barcode FROM products"
        ).fetchall()
        snap = db.execute("SELECT id,number,snapshot FROM documents").fetchall()
    validate(path)
    upgrade_database(path)
    upgrade_database(path)
    validate(path)
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        for t, rows in before.items():
            assert db.execute("SELECT * FROM " + t).fetchall() == rows
        assert (
            db.execute(
                "SELECT id,price,purchase_cost,wholesale_price,sku,barcode FROM products"
            ).fetchall()
            == prices
        )
        assert db.execute("SELECT id,number,snapshot FROM documents").fetchall() == snap
    engine = create_engine("sqlite:///" + str(path))
    with Session(engine) as db:
        user = SimpleNamespace(id="desktop")
        s = state(db, user)
        assert s["products"][0]["price"] == "12.123456" and "sku" not in s["products"][0]
        assert s["documents"][0]["language"] == "fr"
        save(
            db,
            user,
            DocumentInput(
                kind="quote",
                warehouse_id=s["warehouses"][0]["id"],
                items=[dict(name="Hors catalogue", quantity="1", price="0.123456")],
                fulfill=False,
            ),
        )
        db.commit()
        after = state(db, user)
        assert after["stock"] == s["stock"] and after["parties"] == s["parties"]
    engine.dispose()


def test_v5_upgrade_preserves_linked_documents_and_allows_standalone_invoices(tmp_path):
    path = tmp_path / "v5.db"
    with sqlite3.connect(path) as db:
        db.executescript((Path(__file__).parent / "fixtures/schema4.sql").read_text())
        db.execute("PRAGMA foreign_keys=OFF")
        upgrade_to_v5(db, 4)
        db.execute("PRAGMA user_version=5")
        id = db.execute("SELECT id FROM documents LIMIT 1").fetchone()[0]
        db.execute("UPDATE documents SET source_id=? WHERE id!=?", (id, id))
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        before = {t: db.execute("SELECT * FROM " + t).fetchall() for t in tables}
    validate(path)
    upgrade_database(path)
    upgrade_database(path)
    validate(path)
    with sqlite3.connect(path) as db:
        for t, rows in before.items():
            assert db.execute("SELECT * FROM " + t).fetchall() == rows
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        assert db.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
    engine = create_engine("sqlite:///" + str(path))
    with Session(engine) as db:
        user = SimpleNamespace(id="desktop")
        before = state(db, user)
        saved = save(
            db,
            user,
            DocumentInput(
                kind="sale",
                payment="12.35",
                items=[dict(name="Sans catalogue", quantity="1", price="12.345678")],
            ),
        )
        db.commit()
        after = state(db, user)
        doc = next(d for d in after["documents"] if d["id"] == saved["id"])
        assert doc["warehouse_id"] is None and doc["total"] == "12.35"
        assert doc["status"] == "confirmed" and not doc["fulfilled"]
        assert after["products"] == before["products"] and after["stock"] == before["stock"]
    engine.dispose()
