"""Remove leftover executable-edit temporary files from a Windows ZIP."""

from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import os


def finalize(path):
    path = Path(path)
    temporary = path.with_suffix(".clean.zip")
    with ZipFile(path) as archive:
        unwanted = {
            item.filename
            for item in archive.infolist()
            if PurePosixPath(item.filename).parent == PurePosixPath(".")
            and PurePosixPath(item.filename).name.startswith(".Inventory.exe.")
        }
        if not unwanted:
            return
        try:
            with ZipFile(temporary, "w") as output:
                for item in archive.infolist():
                    if item.filename not in unwanted:
                        output.writestr(item, archive.read(item), compresslevel=6)
            with ZipFile(temporary) as output:
                if output.testzip() is not None:
                    raise RuntimeError("The finalized Windows archive is invalid.")
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    os.replace(temporary, path)
    print(f"Finalized {path.name}: removed {len(unwanted)} executable-edit temporary file(s).")


if __name__ == "__main__":
    finalize(Path(__file__).resolve().parents[1] / "dist/Inventory-Windows-x64.zip")
