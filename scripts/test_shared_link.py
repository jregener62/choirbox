"""Einmal-Test: persistenten read-only Dropbox-Shared-Link erzeugen.

Validiert die Kern-Annahme des serverlosen Konzepts: Der Chorleiter
(mit Token) erzeugt einen Shared-Link, den Mitglieder OHNE Token lesen.
Dieses Skript erzeugt nur den Link; der token-lose Abruf wird per curl getestet.
"""
import asyncio
import sqlite3
import sys

sys.path.insert(0, ".")
from backend.services.dropbox_service import DropboxService


async def main():
    from backend.utils.crypto import decrypt, is_encrypted
    con = sqlite3.connect("choirbox.db")
    rt = con.execute("select dropbox_refresh_token from app_settings limit 1").fetchone()[0]
    if is_encrypted(rt):
        rt = decrypt(rt)
    dbx = DropboxService(rt)

    # Eine Datei (und einen Ordner) in der Chor-Dropbox finden
    res = await dbx.api_call("files/list_folder", {"path": "", "recursive": True, "limit": 200})
    files = [e for e in res["entries"] if e[".tag"] == "file"]
    folders = [e for e in res["entries"] if e[".tag"] == "folder"]
    if not files:
        print("KEINE Dateien in der Dropbox gefunden"); return
    # bevorzugt eine kleine Datei
    files.sort(key=lambda e: e.get("size", 0))
    f = files[0]
    print(f"FILE: {f['path_display']}  ({f.get('size')} bytes)")
    print(f"CONTENT_HASH: {f.get('content_hash')}")

    # Persistenter Shared-Link (braucht sharing.write) — versuchen, sonst skippen
    try:
        r = await dbx.api_call("sharing/create_shared_link_with_settings", {
            "path": f["path_lower"],
            "settings": {"access": "viewer", "allow_download": True},
        })
        print("SHARED_LINK:", r["url"])
    except RuntimeError as e:
        if "shared_link_already_exists" in str(e):
            r = await dbx.api_call("sharing/list_shared_links", {"path": f["path_lower"], "direct_only": True})
            print("SHARED_LINK:", r["links"][0]["url"] if r.get("links") else "(existiert)")
        else:
            print("SHARED_LINK: SKIP (", str(e)[:80], "...)")

    # Temporary Link (braucht nur files.content.read) — beweist token-loses Lesen
    tmp = await dbx.get_temporary_link(f["path_lower"])
    print("TEMP_LINK:", tmp)

    # zusaetzlich eine MP3, falls vorhanden (realistischer fuer Range/Streaming)
    mp3 = next((e for e in files if e["path_lower"].endswith(".mp3")), None)
    if mp3:
        print(f"\nMP3: {mp3['path_display']}  ({mp3.get('size')} bytes)")
        print("MP3_TEMP_LINK:", await dbx.get_temporary_link(mp3["path_lower"]))


asyncio.run(main())
