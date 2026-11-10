"""Small, transactional upgrades for local business data."""

import sqlite3
import re
from contextlib import closing
from decimal import Decimal
from .decimal_type import price_text

SCHEMA_VERSION = 5
SUPPORTED_VERSIONS = (1, 2, 3, 4, SCHEMA_VERSION)


def upgrade_prices(db, table, price_columns):
    """Rebuild only price-bearing tables; convert old integer cents exactly."""
    schema = db.execute("SELECT sql FROM sqlite_master WHERE name=?", (table,)).fetchone()[0]
    for column in price_columns:
        schema = re.sub(
            r"\b" + column + r"\s+BIGINT\b", column + " TEXT", schema, flags=re.IGNORECASE
        )
    schema = re.sub(
        r'CREATE TABLE "?' + table + r'"?', "CREATE TABLE " + table + "_v4", schema, count=1
    )
    columns = [row[1] for row in db.execute("PRAGMA table_info(" + table + ")")]
    db.execute(schema)
    cursor = db.execute("SELECT * FROM " + table)
    indexes = [columns.index(name) for name in price_columns]
    while rows := cursor.fetchmany(500):
        converted = []
        for raw in rows:
            row = list(raw)
            for i in indexes:
                if row[i] is not None:
                    row[i] = price_text(Decimal(row[i]) / 100)
            converted.append(row)
        db.executemany(
            "INSERT INTO " + table + "_v4 VALUES (" + ",".join("?" for _ in columns) + ")",
            converted,
        )
    db.execute("DROP TABLE " + table)
    db.execute("ALTER TABLE " + table + "_v4 RENAME TO " + table)


def upgrade_database(path):
    with closing(sqlite3.connect(path)) as db, db:
        # SQLite requires this outside the transaction when rebuilding tables.
        # All references are checked before commit, and DDL rolls back on error.
        db.execute("PRAGMA foreign_keys=OFF")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version == SCHEMA_VERSION:
            return
        if version not in SUPPORTED_VERSIONS:
            raise ValueError("Unsupported Inventory database version.")
        db.execute("BEGIN IMMEDIATE")
        columns = {r[1] for r in db.execute("PRAGMA table_info(products)")}
        if "supplier_id" not in columns:
            db.execute(
                "ALTER TABLE products ADD COLUMN supplier_id VARCHAR(36) REFERENCES parties(id)"
            )
        if version < 3:
            db.execute(
                "ALTER TABLE payments ADD COLUMN direction VARCHAR(10) NOT NULL DEFAULT 'received'"
            )
            db.execute("ALTER TABLE payments ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
            db.execute(
                "UPDATE payments SET direction='paid' WHERE party_id IN (SELECT id FROM parties WHERE kind='supplier')"
            )
            db.execute("ALTER TABLE settings ADD COLUMN next_receipt INTEGER NOT NULL DEFAULT 1")
            db.execute(
                """CREATE TABLE payment_offsets (
                id VARCHAR(36) PRIMARY KEY, received_id VARCHAR(36) NOT NULL REFERENCES payments(id),
                paid_id VARCHAR(36) NOT NULL REFERENCES payments(id), amount BIGINT NOT NULL CHECK(amount > 0))"""
            )
            db.execute(
                """CREATE TABLE receipts (
                id VARCHAR(36) PRIMARY KEY, number VARCHAR(60) NOT NULL UNIQUE,
                party_id VARCHAR(36) REFERENCES parties(id), payment_id VARCHAR(36) NOT NULL REFERENCES payments(id),
                action VARCHAR(20) NOT NULL, snapshot JSON NOT NULL, created_at DATETIME NOT NULL)"""
            )
        if "wholesale_price" not in columns:
            db.execute(
                "ALTER TABLE products ADD COLUMN wholesale_price BIGINT CHECK(wholesale_price IS NULL OR wholesale_price>=0)"
            )
        line_columns = {r[1] for r in db.execute("PRAGMA table_info(document_lines)")}
        if "warehouse_id" not in line_columns:
            db.execute(
                "ALTER TABLE document_lines ADD COLUMN warehouse_id VARCHAR(36) REFERENCES warehouses(id)"
            )
        db.execute(
            "UPDATE document_lines SET warehouse_id=(SELECT warehouse_id FROM documents WHERE documents.id=document_lines.document_id) WHERE warehouse_id IS NULL"
        )
        if version < 4:
            upgrade_prices(db, "products", ("price", "purchase_cost", "wholesale_price"))
            upgrade_prices(db, "document_lines", ("price",))
        db.execute("ALTER TABLE warehouses ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1")
        db.execute(
            "ALTER TABLE documents ADD COLUMN source_id VARCHAR(36) REFERENCES documents(id)"
        )
        db.execute("ALTER TABLE documents ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
        db.execute("ALTER TABLE documents ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
        db.execute("ALTER TABLE settings ADD COLUMN next_quote INTEGER NOT NULL DEFAULT 1")
        db.execute("ALTER TABLE settings ADD COLUMN next_delivery INTEGER NOT NULL DEFAULT 1")
        schema = db.execute("SELECT sql FROM sqlite_master WHERE name='document_lines'").fetchone()[
            0
        ]
        schema = re.sub(r"product_id (VARCHAR\(36\)) NOT NULL", r"product_id \1", schema)
        schema = re.sub(
            r'CREATE TABLE "?document_lines"?', "CREATE TABLE document_lines_v5", schema, count=1
        )
        db.execute(schema)
        db.execute("INSERT INTO document_lines_v5 SELECT * FROM document_lines")
        db.execute("DROP TABLE document_lines")
        db.execute("ALTER TABLE document_lines_v5 RENAME TO document_lines")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Invalid references in the existing database; upgrade cancelled.")
        db.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
