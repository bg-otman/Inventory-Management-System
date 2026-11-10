"""Bundle CPython and Windows wheels; no Python installation is needed by users."""

from pathlib import Path
import hashlib
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
VERSION = "3.13.13"
EXPECTED = "8766a8775746235e23cf5aee5027ab1060bb981d93110577adcf3508aa0cbd55"
BUILD.mkdir(exist_ok=True)
archive = BUILD / f"python-{VERSION}-embed-amd64.zip"
if not archive.exists():
    urllib.request.urlretrieve(
        f"https://www.python.org/ftp/python/{VERSION}/python-{VERSION}-embed-amd64.zip", archive
    )
if hashlib.sha256(archive.read_bytes()).hexdigest() != EXPECTED:
    raise SystemExit("Python archive checksum differs from the tested release.")
runtime = BUILD / "python"
runtime.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as z:
    if z.testzip():
        raise SystemExit("Damaged Python archive.")
    z.extractall(runtime)
(runtime / "python313._pth").write_text(
    "python313.zip\n.\nLib/site-packages\n../backend\nimport site\n"
)
subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--only-binary=:all:",
        "--platform",
        "win_amd64",
        "--python-version",
        "3.13",
        "--implementation",
        "cp",
        "--target",
        str(runtime / "Lib/site-packages"),
        "-r",
        str(ROOT / "backend/requirements-desktop.lock.txt"),
    ],
    check=True,
)
print("Windows runtime prepared.")
