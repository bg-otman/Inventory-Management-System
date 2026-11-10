import os
import threading
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATA_DIR = Path(os.environ.get("INVENTORY_DATA_DIR", Path.home() / ".inventory-desktop")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "inventory.db"
# A plain lock may be entered/exited on different FastAPI worker threads.
DB_LOCK = threading.Lock()
engine = create_engine(
    "sqlite:///" + DB_PATH.as_posix(),
    pool_pre_ping=True,
    connect_args={"check_same_thread": False, "timeout": 15},
)


@event.listens_for(engine, "connect")
def sqlite_settings(conn, _):
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("PRAGMA busy_timeout=15000")


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with DB_LOCK:
        with SessionLocal() as db:
            try:
                yield db
            except Exception:
                db.rollback()
                raise
