"""Exercise the actual upgrade against an existing v1 dataset."""
from datetime import datetime
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, MetaData, select, inspect

def test_upgrade_preserves_existing_records_and_links_known_supplier(tmp_path,monkeypatch):
    url="sqlite:///"+str(tmp_path/"upgrade.db")
    monkeypatch.setenv("DATABASE_URL",url)
    root=Path(__file__).resolve().parents[1]
    config=Config(str(root/"alembic.ini"));config.set_main_option("script_location",str(root/"alembic"))
    command.upgrade(config,"0001")
    engine=create_engine(url);meta=MetaData();meta.reflect(engine);t=meta.tables
    now=datetime(2026,10,15)
    original_snapshot={"total":"120.00","tax":"20.00","company":{"company_name":"Existing business"}}
    with engine.begin() as db:
        db.execute(t["categories"].insert(),{"id":"cat","name":"Food","normalized":"food"})
        db.execute(t["parties"].insert(),{"id":"supplier","kind":"supplier","name":"Supplier","phone":"0600","address":"Rabat","notes":"","created_at":now})
        db.execute(t["warehouses"].insert(),{"id":"warehouse","name":"Main"})
        for pid in ("known","unknown"):
            db.execute(t["products"].insert(),{"id":pid,"name":pid,"category_id":"cat","description":"","unit":"kg","price":"80","threshold":0,"active":True,"created_at":now})
        db.execute(t["stock"].insert(),{"product_id":"known","warehouse_id":"warehouse","quantity":2})
        db.execute(t["settings"].insert(),{"id":1,"data":{"company_name":"Existing business","default_tax":"20","tax_id":"old"},"next_invoice":8,"next_purchase":3})
        db.execute(t["documents"].insert(),{"id":"purchase","kind":"purchase","party_id":"supplier","warehouse_id":"warehouse","number":"PUR-000002","status":"confirmed","fulfilled":True,"subtotal":100,"discount":0,"tax_rate":20,"tax":20,"total":120,"language":"en","reference":"","snapshot":original_snapshot,"created_at":now,"issued_at":now,"actor":"owner"})
        db.execute(t["document_lines"].insert(),{"id":"line","document_id":"purchase","product_id":"known","name":"known","unit":"kg","quantity":2,"price":50})
    command.upgrade(config,"head")
    meta=MetaData();meta.reflect(engine);t=meta.tables
    with engine.connect() as db:
        products={r["id"]:r for r in db.execute(select(t["products"])).mappings()}
        assert len(products)==2 and products["known"]["supplier_id"]=="supplier"
        assert products["unknown"]["supplier_id"] is None
        assert products["known"]["purchase_cost"] is None
        assert db.scalar(select(t["stock"].c.quantity))==2
        document=db.execute(select(t["documents"])).mappings().one()
        assert document["total"]==120 and document["snapshot"]==original_snapshot
        settings=db.execute(select(t["settings"])).mappings().one()
        assert settings["data"]=={"company_name":"Existing business"}
        assert settings["next_invoice"]==8 and settings["next_purchase"]==3
        assert db.scalar(select(t["alembic_version"].c.version_num))=="0003"
    assert any(f["constrained_columns"]==["supplier_id"] for f in inspect(engine).get_foreign_keys("products"))
    checks={c["sqltext"] for c in inspect(engine).get_check_constraints("products")}
    assert {"threshold >= 0","price IS NULL OR price >= 0","purchase_cost IS NULL OR purchase_cost >= 0"}<=checks
    engine.dispose()
