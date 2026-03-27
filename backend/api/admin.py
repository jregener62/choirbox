"""Admin API — user management."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.api.auth import require_admin, _hash_password, VALID_VOICE_PARTS, VALID_ROLES
from backend.schemas import ActionResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
def list_users(user: User = Depends(require_admin), session: Session = Depends(get_session)):
    users = session.exec(select(User).order_by(User.created_at)).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "role": u.role,
            "voice_part": u.voice_part,
            "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        }
        for u in users
    ]


@router.post("/users")
def create_user(data: dict, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    username = data.get("username", "").strip()
    password = data.get("password", "")
    voice_part = data.get("voice_part", "").strip()

    if not username or not password:
        raise HTTPException(400, "Username and password required")
    if voice_part not in VALID_VOICE_PARTS:
        raise HTTPException(400, f"Voice part must be one of: {', '.join(sorted(VALID_VOICE_PARTS))}")

    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        raise HTTPException(409, "Username already exists")

    role = data.get("role", "member")
    if role not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")

    new_user = User(
        username=username,
        display_name=data.get("display_name", username),
        role=role,
        voice_part=voice_part,
        password_hash=_hash_password(password),
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return ActionResponse.success(data={"id": new_user.id})


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    data: dict,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")

    if "role" in data and data["role"] not in VALID_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(sorted(VALID_ROLES))}")

    for field in ["display_name", "role", "voice_part"]:
        if field in data:
            setattr(target, field, data[field])

    if "password" in data and data["password"]:
        target.password_hash = _hash_password(data["password"])

    target.updated_at = datetime.utcnow()
    session.add(target)
    session.commit()
    return ActionResponse.success()


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "Cannot delete yourself")

    session.delete(target)
    session.commit()
    return ActionResponse.success()


@router.get("/settings")
def get_settings(user: User = Depends(require_admin), session: Session = Depends(get_session)):
    settings = session.get(AppSettings, 1)
    return {
        "registration_code": settings.registration_code if settings else None,
        "dropbox_root_folder": settings.dropbox_root_folder if settings else None,
    }


@router.put("/settings")
def update_settings(data: dict, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    settings = session.get(AppSettings, 1)
    if not settings:
        settings = AppSettings(id=1)

    if "registration_code" in data:
        settings.registration_code = data["registration_code"]
    if "dropbox_root_folder" in data:
        settings.dropbox_root_folder = data["dropbox_root_folder"]

    settings.updated_at = datetime.utcnow()
    session.add(settings)
    session.commit()
    return ActionResponse.success()
