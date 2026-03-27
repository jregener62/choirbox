"""Sections API — named time ranges for tracks (admin-only for write ops)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.section import Section
from backend.api.auth import require_user, require_admin
from backend.schemas import ActionResponse

router = APIRouter(prefix="/sections", tags=["sections"])


@router.get("")
def list_sections(
    path: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    sections = session.exec(
        select(Section)
        .where(Section.dropbox_path == path)
        .order_by(Section.sort_order, Section.start_time)
    ).all()
    return [
        {
            "id": s.id,
            "dropbox_path": s.dropbox_path,
            "label": s.label,
            "color": s.color,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "sort_order": s.sort_order,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat(),
        }
        for s in sections
    ]


@router.post("")
def create_section(
    data: dict,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    dropbox_path = data.get("dropbox_path", "").strip()
    label = data.get("label", "").strip()
    color = data.get("color", "#8b5cf6").strip()
    start_time = data.get("start_time")
    end_time = data.get("end_time")
    sort_order = data.get("sort_order", 0)

    if not dropbox_path:
        raise HTTPException(400, "dropbox_path is required")
    if not label:
        raise HTTPException(400, "label is required")
    if start_time is None or end_time is None:
        raise HTTPException(400, "start_time and end_time are required")
    if end_time <= start_time:
        raise HTTPException(400, "end_time must be greater than start_time")

    section = Section(
        dropbox_path=dropbox_path,
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


@router.put("/{section_id}")
def update_section(
    section_id: int,
    data: dict,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    section = session.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")

    if "label" in data:
        section.label = data["label"].strip()
    if "color" in data:
        section.color = data["color"].strip()
    if "start_time" in data:
        section.start_time = float(data["start_time"])
    if "end_time" in data:
        section.end_time = float(data["end_time"])
    if "sort_order" in data:
        section.sort_order = int(data["sort_order"])

    if section.end_time <= section.start_time:
        raise HTTPException(400, "end_time must be greater than start_time")

    session.add(section)
    session.commit()
    return ActionResponse.success()


@router.delete("/{section_id}")
def delete_section(
    section_id: int,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    section = session.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    session.delete(section)
    session.commit()
    return ActionResponse.success()
