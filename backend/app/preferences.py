import json
from .db import DATA_DIR, DB_LOCK


def normalize_language(language):
    # Legacy English preferences and documents display in French. Never change
    # historical transaction snapshots just to translate their presentation.
    return "fr"


def read():
    try:
        data = json.loads((DATA_DIR / "preferences.json").read_text(encoding="utf-8"))
        return {
            "language": normalize_language(data.get("language") if isinstance(data, dict) else None)
        }
    except (OSError, ValueError):
        return {"language": "fr"}


def write_language(language):
    with DB_LOCK:
        temp = DATA_DIR / "preferences.tmp"
        temp.write_text(json.dumps({"language": language}), encoding="utf-8")
        temp.replace(DATA_DIR / "preferences.json")
