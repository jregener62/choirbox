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
from backend.models.choir import Choir
from backend.models.user import User
from backend.models.app_settings import AppSettings
from backend.models.session_token import SessionToken
from backend.policy import require_permission
from backend.schemas import ActionResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

TOKEN_MAX_AGE = 7 * 24 * 3600  # 7 days in seconds

MIN_PASSWORD_LENGTH = 10

# Rate limiting for login: ip -> list of attempt timestamps
_login_attempts: dict[str, list[float]] = {}
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW = 60  # seconds

def _valid_voice_parts(session: Session, choir_id: str) -> set[str]:
    """Load valid voice part names from Stimme labels in DB."""
    from backend.models.label import Label
    labels = session.exec(
        select(Label).where(Label.choir_id == choir_id, Label.category == "Stimme")
    ).all()
    return {l.name for l in labels}


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


def _create_token(
    user_id: str,
    session: Session,
    max_age_seconds: Optional[int] = None,
) -> str:
    """Create a new session token and persist it in the database.

    If ``max_age_seconds`` is given, the token gets a hard ``expires_at``
    timestamp — used for guest sessions with short TTL (e.g. 2h). Otherwise
    the global ``TOKEN_MAX_AGE`` applies (7 days).
    """
    expires_at: Optional[datetime] = None
    if max_age_seconds is not None:
        expires_at = datetime.utcnow() + timedelta(seconds=max_age_seconds)
    st = SessionToken(user_id=user_id, expires_at=expires_at)
    session.add(st)
    session.commit()
    session.refresh(st)
    return st.token


def _cleanup_expired_tokens(session: Session):
    """Remove expired tokens from the database.

    Removes both long-lived tokens past the global TTL and custom-TTL
    tokens past their ``expires_at``.
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=TOKEN_MAX_AGE)
    # Long-lived: no expires_at set, created before cutoff
    long_expired = session.exec(
        select(SessionToken).where(
            SessionToken.expires_at.is_(None),  # type: ignore[union-attr]
            SessionToken.created_at < cutoff,
        )
    ).all()
    # Custom-TTL: expires_at set and in the past
    short_expired = session.exec(
        select(SessionToken).where(
            SessionToken.expires_at.is_not(None),  # type: ignore[union-attr]
            SessionToken.expires_at < now,
        )
    ).all()
    for st in list(long_expired) + list(short_expired):
        session.delete(st)
    if long_expired or short_expired:
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


def _resolve_token_to_user(token: str, session: Session) -> Optional[User]:
    """Look up an active session token and return the associated user.

    Respects per-token ``expires_at`` if set (guest sessions), otherwise
    falls back to the global ``TOKEN_MAX_AGE``.
    """
    if not token:
        return None
    st = session.get(SessionToken, token)
    if not st:
        return None
    now = datetime.utcnow()
    if st.expires_at is not None:
        if now > st.expires_at:
            session.delete(st)
            session.commit()
            return None
    else:
        cutoff = now - timedelta(seconds=TOKEN_MAX_AGE)
        if st.created_at < cutoff:
            session.delete(st)
            session.commit()
            return None
    return session.get(User, st.user_id)


def get_current_user(request: Request, session: Session = Depends(get_session)) -> Optional[User]:
    """Resolve the current user from the ``Authorization: Bearer`` header.

    Returns ``None`` if no (valid) token is present. Used internally by the
    policy-dependency layer — router code should use
    :func:`backend.policy.require_permission` instead of calling this directly.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        token = ""
    return _resolve_token_to_user(token, session)


# Role-Hierarchie und gueltige Rollen — Quelle der Wahrheit ist die Policy.
# Diese Dict/Set werden beim ersten Zugriff aus dem Policy-Engine generiert,
# damit es keine Drift zwischen Code und permissions.json gibt.
def _load_roles_from_policy() -> tuple[dict[str, int], set[str]]:
    from backend.policy import get_policy
    p = get_policy()
    hierarchy = {name: role.level for name, role in p.all_roles.items()}
    return hierarchy, set(hierarchy.keys())


class _LazyRoleHierarchy(dict):
    _loaded = False

    def _ensure(self):
        if not self._loaded:
            hierarchy, _ = _load_roles_from_policy()
            super().update(hierarchy)
            self._loaded = True

    def __getitem__(self, key):
        self._ensure()
        return super().__getitem__(key)

    def get(self, key, default=None):
        self._ensure()
        return super().get(key, default)

    def __contains__(self, key):
        self._ensure()
        return super().__contains__(key)

    def __iter__(self):
        self._ensure()
        return super().__iter__()


class _LazyValidRoles(set):
    _loaded = False

    def _ensure(self):
        if not self._loaded:
            _, roles = _load_roles_from_policy()
            for r in roles:
                super().add(r)
            self._loaded = True

    def __contains__(self, item):
        self._ensure()
        return super().__contains__(item)

    def __iter__(self):
        self._ensure()
        return super().__iter__()


ROLE_HIERARCHY = _LazyRoleHierarchy()
VALID_ROLES = _LazyValidRoles()


def _user_response(user: User, session: Session) -> dict:
    """Build user response dict including choir info."""
    choir_name = None
    choir_display_mode = "instrumental"
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            choir_name = choir.name
            choir_display_mode = choir.display_mode
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "voice_part": user.voice_part,
        "choir_id": user.choir_id,
        "choir_name": choir_name,
        "choir_display_mode": choir_display_mode,
        "must_change_password": user.must_change_password,
        "can_report_bugs": user.can_report_bugs,
        "view_mode": user.view_mode,
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

    # Gast-User (role=guest) koennen sich nicht per Passwort einloggen —
    # der Zugang erfolgt ausschliesslich ueber einen eingeloesten
    # Guest-Link (POST /api/guest-links/redeem).
    if user.role == "guest":
        _record_login_attempt(ip)
        raise HTTPException(401, "Invalid credentials")

    _cleanup_expired_tokens(session)

    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    token = _create_token(user.id, session)
    return {"token": token, "user": _user_response(user, session)}


@router.get("/me")
def get_me(
    user: User = Depends(require_permission("profile.read")),
    session: Session = Depends(get_session),
):
    return _user_response(user, session)


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
    return ActionResponse.success(data=_user_response(user, session))


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
    if not _verify_password(old_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen haben")

    user.password_hash = _hash_password(new_password)
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
    # Look up choir by invite code
    choir = session.exec(select(Choir).where(Choir.invite_code == invite_code)).first()
    if not choir:
        # Backward compat: check old AppSettings registration_code
        settings = session.get(AppSettings, 1)
        expected_code = (settings.registration_code if settings else None) or REGISTRATION_CODE
        if not expected_code or invite_code != expected_code:
            _record_login_attempt(ip)
            raise HTTPException(403, "Ungueltiger Einladungscode")
        # Assign to default (first) choir
        choir = session.exec(select(Choir)).first()
        if not choir:
            raise HTTPException(500, "Kein Chor konfiguriert")

    # Validate voice_part against choir's Stimme labels
    if voice_part:
        valid_parts = _valid_voice_parts(session, choir.id)
        if valid_parts and voice_part not in valid_parts:
            raise HTTPException(400, f"Stimmgruppe muss eine der folgenden sein: {', '.join(sorted(valid_parts))}")

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
        choir_id=choir.id,
        view_mode=choir.default_view_mode,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = _create_token(user.id, session)
    return {"token": token, "user": _user_response(user, session)}


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
