"""Run on the deployment host. Generates secrets without storing them in source control."""
from pathlib import Path
import secrets,os
p=Path(".env")
if p.exists():raise SystemExit(".env exists; leaving it unchanged.")
password=secrets.token_urlsafe(20)
contents=f"""POSTGRES_PASSWORD={secrets.token_hex(24)}
APP_DB_PASSWORD={secrets.token_hex(24)}
OWNER_USERNAME=owner
OWNER_NAME=Owner
OWNER_PASSWORD={password}
COOKIE_SECURE=true
BACKUP_HOST_DIR=./backups
"""
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,"w") as f:f.write(contents)
print("Created .env. Store the owner password safely:",password)
print("Configure HTTPS and a private backup-storage mount before launch.")
