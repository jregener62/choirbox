"""Authentication & User management API — duenne Wrapper um auth_service."""

import logging
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from backend.config import REGISTRATION_CODE
from backend.database import get_session
from backend.models.app_settings import AppSettings
from backend.models.choir import Choir
from backend.models.session_token import SessionToken
from backend.models.user import User
from backend.policy import require_permission
from backend.schemas import ActionResponse
from backend.services.auth_service import (
    MIN_PASSWORD_LENGTH,
    ROLE_HIERARCHY,
    TOKEN_MAX_AGE,
    VALID_ROLES,
    cleanup_expired_tokens,
    create_token,
    hash_password,
    resolve_token_to_user,
    user_response,
    valid_voice_parts,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limiting for login: ip -> list of attempt timestamps
_login_attempts: dict[str, list[float]] = {}
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW = 60  # seconds


def _check_rate_limit(ip: str):
    """Raise 429 if too many login attempts from this IP."""
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Zu viele Anmeldeversuche. Bitte warte eine Minute.")


def _record_login_attempt(ip: str):
    _login_attempts.setdefault(ip, []).append(time.time())


def get_current_user(request: Request, session: Session = Depends(get_session)) -> Optional[User]:
    """Resolve the current user from the ``Authorization: Bearer`` header.

    Returns ``None`` if no (valid) token is present. Used internally by the
    policy-dependency layer — router code should use
    :func:`backend.policy.require_permission` instead.
    """
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    return resolve_token_to_user(token, session)


@router.post("/login")
def login(data: dict, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        raise HTTPException(400, "Username and password required")

    user = session.exec(select(User).where(User.username == username)).first()
    if not user or not verify_password(password, user.password_hash):
        _record_login_attempt(ip)
        raise HTTPException(401, "Invalid credentials")

    # Gast-User (role=guest) koennen sich nicht per Passwort einloggen —
    # der Zugang erfolgt ausschliesslich ueber einen eingeloesten
    # Guest-Link (POST /api/guest-links/redeem).
    if user.role == "guest":
        _record_login_attempt(ip)
        raise HTTPException(401, "Invalid credentials")

    cleanup_expired_tokens(session)

    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_token(user.id, session)
    return {"token": token, "user": user_response(user, session)}


@router.get("/me")
def get_me(
    user: User = Depends(require_permission("profile.read")),
    session: Session = Depends(get_session),
):
    return user_response(user, session)


@router.put("/me")
def update_me(
    data: dict,
    user: User = Depends(require_permission("profile.write")),
    session: Session = Depends(get_session),
):
    if "display_name" in data:
        user.display_name = data["display_name"]
    if "voice_part" in data and data["voice_part"]:
        user.voice_part = data["voice_part"]

    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return ActionResponse.success(data=user_response(user, session))


@router.put("/me/password")
def change_password(
    data: dict,
    user: User = Depends(require_permission("profile.password")),
    session: Session = Depends(get_session),
):
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")
    if not old_password or not new_password:
        raise HTTPException(400, "Old and new password required")
    if not verify_password(old_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen haben")

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return ActionResponse.success()


@router.get("/choir-info")
def choir_info(invite_code: str, session: Session = Depends(get_session)):
    """Public endpoint: resolve invite code to choir name and voice labels."""
    choir = session.exec(select(Choir).where(Choir.invite_code == invite_code)).first()
    if not choir:
        raise HTTPException(404, "Ungueltiger Einladungslink")
    from backend.models.label import Label
    voice_labels = session.exec(
        select(Label)
        .where(Label.choir_id == choir.id, Label.category == "Stimme")
        .order_by(Label.sort_order)
    ).all()
    return {
        "choir_id": choir.id,
        "choir_name": choir.name,
        "voice_labels": [{"name": l.name, "color": l.color} for l in voice_labels],
    }


@router.post("/register")
def register(data: dict, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    invite_code = data.get("invite_code", "").strip()
    # Backward compat: accept registration_code too
    if not invite_code:
        invite_code = data.get("registration_code", "").strip()
    username = data.get("username", "").strip()
    display_name = data.get("display_name", "").strip()
    password = data.get("password", "")
    voice_part = data.get("voice_part", "").strip()

    if not invite_code:
        raise HTTPException(400, "Einladungscode erforderlich")
    if not username or not password:
        raise HTTPException(400, "Username and password required")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen haben")

    choir = session.exec(select(Choir).where(Choir.invite_code == invite_code)).first()
    if not choir:
        # Backward compat: fall back to AppSettings.registration_code
        settings = session.get(AppSettings, 1)
        expected_code = (settings.registration_code if settings else None) or REGISTRATION_CODE
        if not expected_code or invite_code != expected_code:
            _record_login_attempt(ip)
            raise HTTPException(403, "Ungueltiger Einladungscode")
        choir = session.exec(select(Choir)).first()
        if not choir:
            raise HTTPException(500, "Kein Chor konfiguriert")

    if voice_part:
        valid_parts = valid_voice_parts(session, choir.id)
        if valid_parts and voice_part not in valid_parts:
            raise HTTPException(
                400,
                f"Stimmgruppe muss eine der folgenden sein: {', '.join(sorted(valid_parts))}",
            )

    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        raise HTTPException(409, "Username already exists")

    user = User(
        username=username,
        display_name=display_name or username,
        role="member",
        voice_part=voice_part,
        password_hash=hash_password(password),
        choir_id=choir.id,
        view_mode=choir.default_view_mode,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_token(user.id, session)
    return {"token": token, "user": user_response(user, session)}


@router.post("/logout")
def logout(request: Request, session: Session = Depends(get_session)):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        st = session.get(SessionToken, token)
        if st:
            session.delete(st)
            session.commit()
    return {"ok": True}


# Re-exports fuer externe Konsumenten, die historisch aus api.auth importiert
# haben. Neue Aufrufer sollen direkt aus backend.services.auth_service lesen.
__all__ = [
    "router",
    "get_current_user",
    "MIN_PASSWORD_LENGTH",
    "TOKEN_MAX_AGE",
    "ROLE_HIERARCHY",
    "VALID_ROLES",
]
