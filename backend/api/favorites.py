"""Favorites API — per-user track favorites."""

import os
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.favorite import Favorite
from backend.api.auth import require_user
from backend.schemas import ActionResponse
from backend.services import path_resolver
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/favorites", tags=["favorites"])


def _set_favorite_anchors(fav: Favorite, target: path_resolver.ResolvedTarget) -> None:
    """Setzt die stabilen Anker (song_id/document_id/audio_file_id) und entry_type
    auf einem Favorite-Row aus dem Resolver-Ergebnis."""
    fav.entry_type = target.entry_type
    fav.song_id = target.song_id
    fav.document_id = target.document_id
    fav.audio_file_id = target.dropbox_file_id if target.entry_type == "audio" else None


async def _resolve_or_legacy(rel_path: str, hint: str, user: User, session: Session) -> path_resolver.ResolvedTarget:
    """Versucht den Pfad ueber den Resolver aufzuloesen. Faellt bei fehlender
    Dropbox-Verbindung auf den Legacy-Hint zurueck (kein Anker, nur Pfad-Cache)."""
    dbx = get_dropbox_service(session)
    if not dbx:
        return path_resolver.ResolvedTarget(entry_type=hint or "file", dropbox_file_id=None)
    return await path_resolver.resolve(rel_path, hint, user, session, dbx)


@router.get("")
def list_favorites(user: User = Depends(require_user), session: Session = Depends(get_session)):
    favorites = session.exec(
        select(Favorite).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())
    ).all()

    # Attach parsed file metadata
    from backend.services.audio_meta_service import get_meta_for_paths
    file_paths = [f.dropbox_path for f in favorites if (f.entry_type or "file") not in ("folder", "song")]
    metas = get_meta_for_paths(session, file_paths)

    return [
        {
            "id": f.id,
            "dropbox_path": f.dropbox_path,
            "file_name": f.file_name,
            "entry_type": f.entry_type or "file",
            "created_at": f.created_at.isoformat(),
            **({"voice_keys": m.voice_keys, "section_keys": m.section_keys, "song_name": m.song_name, "free_text": m.free_text}
               if (m := metas.get(f.dropbox_path)) else {}),
        }
        for f in favorites
    ]


@router.post("")
async def add_favorite(data: dict, user: User = Depends(require_user), session: Session = Depends(get_session)):
    dropbox_path = data.get("dropbox_path", "").strip()
    if not dropbox_path:
        raise HTTPException(400, "dropbox_path is required")

    # Check if already favorited
    existing = session.exec(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.dropbox_path == dropbox_path,
        )
    ).first()
    if existing:
        return ActionResponse.success(data={"id": existing.id, "already_exists": True})

    entry_type_hint = data.get("entry_type", "file")
    file_name = os.path.basename(dropbox_path)
    target = await _resolve_or_legacy(dropbox_path, entry_type_hint, user, session)

    favorite = Favorite(
        user_id=user.id,
        dropbox_path=dropbox_path,
        file_name=file_name,
        entry_type=target.entry_type,
    )
    _set_favorite_anchors(favorite, target)
    session.add(favorite)
    session.commit()
    session.refresh(favorite)
    return ActionResponse.success(data={"id": favorite.id})


@router.delete("/{favorite_id}")
def remove_favorite(
    favorite_id: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    favorite = session.get(Favorite, favorite_id)
    if not favorite or favorite.user_id != user.id:
        raise HTTPException(404, "Favorite not found")
    session.delete(favorite)
    session.commit()
    return ActionResponse.success()


@router.post("/toggle")
async def toggle_favorite(data: dict, user: User = Depends(require_user), session: Session = Depends(get_session)):
    """Toggle favorite: add if not exists, remove if exists. Returns new state."""
    dropbox_path = data.get("dropbox_path", "").strip()
    if not dropbox_path:
        raise HTTPException(400, "dropbox_path is required")

    existing = session.exec(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.dropbox_path == dropbox_path,
        )
    ).first()

    if existing:
        session.delete(existing)
        session.commit()
        return ActionResponse.success(data={"is_favorite": False})
    else:
        entry_type_hint = data.get("entry_type", "file")
        file_name = os.path.basename(dropbox_path)
        target = await _resolve_or_legacy(dropbox_path, entry_type_hint, user, session)

        favorite = Favorite(
            user_id=user.id,
            dropbox_path=dropbox_path,
            file_name=file_name,
            entry_type=target.entry_type,
        )
        _set_favorite_anchors(favorite, target)
        session.add(favorite)
        session.commit()
        session.refresh(favorite)
        return ActionResponse.success(data={"is_favorite": True, "id": favorite.id})
