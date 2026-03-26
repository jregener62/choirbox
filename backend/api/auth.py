"""Authentication & User management API."""

import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from backend.config import REGISTRATION_CODE
from backend.database import get_session
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.schemas import ActionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Token store: token -> (user_id, created_at_timestamp)
_tokens: dict[str, tuple[str, float]] = {}
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


def _create_token(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    _tokens[token] = (user_id, time.time())
    return token


def _cleanup_expired_tokens():
    """Remove expired tokens (called periodically)."""
    now = time.time()
    expired = [t for t, (_, created) in _tokens.items() if now - created > TOKEN_MAX_AGE]
    for t in expired:
        del _tokens[t]


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
    entry = _tokens.get(token)
    if not entry:
        return None
    user_id, created_at = entry
    if time.time() - created_at > TOKEN_MAX_AGE:
        del _tokens[token]
        return None
    return session.get(User, user_id)


def require_user(request: Request, session: Session = Depends(get_session)) -> User:
    """Require authenticated user — raises 401 if not logged in."""
    user = get_current_user(request, session)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def require_admin(request: Request, session: Session = Depends(get_session)) -> User:
    """Require admin user — raises 403 if not admin."""
    user = require_user(request, session)
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


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

    _cleanup_expired_tokens()

    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    token = _create_token(user.id)
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
        role="guest",
        voice_part=voice_part,
        password_hash=_hash_password(password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = _create_token(user.id)
    return {"token": token, "user": _user_response(user)}


@router.post("/logout")
def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        _tokens.pop(token, None)
    return {"ok": True}
