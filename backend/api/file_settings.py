"""File Settings API — per-file metadata like section reference."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from backend.database import get_session
from backend.models.user import User
from backend.models.file_settings import FileSettings
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse

router = APIRouter(prefix="/file-settings", tags=["file-settings"])


@router.get("")
def get_file_settings(
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    settings = session.get(FileSettings, path)
    if not settings:
        return {"dropbox_path": path, "section_ref_path": None}
    return {
        "dropbox_path": settings.dropbox_path,
        "section_ref_path": settings.section_ref_path,
    }


@router.put("")
def save_file_settings(
    data: dict,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    dropbox_path = (data.get("dropbox_path") or "").strip()
    if not dropbox_path:
        raise HTTPException(400, "dropbox_path is required")

    section_ref_path = (data.get("section_ref_path") or "").strip() or None

    # Prevent self-reference
    if section_ref_path == dropbox_path:
        section_ref_path = None

    settings = session.get(FileSettings, dropbox_path)
    now = datetime.utcnow()

    if settings:
        settings.section_ref_path = section_ref_path
        settings.updated_at = now
    else:
        settings = FileSettings(
            dropbox_path=dropbox_path,
            section_ref_path=section_ref_path,
            created_at=now,
            updated_at=now,
        )

    session.add(settings)
    session.commit()
    return ActionResponse.success()
