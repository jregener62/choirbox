#!/usr/bin/env python3
"""Backup choirbox.db to Dropbox.

Usage (cron):
    0 3 * * * cd /home/choirbox/choirbox && venv/bin/python backup_db.py

Creates a consistent SQLite snapshot (safe with WAL mode),
uploads it to Dropbox under /backups/, and keeps the last 7 backups.
"""

import asyncio
import json
import logging
import os
import sqlite3
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DB_PATH = BASE_DIR / "choirbox.db"
DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET", "")
BACKUP_FOLDER = "/backups"
KEEP_BACKUPS = 7

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [backup] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def get_refresh_token() -> str:
    """Read the Dropbox refresh token from the database."""
    conn = sqlite3.connect(str(DB_PATH))
    try:
        row = conn.execute(
            "SELECT dropbox_refresh_token FROM app_settings WHERE id = 1"
        ).fetchone()
    finally:
        conn.close()

    if not row or not row[0]:
        raise RuntimeError("Kein Dropbox-Refresh-Token in der Datenbank — Dropbox nicht verbunden?")
    return row[0]


def create_db_snapshot() -> Path:
    """Create a consistent SQLite backup using the backup API."""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    tmp_path = Path(tempfile.gettempdir()) / f"choirbox_backup_{timestamp}.db"

    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(tmp_path))
    try:
        src.backup(dst)
        log.info("DB-Snapshot erstellt: %s (%.1f KB)", tmp_path.name, tmp_path.stat().st_size / 1024)
    finally:
        dst.close()
        src.close()

    return tmp_path


async def upload_to_dropbox(file_path: Path, refresh_token: str) -> str:
    """Upload the backup file to Dropbox and return the uploaded path."""
    import httpx

    # Get access token
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": DROPBOX_APP_KEY,
                "client_secret": DROPBOX_APP_SECRET,
            },
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Token-Refresh fehlgeschlagen: {resp.text}")
    access_token = resp.json()["access_token"]

    # Upload
    dropbox_path = f"{BACKUP_FOLDER}/{file_path.name}"
    file_content = file_path.read_bytes()

    api_arg = json.dumps({
        "path": dropbox_path,
        "mode": "overwrite",
        "autorename": False,
        "mute": True,
    })

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://content.dropboxapi.com/2/files/upload",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/octet-stream",
                "Dropbox-API-Arg": api_arg,
            },
            content=file_content,
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Upload fehlgeschlagen: {resp.text}")

    size_mb = len(file_content) / (1024 * 1024)
    log.info("Backup hochgeladen: %s (%.2f MB)", dropbox_path, size_mb)
    return dropbox_path


async def cleanup_old_backups(refresh_token: str):
    """Keep only the last KEEP_BACKUPS backup files in the Dropbox folder."""
    import httpx

    # Get access token
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": DROPBOX_APP_KEY,
                "client_secret": DROPBOX_APP_SECRET,
            },
        )
    if resp.status_code != 200:
        return  # Not critical
    access_token = resp.json()["access_token"]

    # List backup folder
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.dropboxapi.com/2/files/list_folder",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"path": BACKUP_FOLDER},
        )

    if resp.status_code != 200:
        return

    entries = resp.json().get("entries", [])
    db_files = sorted(
        [e for e in entries if e.get("name", "").endswith(".db")],
        key=lambda e: e["name"],
        reverse=True,
    )

    to_delete = db_files[KEEP_BACKUPS:]
    if not to_delete:
        return

    # Delete old backups
    delete_entries = [{"path": e["path_lower"]} for e in to_delete]
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.dropboxapi.com/2/files/delete_batch",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"entries": delete_entries},
        )

    deleted_names = [e["path"].split("/")[-1] for e in delete_entries]
    log.info("Alte Backups geloescht: %s", ", ".join(deleted_names))


async def main():
    if not DB_PATH.exists():
        log.error("Datenbank nicht gefunden: %s", DB_PATH)
        sys.exit(1)

    if not DROPBOX_APP_KEY or not DROPBOX_APP_SECRET:
        log.error("DROPBOX_APP_KEY / DROPBOX_APP_SECRET nicht in .env gesetzt")
        sys.exit(1)

    refresh_token = get_refresh_token()
    snapshot_path = create_db_snapshot()

    try:
        await upload_to_dropbox(snapshot_path, refresh_token)
        await cleanup_old_backups(refresh_token)
        log.info("Backup abgeschlossen")
    finally:
        snapshot_path.unlink(missing_ok=True)


if __name__ == "__main__":
    asyncio.run(main())
