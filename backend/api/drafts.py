"""Drafts API — Pro-Member-Entwuerfe fuer Files, Songs, Ordner, Documents.

Ab Rolle pro-member koennen Eintraege als Entwurf markiert werden. Fuer
Rollen darunter sind diese Eintraege komplett unsichtbar (nicht gelistet,
nicht gesucht, nicht mitgezaehlt). Pro-Member+ sehen sie mit einem
``is_draft``-Flag.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from backend.database import get_session
from backend.models.user import User
from backend.policy import require_permission
from backend.schemas import ActionResponse
from backend.services import draft_service

router = APIRouter(prefix="/drafts", tags=["drafts"])


class DraftBody(BaseModel):
    kind: str = Field(..., description="'document' oder 'path'")
    ref: str = Field(..., description="Document.id als String oder Dropbox-Pfad")


@router.get("")
def list_drafts(
    user: User = Depends(require_permission("drafts.manage")),
    session: Session = Depends(get_session),
):
    entries = draft_service.list_drafts(session, user.choir_id)
    return {
        "drafts": [
            {
                "id": e.id,
                "kind": e.kind,
                "ref": e.ref,
                "created_by": e.created_by,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ]
    }


@router.post("")
def create_draft(
    body: DraftBody,
    user: User = Depends(require_permission("drafts.manage")),
    session: Session = Depends(get_session),
):
    try:
        entry = draft_service.set_draft(
            session,
            choir_id=user.choir_id,
            kind=body.kind,
            ref=body.ref,
            user_id=user.id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ActionResponse.success(data={"id": entry.id, "kind": entry.kind, "ref": entry.ref})


@router.delete("")
def delete_draft(
    body: DraftBody,
    user: User = Depends(require_permission("drafts.manage")),
    session: Session = Depends(get_session),
):
    try:
        removed = draft_service.unset_draft(
            session,
            choir_id=user.choir_id,
            kind=body.kind,
            ref=body.ref,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ActionResponse.success(data={"removed": removed})
