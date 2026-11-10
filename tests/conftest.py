import os, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
_test_data = tempfile.TemporaryDirectory(prefix="inventory-test-")
os.environ["INVENTORY_DATA_DIR"] = _test_data.name
os.environ["INVENTORY_LOCAL_TOKEN"] = "test-local-token-" + "x" * 48
