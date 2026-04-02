"""Annotations API — per-user handwritten annotations on document pages."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.annotation import Annotation
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("")
def get_annotations(
    doc_id: int,
    page: int,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    annotation = session.exec(
        select(Annotation).where(
            Annotation.user_id == user.id,
            Annotation.document_id == doc_id,
            Annotation.page_number == page,
        )
    ).first()
    if not annotation:
        return {"strokes": []}
    return {"strokes": json.loads(annotation.strokes_json)}


@router.put("")
def upsert_annotations(
    data: dict,
    user: User = Depends(require_role("member")),
    session: Session = Depends(get_session),
):
    doc_id = data.get("doc_id")
    page = data.get("page")
    strokes = data.get("strokes")
    if not doc_id or page is None or strokes is None:
        raise HTTPException(400, "doc_id, page and strokes are required")

    annotation = session.exec(
        select(Annotation).where(
            Annotation.user_id == user.id,
            Annotation.document_id == doc_id,
            Annotation.page_number == page,
        )
    ).first()

    strokes_json = json.dumps(strokes)

    if not strokes:
        if annotation:
            session.delete(annotation)
            session.commit()
        return ActionResponse.success()

    if annotation:
        annotation.strokes_json = strokes_json
        annotation.updated_at = datetime.utcnow()
    else:
        annotation = Annotation(
            user_id=user.id,
            document_id=doc_id,
            page_number=page,
            strokes_json=strokes_json,
        )
        session.add(annotation)

    session.commit()
    return ActionResponse.success()


@router.delete("")
def delete_page_annotations(
    doc_id: int,
    page: int,
    user: User = Depends(require_role("member")),
    session: Session = Depends(get_session),
):
    annotation = session.exec(
        select(Annotation).where(
            Annotation.user_id == user.id,
            Annotation.document_id == doc_id,
            Annotation.page_number == page,
        )
    ).first()
    if not annotation:
        raise HTTPException(404, "No annotations found")
    session.delete(annotation)
    session.commit()
    return ActionResponse.success()


@router.delete("/all")
def delete_all_annotations(
    doc_id: int,
    user: User = Depends(require_role("member")),
    session: Session = Depends(get_session),
):
    annotations = session.exec(
        select(Annotation).where(
            Annotation.user_id == user.id,
            Annotation.document_id == doc_id,
        )
    ).all()
    for a in annotations:
        session.delete(a)
    session.commit()
    return ActionResponse.success(data={"deleted": len(annotations)})
