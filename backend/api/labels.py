"""Labels API — admin manages labels, users assign them to tracks."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.label import Label
from backend.models.user_label import UserLabel
from backend.policy import require_permission
from backend.schemas import ActionResponse
from backend.services import path_resolver
from backend.services.dropbox_service import get_dropbox_service

router = APIRouter(prefix="/labels", tags=["labels"])


class CreateLabelBody(BaseModel):
    name: str = ""
    color: str = "#6366f1"
    category: str | None = None
    sort_order: int = 0
    shortcode: str | None = None
    aliases: str | None = None


class UpdateLabelBody(BaseModel):
    name: str | None = None
    color: str | None = None
    category: str | None = None
    sort_order: int | None = None
    shortcode: str | None = None
    aliases: str | None = None


class AssignLabelBody(BaseModel):
    dropbox_path: str = ""
    label_id: int | None = None


async def _resolve_target_file_id(rel_path: str, user: User, session: Session) -> str | None:
    """Holt die Dropbox-File-ID fuer einen choir-relativen Pfad. None bei Miss."""
    dbx = get_dropbox_service(session)
    if not dbx:
        return None
    target = await path_resolver.resolve(rel_path, "file", user, session, dbx)
    return target.dropbox_file_id


@router.get("")
def list_labels(user: User = Depends(require_permission("labels.read")), session: Session = Depends(get_session)):
    labels = session.exec(select(Label).where(Label.choir_id == user.choir_id).order_by(Label.sort_order)).all()
    return [
        {
            "id": l.id,
            "name": l.name,
            "color": l.color,
            "category": l.category,
            "shortcode": l.shortcode,
            "aliases": l.aliases,
            "sort_order": l.sort_order,
        }
        for l in labels
    ]


@router.post("")
def create_label(body: CreateLabelBody, user: User = Depends(require_permission("labels.manage")), session: Session = Depends(get_session)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")

    label = Label(
        name=name,
        color=body.color,
        category=body.category,
        sort_order=body.sort_order,
        shortcode=body.shortcode,
        aliases=body.aliases,
        choir_id=user.choir_id,
    )
    session.add(label)
    session.commit()
    session.refresh(label)
    return ActionResponse.success(data={"id": label.id})


@router.put("/{label_id}")
def update_label(
    label_id: int,
    body: UpdateLabelBody,
    user: User = Depends(require_permission("labels.manage")),
    session: Session = Depends(get_session),
):
    label = session.get(Label, label_id)
    if not label or label.choir_id != user.choir_id:
        raise HTTPException(404, "Label not found")

    was_stimme = label.category == "Stimme"
    for field in ["name", "color", "category", "sort_order", "shortcode", "aliases"]:
        value = getattr(body, field)
        if value is not None:
            setattr(label, field, value)

    session.add(label)
    session.commit()

    # Invalidate audio meta if voice label changed
    if was_stimme or label.category == "Stimme":
        from backend.services.audio_meta_service import invalidate_choir_meta
        invalidate_choir_meta(session, user.choir_id)

    return ActionResponse.success()


@router.delete("/{label_id}")
def delete_label(
    label_id: int,
    user: User = Depends(require_permission("labels.manage")),
    session: Session = Depends(get_session),
):
    label = session.get(Label, label_id)
    if not label or label.choir_id != user.choir_id:
        raise HTTPException(404, "Label not found")

    # Remove all user-label assignments for this label
    assignments = session.exec(select(UserLabel).where(UserLabel.label_id == label_id)).all()
    for a in assignments:
        session.delete(a)

    session.delete(label)
    session.commit()
    return ActionResponse.success()


# -- User-Label assignments --

@router.get("/my")
def get_my_labels(
    path: str = "",
    user: User = Depends(require_permission("labels.my.read")),
    session: Session = Depends(get_session),
):
    """Get labels assigned by the current user, optionally filtered by dropbox_path."""
    query = select(UserLabel).where(UserLabel.user_id == user.id)
    if path:
        query = query.where(UserLabel.dropbox_path == path)
    assignments = session.exec(query).all()
    return [
        {"id": a.id, "dropbox_path": a.dropbox_path, "label_id": a.label_id}
        for a in assignments
    ]


@router.post("/my")
async def assign_label(body: AssignLabelBody, user: User = Depends(require_permission("labels.my.write")), session: Session = Depends(get_session)):
    dropbox_path = body.dropbox_path.strip()
    label_id = body.label_id
    if not dropbox_path or not label_id:
        raise HTTPException(400, "dropbox_path and label_id are required")

    # Check label exists
    label = session.get(Label, label_id)
    if not label:
        raise HTTPException(404, "Label not found")

    # Check if already assigned
    existing = session.exec(
        select(UserLabel).where(
            UserLabel.user_id == user.id,
            UserLabel.dropbox_path == dropbox_path,
            UserLabel.label_id == label_id,
        )
    ).first()
    if existing:
        return ActionResponse.success(data={"id": existing.id, "already_exists": True})

    target_file_id = await _resolve_target_file_id(dropbox_path, user, session)
    assignment = UserLabel(
        user_id=user.id,
        dropbox_path=dropbox_path,
        target_file_id=target_file_id,
        label_id=label_id,
    )
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return ActionResponse.success(data={"id": assignment.id})


@router.post("/my/toggle")
async def toggle_label(body: AssignLabelBody, user: User = Depends(require_permission("labels.my.write")), session: Session = Depends(get_session)):
    """Toggle label assignment: add if not exists, remove if exists."""
    dropbox_path = body.dropbox_path.strip()
    label_id = body.label_id
    if not dropbox_path or not label_id:
        raise HTTPException(400, "dropbox_path and label_id are required")

    existing = session.exec(
        select(UserLabel).where(
            UserLabel.user_id == user.id,
            UserLabel.dropbox_path == dropbox_path,
            UserLabel.label_id == label_id,
        )
    ).first()

    if existing:
        session.delete(existing)
        session.commit()
        return ActionResponse.success(data={"assigned": False})
    else:
        label = session.get(Label, label_id)
        if not label:
            raise HTTPException(404, "Label not found")
        target_file_id = await _resolve_target_file_id(dropbox_path, user, session)
        assignment = UserLabel(
            user_id=user.id,
            dropbox_path=dropbox_path,
            target_file_id=target_file_id,
            label_id=label_id,
        )
        session.add(assignment)
        session.commit()
        return ActionResponse.success(data={"assigned": True, "id": assignment.id})


@router.delete("/my/{assignment_id}")
def remove_label_assignment(
    assignment_id: int,
    user: User = Depends(require_permission("labels.my.write")),
    session: Session = Depends(get_session),
):
    assignment = session.get(UserLabel, assignment_id)
    if not assignment or assignment.user_id != user.id:
        raise HTTPException(404, "Assignment not found")
    session.delete(assignment)
    session.commit()
    return ActionResponse.success()
