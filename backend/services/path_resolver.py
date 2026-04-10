"""Path-Resolver — uebersetzt einen choir-relativen Dropbox-Pfad in stabile Anker.

Der Resolver ist die zentrale Stelle fuer Phase-4-Schreibungen: jede neue
Favorite, Note oder UserLabel wird beim Anlegen mit der dazugehoerigen
stabilen ID versehen, statt nur den Pfad zu speichern. Pfad bleibt im
gleichen Row nur als Anzeige-Cache stehen.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlmodel import Session, select

from backend.models.choir import Choir
from backend.models.document import Document
from backend.models.song import Song
from backend.models.user import User
from backend.services import song_service
from backend.services.dropbox_service import DropboxService
from backend.services.folder_types import is_song_folder


@dataclass
class ResolvedTarget:
    """Zeigt auf einen stabilen Anker fuer einen Dropbox-Eintrag."""
    entry_type: str  # 'song' | 'document' | 'audio' | 'folder' (legacy)
    dropbox_file_id: Optional[str]
    song_id: Optional[int] = None
    document_id: Optional[int] = None


def _choir_root(user: User, session: Session) -> str:
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            return (choir.dropbox_root_folder or "").strip("/")
    return ""


def _full_path(rel_path: str, user: User, session: Session) -> str:
    root = _choir_root(user, session)
    parts = [p for p in [root, rel_path.strip("/")] if p]
    return "/" + "/".join(parts)


async def resolve(
    rel_path: str,
    entry_type_hint: Optional[str],
    user: User,
    session: Session,
    dbx: DropboxService,
) -> ResolvedTarget:
    """Aufloesen eines choir-relativen Pfads in einen stabilen Anker.

    `entry_type_hint` ist das vom Frontend gesendete entry_type ('file'/'folder'/
    'song'/'document'/'audio') und wird als Tie-Breaker benutzt, wenn die
    Dropbox-Antwort mehrdeutig ist.
    """
    full = _full_path(rel_path, user, session)
    meta = await dbx.get_metadata(full)
    if not meta:
        # Pfad existiert (mehr) nicht in Dropbox — wir koennen keinen Anker
        # auf eine ID setzen, schreiben aber trotzdem den Row mit Pfad-Cache.
        # Das ist die Legacy-Variante; Phase 4 toleriert das.
        return ResolvedTarget(
            entry_type=entry_type_hint or "file",
            dropbox_file_id=None,
        )

    file_id = meta.get("id")
    tag = meta.get(".tag", "")
    name = meta.get("name", "")

    if tag == "folder":
        if is_song_folder(name):
            song = song_service.upsert_song(session, rel_path, file_id)
            return ResolvedTarget(
                entry_type="song",
                dropbox_file_id=file_id,
                song_id=song.id,
            )
        # Anderer Container (z.B. Audio-Sammelordner). Wir haben keinen Anker
        # in der DB dafuer; behandeln als Legacy-Folder.
        return ResolvedTarget(entry_type="folder", dropbox_file_id=file_id)

    # tag == 'file'
    if file_id:
        doc = session.exec(
            select(Document).where(Document.dropbox_file_id == file_id)
        ).first()
        if doc:
            return ResolvedTarget(
                entry_type="document",
                dropbox_file_id=file_id,
                document_id=doc.id,
                song_id=doc.song_id,
            )
    return ResolvedTarget(
        entry_type="audio",
        dropbox_file_id=file_id,
    )
