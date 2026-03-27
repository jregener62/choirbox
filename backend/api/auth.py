"""Authentication & User management API."""

import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from backend.config import REGISTRATION_CODE
from backend.database import get_session
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.models.session_token import SessionToken
from backend.schemas import ActionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

TOKEN_MAX_AGE = 7 * 24 * 3600  # 7 days in seconds

# Rate limiting for login: ip -> list of attempt timestamps
_login_attempts: dict[str, list[float]] = {}
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW = 60  # seconds

VALID_VOICE_PARTS = {"Sopran", "Alt", "Tenor", "Bass"}


def _hash_password(password: str) -> str:
    """Hash a password with a random salt using PBKDF2."""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        salt, h = password_hash.split("$", 1)
        expected = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
        return hmac.compare_digest(expected.hex(), h)
    except Exception:
        return False


def _create_token(user_id: str, session: Session) -> str:
    """Create a new session token and persist it in the database."""
    st = SessionToken(user_id=user_id)
    session.add(st)
    session.commit()
    session.refresh(st)
    return st.token


def _cleanup_expired_tokens(session: Session):
    """Remove expired tokens from the database."""
    cutoff = datetime.utcnow() - timedelta(seconds=TOKEN_MAX_AGE)
    expired = session.exec(select(SessionToken).where(SessionToken.created_at < cutoff)).all()
    for st in expired:
        session.delete(st)
    if expired:
        session.commit()


def _check_rate_limit(ip: str):
    """Raise 429 if too many login attempts from this IP."""
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    # Keep only attempts within the window
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Zu viele Anmeldeversuche. Bitte warte eine Minute.")


def _record_login_attempt(ip: str):
    """Record a login attempt for rate limiting."""
    _login_attempts.setdefault(ip, []).append(time.time())


def get_current_user(request: Request, session: Session = Depends(get_session)) -> Optional[User]:
    """Extract current user from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        token = request.query_params.get("token", "")

    if not token:
        return None
    st = session.get(SessionToken, token)
    if not st:
        return None
    cutoff = datetime.utcnow() - timedelta(seconds=TOKEN_MAX_AGE)
    if st.created_at < cutoff:
        session.delete(st)
        session.commit()
        return None
    return session.get(User, st.user_id)


def require_user(request: Request, session: Session = Depends(get_session)) -> User:
    """Require authenticated user — raises 401 if not logged in."""
    user = get_current_user(request, session)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


ROLE_HIERARCHY = {"guest": 0, "member": 1, "pro-member": 2, "chorleiter": 3, "admin": 4}
VALID_ROLES = set(ROLE_HIERARCHY.keys())


def require_role(min_role: str):
    """Factory: returns a dependency that requires a minimum role level."""
    def dependency(request: Request, session: Session = Depends(get_session)) -> User:
        user = require_user(request, session)
        if ROLE_HIERARCHY.get(user.role, 0) < ROLE_HIERARCHY[min_role]:
            raise HTTPException(403, "Keine Berechtigung")
        return user
    return dependency


require_admin = require_role("admin")


def _user_response(user: User) -> dict:
    """Build user response dict."""
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "voice_part": user.voice_part,
    }


@router.post("/login")
def login(data: dict, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        raise HTTPException(400, "Username and password required")

    user = session.exec(select(User).where(User.username == username)).first()
    if not user or not _verify_password(password, user.password_hash):
        _record_login_attempt(ip)
        raise HTTPException(401, "Invalid credentials")

    _cleanup_expired_tokens(session)

    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    token = _create_token(user.id, session)
    return {"token": token, "user": _user_response(user)}


@router.get("/me")
def get_me(user: User = Depends(require_user)):
    return _user_response(user)


@router.put("/me")
def update_me(data: dict, user: User = Depends(require_user), session: Session = Depends(get_session)):
    if "display_name" in data:
        user.display_name = data["display_name"]
    if "voice_part" in data and data["voice_part"] in VALID_VOICE_PARTS:
        user.voice_part = data["voice_part"]

    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return ActionResponse.success(data=_user_response(user))


@router.put("/me/password")
def change_password(data: dict, user: User = Depends(require_user), session: Session = Depends(get_session)):
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")
    if not old_password or not new_password:
        raise HTTPException(400, "Old and new password required")
    if not _verify_password(old_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    if len(new_password) < 4:
        raise HTTPException(400, "New password must be at least 4 characters")

    user.password_hash = _hash_password(new_password)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return ActionResponse.success()


@router.post("/register")
def register(data: dict, request: Request, session: Session = Depends(get_session)):
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    code = data.get("registration_code", "").strip()
    username = data.get("username", "").strip()
    display_name = data.get("display_name", "").strip()
    password = data.get("password", "")
    voice_part = data.get("voice_part", "").strip()

    if not username or not password:
        raise HTTPException(400, "Username and password required")
    if len(password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")
    if voice_part not in VALID_VOICE_PARTS:
        raise HTTPException(400, f"Voice part must be one of: {', '.join(sorted(VALID_VOICE_PARTS))}")

    # Validate registration code
    settings = session.get(AppSettings, 1)
    expected_code = (settings.registration_code if settings else None) or REGISTRATION_CODE
    if expected_code and code != expected_code:
        _record_login_attempt(ip)
        raise HTTPException(403, "Invalid registration code")

    # Check uniqueness
    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        raise HTTPException(409, "Username already exists")

    user = User(
        username=username,
        display_name=display_name or username,
        role="member",
        voice_part=voice_part,
        password_hash=_hash_password(password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = _create_token(user.id, session)
    return {"token": token, "user": _user_response(user)}


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
