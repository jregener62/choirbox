"""Admin API — user management and choir management."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.database import get_session
from backend.models.choir import Choir
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.api.auth import require_admin, require_role, _hash_password, VALID_VOICE_PARTS, VALID_ROLES
from backend.schemas import ActionResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
def list_users(user: User = Depends(require_admin), session: Session = Depends(get_session)):
    users = session.exec(select(User).where(User.choir_id == user.choir_id).order_by(User.created_at)).all()
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
        choir_id=user.choir_id,
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
    if not target or target.choir_id != user.choir_id:
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
    if not target or target.choir_id != user.choir_id:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "Cannot delete yourself")

    session.delete(target)
    session.commit()
    return ActionResponse.success()


@router.get("/settings")
def get_settings(user: User = Depends(require_admin), session: Session = Depends(get_session)):
    choir = session.get(Choir, user.choir_id) if user.choir_id else None
    settings = session.get(AppSettings, 1)
    return {
        "invite_code": choir.invite_code if choir else None,
        "dropbox_root_folder": choir.dropbox_root_folder if choir else None,
        "dropbox_app_folder": settings.dropbox_root_folder if settings else None,
    }


@router.put("/settings")
def update_settings(data: dict, user: User = Depends(require_admin), session: Session = Depends(get_session)):
    if not user.choir_id:
        raise HTTPException(400, "Kein Chor zugeordnet")
    choir = session.get(Choir, user.choir_id)
    if not choir:
        raise HTTPException(404, "Chor nicht gefunden")

    if "invite_code" in data:
        new_code = data["invite_code"].strip()
        if new_code and new_code != choir.invite_code:
            existing = session.exec(select(Choir).where(Choir.invite_code == new_code)).first()
            if existing:
                raise HTTPException(409, "Einladungscode bereits vergeben")
            choir.invite_code = new_code
    if "dropbox_root_folder" in data:
        choir.dropbox_root_folder = data["dropbox_root_folder"].strip() or None

    session.add(choir)

    # Global app folder (developer only)
    if "dropbox_app_folder" in data:
        from backend.api.auth import ROLE_HIERARCHY
        if ROLE_HIERARCHY.get(user.role, 0) >= ROLE_HIERARCHY["developer"]:
            settings = session.get(AppSettings, 1)
            if not settings:
                settings = AppSettings(id=1)
            settings.dropbox_root_folder = data["dropbox_app_folder"].strip() or None
            session.add(settings)

    session.commit()
    return ActionResponse.success()


# -- Choir management (developer only) --

@router.get("/choirs")
def list_choirs(user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
    choirs = session.exec(select(Choir).order_by(Choir.created_at)).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "invite_code": c.invite_code,
            "dropbox_root_folder": c.dropbox_root_folder,
            "created_at": c.created_at.isoformat(),
        }
        for c in choirs
    ]


@router.post("/choirs")
def create_choir(data: dict, user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
    name = data.get("name", "").strip()
    invite_code = data.get("invite_code", "").strip()
    dropbox_root_folder = data.get("dropbox_root_folder", "").strip() or None

    if not name or not invite_code:
        raise HTTPException(400, "name und invite_code sind erforderlich")

    existing = session.exec(select(Choir).where(Choir.invite_code == invite_code)).first()
    if existing:
        raise HTTPException(409, "Einladungscode bereits vergeben")

    choir = Choir(name=name, invite_code=invite_code, dropbox_root_folder=dropbox_root_folder)
    session.add(choir)
    session.commit()
    session.refresh(choir)
    return ActionResponse.success(data={"id": choir.id, "name": choir.name})


@router.put("/choirs/{choir_id}")
def update_choir(choir_id: str, data: dict, user: User = Depends(require_role("developer")), session: Session = Depends(get_session)):
    choir = session.get(Choir, choir_id)
    if not choir:
        raise HTTPException(404, "Chor nicht gefunden")

    if "name" in data:
        choir.name = data["name"].strip()
    if "dropbox_root_folder" in data:
        choir.dropbox_root_folder = data["dropbox_root_folder"].strip() or None
    if "invite_code" in data:
        new_code = data["invite_code"].strip()
        if new_code and new_code != choir.invite_code:
            existing = session.exec(select(Choir).where(Choir.invite_code == new_code)).first()
            if existing:
                raise HTTPException(409, "Einladungscode bereits vergeben")
            choir.invite_code = new_code

    session.add(choir)
    session.commit()
    return ActionResponse.success()
