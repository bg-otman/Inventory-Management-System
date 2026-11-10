"""Exercise the real local service's owner-pipe shutdown and data persistence."""

import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
import pytest

BACKEND = Path(__file__).resolve().parents[1] / "backend"


@pytest.mark.parametrize("stop_mode", ["command", "owner_disconnected"])
def test_local_service_stops_and_reopens_with_saved_data(tmp_path, stop_mode):
    token = "lifecycle-test-" + uuid.uuid4().hex
    env = {
        **os.environ,
        "INVENTORY_DATA_DIR": str(tmp_path / "data"),
        "INVENTORY_LOCAL_TOKEN": token,
    }

    def request(base, path, data=None):
        headers = {"X-Inventory-Local": token}
        if data is not None:
            headers.update(
                {"Content-Type": "application/json", "Idempotency-Key": str(uuid.uuid4())}
            )
        req = urllib.request.Request(
            base + path, data=None if data is None else json.dumps(data).encode(), headers=headers
        )
        with urllib.request.urlopen(req, timeout=3) as r:
            return json.load(r)

    def start(log):
        p = subprocess.Popen(
            [sys.executable, "-u", "-B", str(BACKEND / "desktop_server.py")],
            cwd=BACKEND,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=log,
            text=True,
        )
        lines = queue.Queue()
        threading.Thread(target=lambda: lines.put(p.stdout.readline()), daemon=True).start()
        try:
            base = "http://127.0.0.1:" + str(json.loads(lines.get(timeout=15))["port"]) + "/api/v1"
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                try:
                    if request(base, "/health") == {"status": "ok"}:
                        return p, base
                except OSError:
                    time.sleep(0.05)
            raise AssertionError("Service did not become ready")
        except BaseException:
            p.kill()
            p.wait(timeout=5)
            raise

    with (tmp_path / "service.log").open("w+") as log:
        p, base = start(log)
        try:
            category = request(base, "/categories", {"name": "Données conservées"})["id"]
            warehouse = request(base, "/state")["warehouses"][0]["id"]
            supplier = request(base, "/parties", {"kind": "supplier", "name": "Fournisseur"})["id"]
            customer = request(base, "/parties", {"kind": "customer", "name": "Client"})["id"]
            product = request(
                base,
                "/products",
                {
                    "name": "Câble",
                    "category_id": category,
                    "supplier_id": supplier,
                    "unit": "meter",
                    "opening_quantity": "10.500",
                    "warehouse_id": warehouse,
                    "purchase_cost": "7.25",
                    "price": "11.00",
                    "payment": "20.00",
                },
            )["id"]
            request(
                base,
                "/documents",
                {
                    "kind": "sale",
                    "party_id": customer,
                    "warehouse_id": warehouse,
                    "items": [{"product_id": product, "quantity": "2.500", "price": "11.00"}],
                    "confirm": True,
                    "fulfill": True,
                    "payment": "10",
                },
            )
            request(
                base,
                "/payments",
                {
                    "party_id": customer,
                    "amount": "5",
                    "direction": "received",
                    "paid_at": "2026-10-18",
                    "auto_allocate": True,
                },
            )
            before = request(base, "/state")
            assert before["stock"][0]["quantity"] == "8.000"
            assert next(p for p in before["parties"] if p["id"] == customer)["balance"] == "12.50"
            # EOF is what the service sees when its owning launcher vanishes.
            p.communicate(input="shutdown\n" if stop_mode == "command" else "", timeout=10)
            assert p.returncode == 0
            wal = tmp_path / "data" / "inventory.db-wal"
            assert not wal.exists() or wal.stat().st_size == 0
        finally:
            if p.poll() is None:
                p.kill()
                p.wait(timeout=5)
        p, base = start(log)
        try:
            assert request(base, "/state") == before
            assert any(c["id"] == category for c in request(base, "/state")["categories"])
            p.communicate(input="shutdown\n", timeout=10)
            assert p.returncode == 0
        finally:
            if p.poll() is None:
                p.kill()
                p.wait(timeout=5)
        log.seek(0)
        assert "Traceback" not in log.read()
