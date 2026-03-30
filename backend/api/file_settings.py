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
        return {"dropbox_path": path, "section_ref_path": None, "pdf_ref_path": None}
    return {
        "dropbox_path": settings.dropbox_path,
        "section_ref_path": settings.section_ref_path,
        "pdf_ref_path": settings.pdf_ref_path,
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
    pdf_ref_path = (data.get("pdf_ref_path") or "").strip() or None

    # Prevent self-reference
    if section_ref_path == dropbox_path:
        section_ref_path = None
    if pdf_ref_path == dropbox_path:
        pdf_ref_path = None

    settings = session.get(FileSettings, dropbox_path)
    now = datetime.utcnow()

    if settings:
        settings.section_ref_path = section_ref_path
        settings.pdf_ref_path = pdf_ref_path
        settings.updated_at = now
    else:
        settings = FileSettings(
            dropbox_path=dropbox_path,
            section_ref_path=section_ref_path,
            pdf_ref_path=pdf_ref_path,
            created_at=now,
            updated_at=now,
        )

    session.add(settings)
    session.commit()
    return ActionResponse.success()


@router.post("/propagate")
def propagate_reference(
    data: dict,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    """Set this file as reference for multiple target files.
    Supports both section_ref_path and pdf_ref_path via 'field' parameter."""
    reference_path = (data.get("reference_path") or "").strip()
    target_paths = data.get("target_paths", [])
    field = data.get("field", "section_ref_path")

    if field not in ("section_ref_path", "pdf_ref_path"):
        raise HTTPException(400, "field must be 'section_ref_path' or 'pdf_ref_path'")
    if not reference_path:
        raise HTTPException(400, "reference_path is required")
    if not isinstance(target_paths, list) or len(target_paths) < 1:
        raise HTTPException(400, "target_paths must be a non-empty list")

    now = datetime.utcnow()
    for path in target_paths:
        path = path.strip()
        if not path or path == reference_path:
            continue
        settings = session.get(FileSettings, path)
        if settings:
            setattr(settings, field, reference_path)
            settings.updated_at = now
        else:
            settings = FileSettings(
                dropbox_path=path,
                created_at=now,
                updated_at=now,
            )
            setattr(settings, field, reference_path)
        session.add(settings)

    session.commit()
    return ActionResponse.success()
