"""Auth service — Passwoerter, Session-Tokens, Rollen und User-DTO.

Kapselt die Business-Logik, die frueher als private Helfer in api/auth.py
lag und von anderen Routern (admin, guest_links), dem Seeder und Services
(guest_link_service, folder_types) per Cross-Modul-Import angesprochen wurde.

Die API-Router sollen diese Funktionen aus dem Service importieren; damit
bleibt api/auth.py ein duenner Wrapper um Login/Register/Logout-Endpoints.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from backend.models.choir import Choir
from backend.models.session_token import SessionToken
from backend.models.user import User

TOKEN_MAX_AGE = 7 * 24 * 3600  # 7 Tage
MIN_PASSWORD_LENGTH = 10


# ---------------------------------------------------------------------------
# Passwoerter (PBKDF2-HMAC-SHA256, 100_000 iterations)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a password with a random salt using PBKDF2."""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${h.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        salt, h = password_hash.split("$", 1)
        expected = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
        return hmac.compare_digest(expected.hex(), h)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Session-Tokens
# ---------------------------------------------------------------------------

def create_token(
    user_id: str,
    session: Session,
    max_age_seconds: Optional[int] = None,
) -> str:
    """Create a new session token and persist it.

    If ``max_age_seconds`` is given the token gets a hard ``expires_at``
    (used for guest sessions with short TTL). Otherwise ``TOKEN_MAX_AGE``
    applies (7 days).
    """
    expires_at: Optional[datetime] = None
    if max_age_seconds is not None:
        expires_at = datetime.utcnow() + timedelta(seconds=max_age_seconds)
    st = SessionToken(user_id=user_id, expires_at=expires_at)
    session.add(st)
    session.commit()
    session.refresh(st)
    return st.token


def cleanup_expired_tokens(session: Session) -> None:
    """Remove expired tokens (long-lived past global TTL + custom-TTL past expires_at)."""
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=TOKEN_MAX_AGE)
    long_expired = session.exec(
        select(SessionToken).where(
            SessionToken.expires_at.is_(None),  # type: ignore[union-attr]
            SessionToken.created_at < cutoff,
        )
    ).all()
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


def resolve_token_to_user(token: str, session: Session) -> Optional[User]:
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


# ---------------------------------------------------------------------------
# Rollen — lazy geladen aus der Policy (vermeidet Drift mit permissions.json)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Voice parts + User-DTO
# ---------------------------------------------------------------------------

def valid_voice_parts(session: Session, choir_id: str) -> set[str]:
    """Load valid voice part names from the choir's Stimme labels."""
    from backend.models.label import Label
    labels = session.exec(
        select(Label).where(Label.choir_id == choir_id, Label.category == "Stimme")
    ).all()
    return {l.name for l in labels}


def user_response(user: User, session: Session) -> dict:
    """Build the user response dict (incl. choir info) used by auth endpoints."""
    choir_name = None
    if user.choir_id:
        choir = session.get(Choir, user.choir_id)
        if choir:
            choir_name = choir.name
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "voice_part": user.voice_part,
        "choir_id": user.choir_id,
        "choir_name": choir_name,
        "must_change_password": user.must_change_password,
        "can_report_bugs": user.can_report_bugs,
        "view_mode": user.view_mode,
    }
