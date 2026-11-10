"""Started and stopped by the desktop launcher; never binds to a LAN address."""

import json
import os
import socket
import sqlite3
import sys
import threading
from contextlib import closing
import uvicorn

if __name__ == "__main__":
    if len(os.environ.get("INVENTORY_LOCAL_TOKEN", "")) < 32:
        raise SystemExit("Launch Inventory from Inventory.exe.")
    from app.local_bootstrap import bootstrap

    bootstrap()
    from app.main import app
    from app.local_backups import scheduler

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False))

    def commands():
        try:
            for line in sys.stdin:
                if line.strip() == "shutdown":
                    break
        finally:
            # EOF means the owning desktop process is gone. Do not leave a
            # headless service holding the data files after a launcher crash.
            server.should_exit = True

    threading.Thread(target=commands, daemon=True).start()
    threading.Thread(target=scheduler, daemon=True).start()
    print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
    try:
        server.run(sockets=[listener])
    finally:
        listener.close()
        from app.db import DB_LOCK, DB_PATH, engine

        with DB_LOCK:
            try:
                # Flush committed WAL pages before the launcher exits. Keep
                # journal files intact if another reader prevents checkpointing.
                with closing(sqlite3.connect(DB_PATH, timeout=2)) as db:
                    busy, _, _ = db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
                    if busy:
                        print(
                            "Shutdown checkpoint busy; committed data retained in WAL.",
                            file=sys.stderr,
                            flush=True,
                        )
            except sqlite3.Error as error:
                print(f"Shutdown checkpoint: {error}", file=sys.stderr, flush=True)
            finally:
                engine.dispose()
