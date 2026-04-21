"""Sections API — named time ranges for folders with optional lyrics."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.section import Section
from backend.models.note import Note
from backend.policy import require_permission
from backend.schemas import ActionResponse

router = APIRouter(prefix="/sections", tags=["sections"])


class SectionsBulkBody(BaseModel):
    folder_path: str = ""
    sections: list[dict] = []


class CreateSectionBody(BaseModel):
    folder_path: str = ""
    label: str = ""
    color: str = "#8b5cf6"
    start_time: float | None = None
    end_time: float | None = None
    sort_order: int = 0


class SaveLyricsBulkBody(BaseModel):
    sections: list[dict] = []


class UpdateSectionBody(BaseModel):
    label: str | None = None
    color: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    sort_order: int | None = None
    lyrics: str | None = None


@router.get("")
def list_sections(
    folder: str,
    user: User = Depends(require_permission("sections.read")),
    session: Session = Depends(get_session),
):
    sections = session.exec(
        select(Section)
        .where(Section.folder_path == folder)
        .order_by(Section.sort_order, Section.start_time)
    ).all()
    return [
        {
            "id": s.id,
            "folder_path": s.folder_path,
            "label": s.label,
            "color": s.color,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "lyrics": s.lyrics,
            "sort_order": s.sort_order,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat(),
        }
        for s in sections
    ]


@router.post("/bulk")
def create_sections_bulk(
    body: SectionsBulkBody,
    user: User = Depends(require_permission("sections.manage")),
    session: Session = Depends(get_session),
):
    folder_path = body.folder_path.strip()
    entries = body.sections

    if not folder_path:
        raise HTTPException(400, "folder_path is required")
    if not entries:
        raise HTTPException(400, "sections must be a non-empty list")

    ids = []
    for entry in entries:
        label = (entry.get("label") or "").strip()
        color = (entry.get("color") or "#8b5cf6").strip()
        start_time = entry.get("start_time")
        end_time = entry.get("end_time")
        sort_order = entry.get("sort_order", 0)

        if not label:
            raise HTTPException(400, "label is required for each section")
        if start_time is None or end_time is None:
            raise HTTPException(400, "start_time and end_time are required")
        if end_time <= start_time:
            raise HTTPException(400, "end_time must be greater than start_time")

        section = Section(
            folder_path=folder_path,
            label=label,
            color=color,
            start_time=float(start_time),
            end_time=float(end_time),
            sort_order=int(sort_order),
            created_by=user.id,
        )
        session.add(section)
        session.flush()
        ids.append(section.id)

    session.commit()
    return ActionResponse.success(data={"ids": ids})


@router.post("")
def create_section(
    body: CreateSectionBody,
    user: User = Depends(require_permission("sections.manage")),
    session: Session = Depends(get_session),
):
    folder_path = body.folder_path.strip()
    label = body.label.strip()
    color = body.color.strip()
    start_time = body.start_time
    end_time = body.end_time
    sort_order = body.sort_order

    if not folder_path:
        raise HTTPException(400, "folder_path is required")
    if not label:
        raise HTTPException(400, "label is required")
    if start_time is None or end_time is None:
        raise HTTPException(400, "start_time and end_time are required")
    if end_time <= start_time:
        raise HTTPException(400, "end_time must be greater than start_time")

    section = Section(
        folder_path=folder_path,
        label=label,
        color=color,
        start_time=float(start_time),
        end_time=float(end_time),
        sort_order=int(sort_order),
        created_by=user.id,
    )
    session.add(section)
    session.commit()
    session.refresh(section)
    return ActionResponse.success(data={"id": section.id})


@router.put("/lyrics")
def save_lyrics_bulk(
    body: SaveLyricsBulkBody,
    user: User = Depends(require_permission("sections.manage")),
    session: Session = Depends(get_session),
):
    """Bulk save lyrics for multiple sections at once."""
    entries = body.sections

    now = datetime.utcnow()
    for entry in entries:
        section_id = entry.get("id")
        if not section_id:
            continue
        section = session.get(Section, section_id)
        if not section:
            continue
        section.lyrics = (entry.get("lyrics") or "").strip() or None
        section.updated_at = now
        session.add(section)

    session.commit()
    return ActionResponse.success()


@router.put("/{section_id}")
def update_section(
    section_id: int,
    body: UpdateSectionBody,
    user: User = Depends(require_permission("sections.manage")),
    session: Session = Depends(get_session),
):
    section = session.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")

    if body.label is not None:
        section.label = body.label.strip()
    if body.color is not None:
        section.color = body.color.strip()
    if body.start_time is not None:
        section.start_time = float(body.start_time)
    if body.end_time is not None:
        section.end_time = float(body.end_time)
    if body.sort_order is not None:
        section.sort_order = int(body.sort_order)
    if body.lyrics is not None:
        section.lyrics = body.lyrics.strip() or None

    if section.end_time <= section.start_time:
        raise HTTPException(400, "end_time must be greater than start_time")

    section.updated_at = datetime.utcnow()
    session.add(section)
    session.commit()
    return ActionResponse.success()


@router.delete("/{section_id}")
def delete_section(
    section_id: int,
    user: User = Depends(require_permission("sections.manage")),
    session: Session = Depends(get_session),
):
    section = session.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    # Delete associated notes
    orphan_notes = session.exec(
        select(Note).where(Note.section_id == section_id)
    ).all()
    for note in orphan_notes:
        session.delete(note)
    session.delete(section)
    session.commit()
    return ActionResponse.success()
