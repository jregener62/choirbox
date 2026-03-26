"""Favorites API — per-user track favorites."""

import os
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.favorite import Favorite
from backend.api.auth import require_user
from backend.schemas import ActionResponse

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("")
def list_favorites(user: User = Depends(require_user), session: Session = Depends(get_session)):
    favorites = session.exec(
        select(Favorite).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())
    ).all()
    return [
        {
            "id": f.id,
            "dropbox_path": f.dropbox_path,
            "file_name": f.file_name,
            "created_at": f.created_at.isoformat(),
        }
        for f in favorites
    ]


@router.post("")
def add_favorite(data: dict, user: User = Depends(require_user), session: Session = Depends(get_session)):
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

    file_name = os.path.basename(dropbox_path)
    favorite = Favorite(user_id=user.id, dropbox_path=dropbox_path, file_name=file_name)
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
