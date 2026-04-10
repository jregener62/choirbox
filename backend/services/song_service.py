"""Song service — pflegt die songs-Tabelle als stabilen Anker fuer .song-Ordner.

Die Idee: Statt im Datenmodell ueberall folder_path als String zu fuehren,
zeigen Sections, Documents (und spaeter Favorites etc.) per song_id auf einen
songs-Row. Der songs-Row haelt die stabile Dropbox-File-ID des Ordners. Beim
Sync wird der folder_path im Row aktualisiert, sobald Dropbox einen Ordner
unter neuem Namen meldet — der Rest des Datenmodells bleibt davon unberuehrt.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from backend.models.song import Song


def _name_from_path(folder_path: str) -> str:
    """Extrahiert den Anzeigenamen ('Fragile') aus dem Ordnerpfad ('Fragile.song')."""
    last = folder_path.rstrip("/").rsplit("/", 1)[-1]
    if last.endswith(".song"):
        return last[: -len(".song")]
    return last


def upsert_song(
    session: Session,
    folder_path: str,
    dropbox_file_id: Optional[str],
) -> Song:
    """Legt einen Song-Row an oder findet einen vorhandenen.

    Match-Reihenfolge:
    1. ueber dropbox_file_id (stabil), falls vorhanden — absorbiert Renames.
    2. ueber folder_path (Fallback fuer Backfill, bevor IDs vorhanden sind).

    Wenn ein Treffer per file_id gefunden wird, aber folder_path/Name veraltet
    sind, werden sie aktualisiert. Wenn kein Treffer existiert, wird ein neuer
    Row mit status='active' angelegt.
    """
    song: Optional[Song] = None
    if dropbox_file_id:
        song = session.exec(
            select(Song).where(Song.dropbox_file_id == dropbox_file_id)
        ).first()
    if not song:
        song = session.exec(
            select(Song).where(Song.folder_path == folder_path)
        ).first()
        # Wenn der per Pfad gefundene Row schon eine andere file_id hat,
        # ist es nicht derselbe Ordner — neuen Row anlegen.
        if song and dropbox_file_id and song.dropbox_file_id and song.dropbox_file_id != dropbox_file_id:
            song = None

    name = _name_from_path(folder_path)
    if song:
        changed = False
        if dropbox_file_id and not song.dropbox_file_id:
            song.dropbox_file_id = dropbox_file_id
            changed = True
        if song.folder_path != folder_path:
            song.folder_path = folder_path
            changed = True
        if song.name != name:
            song.name = name
            changed = True
        if song.status != "active":
            song.status = "active"
            changed = True
        if changed:
            song.updated_at = datetime.utcnow()
            session.add(song)
            session.commit()
            session.refresh(song)
        return song

    song = Song(
        folder_path=folder_path,
        name=name,
        dropbox_file_id=dropbox_file_id,
        status="active",
    )
    session.add(song)
    session.commit()
    session.refresh(song)
    return song


def mark_orphan(session: Session, song: Song) -> None:
    """Markiert einen Song-Row als verwaist (Dropbox-Ordner nicht mehr da)."""
    if song.status != "orphan":
        song.status = "orphan"
        song.updated_at = datetime.utcnow()
        session.add(song)
        session.commit()


def get_song_by_folder_path(session: Session, folder_path: str) -> Optional[Song]:
    return session.exec(
        select(Song).where(Song.folder_path == folder_path)
    ).first()


def get_song_by_file_id(session: Session, dropbox_file_id: str) -> Optional[Song]:
    return session.exec(
        select(Song).where(Song.dropbox_file_id == dropbox_file_id)
    ).first()
