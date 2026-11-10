import os
import re
import json
from decimal import Decimal
import sqlite3
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from contextlib import closing
import pytest
from fastapi.testclient import TestClient
from app import db, local_backups
from app.main import app
from app.local_bootstrap import bootstrap
from app.local_migrations import SCHEMA_VERSION


@pytest.fixture
def local(tmp_path, monkeypatch):
    app.dependency_overrides.clear()
    db.engine.dispose()
    db.Base.metadata.drop_all(db.engine)
    bootstrap()
    monkeypatch.setattr(local_backups, "ROOT", tmp_path / "backups")
    monkeypatch.setattr(local_backups, "STATUS", tmp_path / "status.json")
    with TestClient(
        app, headers={"X-Inventory-Local": os.environ["INVENTORY_LOCAL_TOKEN"]}
    ) as client:
        yield client
    db.engine.dispose()


def post(client, path, data=None):
    r = client.post(
        "/api/v1" + path, json=data or {}, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_dev_browser_auth_is_limited_to_loopback_origin(monkeypatch):
    monkeypatch.setenv("INVENTORY_DEV_MODE", "1")
    monkeypatch.setenv("INVENTORY_DEV_ORIGIN", "http://127.0.0.1:3100")
    with TestClient(app, client=("127.0.0.1", 1234)) as client:
        same_origin_get = client.get("/api/v1/health")
        allowed = client.get("/api/v1/health", headers={"Origin": "http://127.0.0.1:3100"})
        allowed_localhost = client.get(
            "/api/v1/health", headers={"Origin": "http://localhost:3100"}
        )
        denied = client.get("/api/v1/health", headers={"Origin": "http://127.0.0.1:3000"})
        denied_localhost = client.get(
            "/api/v1/health", headers={"Origin": "http://localhost:3000"}
        )
    assert same_origin_get.status_code == 200
    assert allowed.status_code == 200
    assert allowed_localhost.status_code == 200
    assert denied.status_code == 403
    assert denied_localhost.status_code == 403


def product(client):
    cat = post(client, "/categories", {"name": "Coffee"})["id"]
    supplier = post(client, "/parties", {"kind": "supplier", "name": "Supplier"})["id"]
    return post(
        client,
        "/products",
        {
            "name": "Beans",
            "category_id": cat,
            "supplier_id": supplier,
            "price": "90071992547409.91",
            "stock_mode": "existing",
        },
    )["id"]


def test_exact_integer_storage_and_persistence(local):
    pid = product(local)
    post(
        local,
        "/stock/adjust",
        {
            "product_id": pid,
            "warehouse_id": local.get("/api/v1/state").json()["warehouses"][0]["id"],
            "quantity": "2",
            "reason": "Opening",
        },
    )
    db.engine.dispose()
    s = local.get("/api/v1/state").json()
    assert s["products"][0]["price"] == "90071992547409.91"
    assert s["stock"][0]["quantity"] == "2.000"
    with sqlite3.connect(db.DB_PATH) as raw:
        assert raw.execute("SELECT price, typeof(price) FROM products").fetchone() == (
            "90071992547409.91",
            "text",
        )
        assert "users" not in {
            r[0] for r in raw.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }


def test_backup_restore_and_recovery_without_password(local):
    product(local)
    before = local.get("/api/v1/state").json()
    backup = post(local, "/backups")
    post(local, "/categories", {"name": "Added after backup"})
    restored = post(local, "/backups/restore", {"backup": backup["name"], "confirmed": True})
    after = local.get("/api/v1/state").json()
    assert after == before
    assert restored["recovery"].startswith("inventory-recovery-")
    post(local, "/backups/restore", {"backup": restored["recovery"], "confirmed": True})
    assert any(
        c["name"] == "Added after backup" for c in local.get("/api/v1/state").json()["categories"]
    )


def test_backup_export_import_and_validation(local):
    product(local)
    backup = post(local, "/backups")
    exported = local.get("/api/v1/backups/" + backup["name"] + "/export")
    assert exported.status_code == 200 and exported.content.startswith(b"SQLite format 3")
    imported = local.post("/api/v1/backups/import", content=exported.content)
    assert imported.status_code == 200 and imported.json()["name"].startswith("inventory-imported-")
    before = local.get("/api/v1/state").json()
    assert local.post("/api/v1/backups/import", content=b"not a database").status_code == 422
    assert (
        local.post(
            "/api/v1/backups/restore", json={"backup": backup["name"], "confirmed": False}
        ).status_code
        == 422
    )
    assert local.get("/api/v1/state").json() == before
    assert not list(local_backups.ROOT.glob("*.tmp"))


def test_weekly_catchup_and_retention(local):
    assert local_backups.due()
    for _ in range(6):
        post(local, "/backups")
    rows = local.get("/api/v1/backups").json()["backups"]
    assert len(rows) == 4 and not local_backups.due()
    for row in rows:
        os.utime(local_backups.ROOT / row["name"], (time.time() - 8 * 86400,) * 2)
    assert local_backups.due()


def test_single_machine_serializes_stock_writes(local):
    pid = product(local)
    warehouse = local.get("/api/v1/state").json()["warehouses"][0]["id"]
    post(
        local,
        "/stock/adjust",
        {"product_id": pid, "warehouse_id": warehouse, "quantity": "1", "reason": "Opening"},
    )
    payload = {
        "kind": "sale",
        "warehouse_id": warehouse,
        "items": [{"product_id": pid, "quantity": "1", "price": "1"}],
        "payment": "1",
    }

    def sell(_):
        return local.post(
            "/api/v1/documents", json=payload, headers={"Idempotency-Key": str(uuid.uuid4())}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as workers:
        assert sorted(workers.map(sell, range(2))) == [200, 409]
    state = local.get("/api/v1/state").json()
    assert len(state["documents"]) == 1 and state["stock"][0]["quantity"] == "0.000"


def test_language_persists_without_account(local):
    response = local.patch("/api/v1/preferences", json={"language": "fr"})
    assert response.status_code == 200
    assert local.get("/api/v1/preferences").json() == {"language": "fr"}


def remove_fixture_columns(connection, table, removed):
    schema = connection.execute("SELECT sql FROM sqlite_master WHERE name=?", (table,)).fetchone()[
        0
    ]
    schema = "\n".join(line for line in schema.splitlines() if not any(k in line for k in removed))
    schema = re.sub(r",\s*\)", "\n)", schema)
    schema = re.sub(
        r'CREATE TABLE "?' + table + r'"?', "CREATE TABLE " + table + "_old", schema, count=1
    )
    columns = ", ".join(
        '"' + r[1] + '"'
        for r in connection.execute("PRAGMA table_info(" + table + ")")
        if r[1] not in removed
    )
    connection.execute(schema)
    connection.execute(f"INSERT INTO {table}_old ({columns}) SELECT {columns} FROM {table}")
    connection.execute("DROP TABLE " + table)
    connection.execute(f"ALTER TABLE {table}_old RENAME TO {table}")


def downgrade_fixture(path, version):
    """Reproduce historical schema differences without changing business amounts."""
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute("PRAGMA foreign_keys=OFF")
        connection.execute("BEGIN")
        remove_fixture_columns(connection, "documents", ("source_id", "notes", "revision"))
        remove_fixture_columns(connection, "warehouses", ("active",))
        remove_fixture_columns(connection, "settings", ("next_quote", "next_delivery"))
        remove_fixture_columns(
            connection,
            "products",
            ("supplier_id", "wholesale_price") if version == 1 else ("wholesale_price",),
        )
        remove_fixture_columns(connection, "document_lines", ("warehouse_id",))
        for table, names in [
            ("products", ("price", "purchase_cost")),
            ("document_lines", ("price",)),
        ]:
            schema = connection.execute(
                "SELECT sql FROM sqlite_master WHERE name=?", (table,)
            ).fetchone()[0]
            for name in names:
                schema = re.sub(r"\b" + name + r"\s+TEXT\b", name + " BIGINT", schema)
            schema = re.sub(
                r'CREATE TABLE "?' + table + r'"?',
                "CREATE TABLE " + table + "_cents",
                schema,
                count=1,
            )
            columns = [r[1] for r in connection.execute("PRAGMA table_info(" + table + ")")]
            connection.execute(schema)
            for raw in connection.execute("SELECT * FROM " + table).fetchall():
                row = list(raw)
                for name in names:
                    i = columns.index(name)
                    if row[i] is not None:
                        row[i] = int(Decimal(str(row[i])) * 100)
                connection.execute(
                    "INSERT INTO " + table + "_cents VALUES (" + ",".join("?" for _ in row) + ")",
                    row,
                )
            connection.execute("DROP TABLE " + table)
            connection.execute("ALTER TABLE " + table + "_cents RENAME TO " + table)
        # Historical invoice snapshots did not include per-line depots.
        for id, raw in connection.execute("SELECT id,snapshot FROM documents").fetchall():
            snapshot = json.loads(raw)
            for line in snapshot.get("lines", []):
                line.pop("warehouse_id", None)
                line.pop("warehouse_name", None)
            connection.execute(
                "UPDATE documents SET snapshot=? WHERE id=?", (json.dumps(snapshot), id)
            )
        if version == 1:
            connection.execute("DROP TABLE receipts")
            connection.execute("DROP TABLE payment_offsets")
            connection.execute("ALTER TABLE payments DROP COLUMN direction")
            connection.execute("ALTER TABLE payments DROP COLUMN notes")
            connection.execute("ALTER TABLE settings DROP COLUMN next_receipt")
        connection.execute(f"PRAGMA user_version={version}")


def downgrade_fixture_to_v1(path):
    downgrade_fixture(path, 1)


def test_existing_v1_database_upgrade_preserves_data_and_creates_recovery(local):
    pid = product(local)
    warehouse = local.get("/api/v1/state").json()["warehouses"][0]["id"]
    post(
        local,
        "/stock/adjust",
        {"product_id": pid, "warehouse_id": warehouse, "quantity": "7", "reason": "Existing stock"},
    )
    before = local.get("/api/v1/state").json()
    db.engine.dispose()
    downgrade_fixture_to_v1(db.DB_PATH)
    bootstrap()
    after = local.get("/api/v1/state").json()
    before["products"][0]["supplier_id"] = None
    assert after == before
    with closing(sqlite3.connect(db.DB_PATH)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
    recovery = next(p for p in local_backups.ROOT.glob("inventory-recovery-*.db"))
    with closing(sqlite3.connect(recovery)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
    count = len(list(local_backups.ROOT.glob("inventory-recovery-*.db")))
    bootstrap()
    assert len(list(local_backups.ROOT.glob("inventory-recovery-*.db"))) == count


def test_import_and_restore_v1_backup_upgrades_copy_and_preserves_original(local, tmp_path):
    product(local)
    backup = post(local, "/backups")
    source = tmp_path / "old-backup.db"
    source.write_bytes(local.get("/api/v1/backups/" + backup["name"] + "/export").content)
    downgrade_fixture_to_v1(source)
    content = source.read_bytes()
    imported = local.post("/api/v1/backups/import", content=content).json()
    before = local.get("/api/v1/state").json()
    post(local, "/categories", {"name": "After the old backup"})
    restored = post(local, "/backups/restore", {"backup": imported["name"], "confirmed": True})
    before["products"][0]["supplier_id"] = None
    assert local.get("/api/v1/state").json() == before
    assert (local_backups.ROOT / imported["name"]).read_bytes() == content
    post(local, "/backups/restore", {"backup": restored["recovery"], "confirmed": True})
    assert any(
        c["name"] == "After the old backup" for c in local.get("/api/v1/state").json()["categories"]
    )


def test_v3_upgrade_and_backup_restore_keep_amounts_and_backfill_depots(local, tmp_path):
    category = post(local, "/categories", {"name": "Old catalog"})["id"]
    warehouse = local.get("/api/v1/state").json()["warehouses"][0]["id"]
    pid = post(
        local,
        "/products",
        {
            "name": "Legacy product",
            "category_id": category,
            "stock_mode": "existing",
            "opening_quantity": "10",
            "warehouse_id": warehouse,
            "price": "15.75",
            "purchase_cost": "8.50",
        },
    )["id"]
    customer = post(local, "/parties", {"kind": "customer", "name": "Existing customer"})["id"]
    sale = post(
        local,
        "/documents",
        {
            "kind": "sale",
            "party_id": customer,
            "warehouse_id": warehouse,
            "items": [{"product_id": pid, "quantity": "2", "price": "15.75"}],
            "payment": "10",
        },
    )["id"]
    before = local.get("/api/v1/state").json()
    db.engine.dispose()
    downgrade_fixture(db.DB_PATH, 3)
    with closing(sqlite3.connect(db.DB_PATH)) as connection:
        old_snapshot = json.loads(
            connection.execute("SELECT snapshot FROM documents WHERE id=?", (sale,)).fetchone()[0]
        )
    # Preserve a genuine schema-3 backup before startup performs the migration.
    old_backup = tmp_path / "schema3.db"
    old_backup.write_bytes(db.DB_PATH.read_bytes())
    bootstrap()
    after = local.get("/api/v1/state").json()
    before["documents"][0]["snapshot"] = old_snapshot
    assert after == before
    assert after["documents"][0]["items"][0]["warehouse_id"] == warehouse
    assert (
        after["products"][0]["price"] == "15.75" and after["products"][0]["wholesale_price"] is None
    )
    assert after["stock"][0]["quantity"] == "8.000"
    assert next(p for p in after["parties"] if p["id"] == customer)["balance"] == "21.50"
    assert local.get("/api/v1/invoices/" + sale + "/print").status_code == 200
    recovery = next(local_backups.ROOT.glob("inventory-recovery-*.db"))
    with closing(sqlite3.connect(recovery)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 3
    imported = local.post("/api/v1/backups/import", content=old_backup.read_bytes())
    assert imported.status_code == 200, imported.text
    post(local, "/categories", {"name": "After migration"})
    post(local, "/backups/restore", {"backup": imported.json()["name"], "confirmed": True})
    assert local.get("/api/v1/state").json() == after
    assert (local_backups.ROOT / imported.json()["name"]).read_bytes() == old_backup.read_bytes()
    with closing(sqlite3.connect(db.DB_PATH)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
