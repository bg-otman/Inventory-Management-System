from sqlalchemy import select
from .db import Base, engine, SessionLocal, DB_LOCK, DB_PATH
from .models import Setting, Warehouse
from .local_migrations import SCHEMA_VERSION, SUPPORTED_VERSIONS, upgrade_database


def bootstrap():
    with engine.connect() as db:
        version = db.exec_driver_sql("PRAGMA user_version").scalar()
        if version not in (0, *SUPPORTED_VERSIONS):
            raise RuntimeError(
                "This data was created by a different Inventory version. Keep the data and use a matching application version."
            )
    if version in SUPPORTED_VERSIONS and version < SCHEMA_VERSION:
        from .local_backups import snapshot_locked

        with DB_LOCK:
            snapshot_locked(recovery=True)
            engine.dispose()
            upgrade_database(DB_PATH)
    Base.metadata.create_all(engine)
    with engine.begin() as db:
        db.exec_driver_sql(f"PRAGMA user_version={SCHEMA_VERSION}")
    with SessionLocal.begin() as db:
        if not db.get(Setting, 1):
            db.add(
                Setting(
                    id=1, data={"company_name": "Inventory", "phone": "", "address": "", "logo": ""}
                )
            )
        if not db.scalar(select(Warehouse.id).limit(1)):
            db.add(Warehouse(name="Entrepôt principal"))
