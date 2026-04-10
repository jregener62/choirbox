"""Notes API — per-user notes for tracks and sections."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.note import Note
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse
from backend.services import path_resolver
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/notes", tags=["notes"])


async def _resolve_target_file_id(rel_path: str, user: User, session: Session) -> str | None:
    """Holt die Dropbox-File-ID fuer einen choir-relativen Pfad. Gibt None zurueck,
    wenn die Datei nicht (mehr) existiert oder keine Dropbox-Verbindung besteht."""
    dbx = get_dropbox_service(session)
    if not dbx:
        return None
    target = await path_resolver.resolve(rel_path, "file", user, session, dbx)
    return target.dropbox_file_id


@router.get("")
def list_notes(
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    """Get all notes for a track (track-level + section-level) for current user."""
    if not path.strip():
        raise HTTPException(400, "path is required")
    notes = session.exec(
        select(Note).where(
            Note.user_id == user.id,
            Note.dropbox_path == path,
        )
    ).all()
    return [
        {
            "id": n.id,
            "dropbox_path": n.dropbox_path,
            "section_id": n.section_id,
            "text": n.text,
        }
        for n in notes
    ]


@router.put("")
async def save_note(
    data: dict,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    """Upsert a note. section_id=null for track-level note."""
    dropbox_path = data.get("dropbox_path", "").strip()
    if not dropbox_path:
        raise HTTPException(400, "dropbox_path is required")

    text = data.get("text", "").strip()
    section_id = data.get("section_id")  # None = track-level

    # Find existing note
    query = select(Note).where(
        Note.user_id == user.id,
        Note.dropbox_path == dropbox_path,
    )
    if section_id is not None:
        query = query.where(Note.section_id == section_id)
    else:
        query = query.where(Note.section_id == None)  # noqa: E711

    existing = session.exec(query).first()

    if not text:
        # Delete note if text is empty
        if existing:
            session.delete(existing)
            session.commit()
        return ActionResponse.success(data={"deleted": True})

    now = datetime.utcnow()
    if existing:
        existing.text = text
        existing.updated_at = now
        if not existing.target_file_id:
            existing.target_file_id = await _resolve_target_file_id(dropbox_path, user, session)
        session.add(existing)
    else:
        target_file_id = await _resolve_target_file_id(dropbox_path, user, session)
        existing = Note(
            user_id=user.id,
            dropbox_path=dropbox_path,
            target_file_id=target_file_id,
            section_id=section_id,
            text=text,
            created_at=now,
            updated_at=now,
        )
        session.add(existing)

    session.commit()
    session.refresh(existing)

    return ActionResponse.success(data={
        "id": existing.id,
        "section_id": existing.section_id,
        "text": existing.text,
    })


@router.put("/bulk")
async def save_notes_bulk(
    data: dict,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    """Bulk save notes for a track (track note + section notes at once)."""
    dropbox_path = data.get("dropbox_path", "").strip()
    if not dropbox_path:
        raise HTTPException(400, "dropbox_path is required")

    notes_data = data.get("notes", [])
    if not isinstance(notes_data, list):
        raise HTTPException(400, "notes must be a list")

    now = datetime.utcnow()
    target_file_id = await _resolve_target_file_id(dropbox_path, user, session)

    for n_data in notes_data:
        section_id = n_data.get("section_id")
        text = n_data.get("text", "").strip()

        query = select(Note).where(
            Note.user_id == user.id,
            Note.dropbox_path == dropbox_path,
        )
        if section_id is not None:
            query = query.where(Note.section_id == section_id)
        else:
            query = query.where(Note.section_id == None)  # noqa: E711

        existing = session.exec(query).first()

        if not text:
            if existing:
                session.delete(existing)
        elif existing:
            existing.text = text
            existing.updated_at = now
            if not existing.target_file_id and target_file_id:
                existing.target_file_id = target_file_id
            session.add(existing)
        else:
            note = Note(
                user_id=user.id,
                dropbox_path=dropbox_path,
                target_file_id=target_file_id,
                section_id=section_id,
                text=text,
                created_at=now,
                updated_at=now,
            )
            session.add(note)

    session.commit()
    return ActionResponse.success()
