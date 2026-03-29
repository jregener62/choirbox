"""Section Presets API — pro-members manage reusable section name/color presets."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.section_preset import SectionPreset
from backend.api.auth import require_user, require_role
from backend.schemas import ActionResponse

router = APIRouter(prefix="/section-presets", tags=["section-presets"])


@router.get("")
def list_presets(user: User = Depends(require_user), session: Session = Depends(get_session)):
    presets = session.exec(select(SectionPreset).order_by(SectionPreset.sort_order)).all()
    return [{"id": p.id, "name": p.name, "color": p.color, "sort_order": p.sort_order} for p in presets]


@router.post("")
def create_preset(data: dict, user: User = Depends(require_role("pro-member")), session: Session = Depends(get_session)):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    preset = SectionPreset(
        name=name,
        color=data.get("color", "#8b5cf6"),
        sort_order=data.get("sort_order", 0),
    )
    session.add(preset)
    session.commit()
    session.refresh(preset)
    return ActionResponse.success(data={"id": preset.id})


@router.put("/{preset_id}")
def update_preset(
    preset_id: int,
    data: dict,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    preset = session.get(SectionPreset, preset_id)
    if not preset:
        raise HTTPException(404, "Preset not found")

    for field in ["name", "color", "sort_order"]:
        if field in data:
            setattr(preset, field, data[field])

    session.add(preset)
    session.commit()
    return ActionResponse.success()


@router.delete("/{preset_id}")
def delete_preset(
    preset_id: int,
    user: User = Depends(require_role("pro-member")),
    session: Session = Depends(get_session),
):
    preset = session.get(SectionPreset, preset_id)
    if not preset:
        raise HTTPException(404, "Preset not found")

    session.delete(preset)
    session.commit()
    return ActionResponse.success()
