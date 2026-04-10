"""User-Daten-Backfill: Loest pfad-basierte Anker auf stabile Dropbox-IDs auf.

Fuer jeden Favorite, Note, UserLabel und UserSelectedDocument, der noch keine
ID-Spalte gesetzt hat, wird per dropbox_service.get_metadata die aktuelle
Dropbox-File-ID ermittelt und in die richtige Spalte eingetragen.

Rows, deren dropbox_path in Dropbox nicht (mehr) existiert, bleiben unveraendert
stehen — sie sind die Phase-4-"legacy orphans" und werden ueber die kommende
Admin-UI manuell aufgeraeumt.

Aufruf:
    python -m scripts.user_data_backfill              # echtes Schreiben
    python -m scripts.user_data_backfill --dry-run    # nur zaehlen

Braucht eine aktive Dropbox-Verbindung pro Chor.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from backend.database import engine  # noqa: E402
from backend.models.choir import Choir  # noqa: E402
from backend.models.document import Document  # noqa: E402
from backend.models.favorite import Favorite  # noqa: E402
from backend.models.note import Note  # noqa: E402
from backend.models.song import Song  # noqa: E402
from backend.models.user import User  # noqa: E402
from backend.models.user_label import UserLabel  # noqa: E402
from backend.models.user_selected_document import UserSelectedDocument  # noqa: E402
from backend.services import path_resolver  # noqa: E402
from backend.services.dropbox_service import get_dropbox_service  # noqa: E402


async def backfill_choir(session: Session, choir: Choir, dry_run: bool) -> dict:
    """Backfillt User-Daten fuer einen Chor. Gibt Stats zurueck."""
    # Wir brauchen einen User dieses Chors, um den path_resolver mit dem
    # richtigen choir_root nutzen zu koennen.
    user = session.exec(
        select(User).where(User.choir_id == choir.id)
    ).first()
    if not user:
        return {"choir": choir.name, "skipped": "kein User"}

    dbx = get_dropbox_service(session)
    if not dbx:
        return {"choir": choir.name, "skipped": "keine Dropbox-Verbindung"}

    stats = {
        "favorites_filled": 0,
        "favorites_orphan": 0,
        "notes_filled": 0,
        "notes_orphan": 0,
        "user_labels_filled": 0,
        "user_labels_orphan": 0,
        "user_selected_filled": 0,
    }

    # --- Favorites ---
    user_ids = [u.id for u in session.exec(
        select(User).where(User.choir_id == choir.id)
    ).all()]
    if not user_ids:
        return {"choir": choir.name, "skipped": "keine User"}

    for fav in session.exec(
        select(Favorite).where(Favorite.user_id.in_(user_ids))
    ).all():
        # Skip wenn schon einer der Anker gesetzt ist
        if fav.audio_file_id or fav.document_id is not None or fav.song_id is not None:
            continue
        target = await path_resolver.resolve(
            fav.dropbox_path, fav.entry_type or "file", user, session, dbx,
        )
        if not target.dropbox_file_id:
            stats["favorites_orphan"] += 1
            continue
        if not dry_run:
            fav.entry_type = target.entry_type
            fav.song_id = target.song_id
            fav.document_id = target.document_id
            fav.audio_file_id = (
                target.dropbox_file_id if target.entry_type == "audio" else None
            )
            session.add(fav)
        stats["favorites_filled"] += 1

    # --- Notes ---
    for n in session.exec(
        select(Note).where(Note.user_id.in_(user_ids))
    ).all():
        if n.target_file_id:
            continue
        target = await path_resolver.resolve(n.dropbox_path, "file", user, session, dbx)
        if not target.dropbox_file_id:
            stats["notes_orphan"] += 1
            continue
        if not dry_run:
            n.target_file_id = target.dropbox_file_id
            session.add(n)
        stats["notes_filled"] += 1

    # --- UserLabels ---
    for u in session.exec(
        select(UserLabel).where(UserLabel.user_id.in_(user_ids))
    ).all():
        if u.target_file_id:
            continue
        target = await path_resolver.resolve(u.dropbox_path, "file", user, session, dbx)
        if not target.dropbox_file_id:
            stats["user_labels_orphan"] += 1
            continue
        if not dry_run:
            u.target_file_id = target.dropbox_file_id
            session.add(u)
        stats["user_labels_filled"] += 1

    # --- UserSelectedDocument: song_id aus folder_path/Song-Tabelle ableiten ---
    for sel in session.exec(
        select(UserSelectedDocument).where(UserSelectedDocument.user_id.in_(user_ids))
    ).all():
        if sel.song_id is not None:
            continue
        # Erst aus dem zugehoerigen document.song_id, dann ueber Pfad
        doc = session.get(Document, sel.document_id) if sel.document_id else None
        song_id = doc.song_id if doc else None
        if not song_id:
            song = session.exec(
                select(Song).where(Song.folder_path == sel.folder_path)
            ).first()
            if song:
                song_id = song.id
        if song_id:
            if not dry_run:
                sel.song_id = song_id
                session.add(sel)
            stats["user_selected_filled"] += 1

    if dry_run:
        session.rollback()
    else:
        session.commit()

    return {"choir": choir.name, **stats}


async def main_async(dry_run: bool) -> int:
    with Session(engine) as session:
        choirs = session.exec(select(Choir)).all()
        if not choirs:
            print("Keine Choere — nichts zu tun.")
            return 0
        for choir in choirs:
            result = await backfill_choir(session, choir, dry_run)
            print(result)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill User-Daten mit Dropbox-IDs")
    parser.add_argument("--dry-run", action="store_true", help="nur zaehlen, nichts schreiben")
    args = parser.parse_args()
    return asyncio.run(main_async(args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
