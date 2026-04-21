"""Guest-Link-Service — Business-Logik fuer Gast-Zugangs-Codes.

Trennt Business-Logik von Router-Code (siehe CLAUDE.md Service-Layer-
Pattern). Der Router-Code ruft diese Funktionen auf, macht aber selbst
keine DB-Manipulationen.

Sicherheits-Prinzipien:
    * Klartext-Token nur bei create_link im Rueckgabewert; DB speichert
      ausschliesslich sha256(token).
    * Konfigurierbare Link-TTL aus AppSettings (Default 60 min, Bereich
      15 min - 24 h).
    * Gast-Session nach Einloesung hat fix 2h TTL (unabhaengig von der
      Link-TTL und von ``max_uses``).
    * Standardmaessig **mehrfach einloesbar** (``max_uses=None``). Ueber
      ``max_uses=1`` wird ein klassischer Einmal-Code erzeugt — das ist
      fuer die aktuelle UI nicht verfuegbar, bleibt aber im Service,
      damit spaetere Demo-Versionen den Einmal-Modus nutzen koennen.
    * Audit-Log: last_used_ip, last_used_ua (letzte Einloesung) werden
      bei jeder Einloesung ueberschrieben; first_used_at bleibt konstant.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from backend.models.app_settings import AppSettings
from backend.models.choir import Choir
from backend.models.guest_link import GuestLink
from backend.models.user import User

# Erlaubte TTL-Spanne fuer Guest-Links. Die Gast-Session laeuft jetzt
# genau bis zum Link-Ablauf (siehe redeem-Handler). Damit kann ein Admin
# durch Setzen einer kurzen Link-TTL auch die Session-Dauer begrenzen.
MIN_LINK_TTL_MINUTES = 60
MAX_LINK_TTL_MINUTES = 36 * 60

# Obergrenze fuer die Gast-Session in Sekunden — identisch mit der Link-
# max-TTL. Wird vom /ttl-config-Endpoint zurueckgegeben (informativ).
MAX_GUEST_SESSION_TTL_SECONDS = MAX_LINK_TTL_MINUTES * 60

# Erlaubte Ansichts-Modi fuer Gast-Sessions.
VALID_VIEW_MODES = {"songs", "texts"}


class GuestLinkError(Exception):
    """Raised for expected service-level failures."""


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _get_settings(session: Session) -> AppSettings:
    settings = session.get(AppSettings, 1)
    if not settings:
        settings = AppSettings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def get_or_create_guest_user(session: Session, choir: Choir) -> User:
    """Return the shared guest user for a choir. Create it if missing.

    The guest user is a single shared identity per choir. Its username is
    derived from the choir ID so it's unique across the whole instance.
    Password is a random throwaway (never used — password-login is
    blocked for guest users in auth.py).
    """
    username = f"_guest_{choir.id}"
    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        return existing

    from backend.services.auth_service import hash_password

    guest = User(
        username=username,
        display_name="Gast",
        role="guest",
        voice_part="",
        # Random never-to-be-used password. Login is blocked for role=guest.
        password_hash=hash_password(secrets.token_urlsafe(32)),
        choir_id=choir.id,
    )
    session.add(guest)
    session.commit()
    session.refresh(guest)
    return guest


def ensure_guest_users_for_all_choirs(session: Session) -> int:
    """Seed helper: ensure every choir has a shared guest user. Returns
    the number of newly created guest users."""
    created = 0
    for choir in session.exec(select(Choir)).all():
        before = session.exec(
            select(User).where(User.username == f"_guest_{choir.id}")
        ).first()
        if not before:
            get_or_create_guest_user(session, choir)
            created += 1
    return created


def create_link(
    session: Session,
    creator: User,
    label: Optional[str] = None,
    ttl_minutes: Optional[int] = None,
    max_uses: Optional[int] = None,
    view_mode: str = "songs",
) -> tuple[GuestLink, str]:
    """Create a new guest link and return (model, plaintext_token).

    ``max_uses`` defaults to ``None`` (unlimited — Multi-Use). Pass
    ``max_uses=1`` for a classic single-use code. Any other positive
    integer caps the redemptions.

    The plaintext token is returned **once** here — the caller (router)
    is responsible for passing it back to the admin UI. After this call
    the plaintext is NOT persisted anywhere.
    """
    if not creator.choir_id:
        raise GuestLinkError("creator_has_no_choir")

    settings = _get_settings(session)
    effective_ttl = ttl_minutes if ttl_minutes is not None else settings.guest_link_ttl_minutes
    if effective_ttl < MIN_LINK_TTL_MINUTES or effective_ttl > MAX_LINK_TTL_MINUTES:
        raise GuestLinkError(
            f"ttl_out_of_range:{MIN_LINK_TTL_MINUTES}-{MAX_LINK_TTL_MINUTES}"
        )
    if max_uses is not None and max_uses < 1:
        raise GuestLinkError("max_uses_invalid")
    if view_mode not in VALID_VIEW_MODES:
        raise GuestLinkError(f"view_mode_invalid:{','.join(sorted(VALID_VIEW_MODES))}")

    # Ensure the shared guest user exists for this choir
    choir = session.get(Choir, creator.choir_id)
    if not choir:
        raise GuestLinkError("choir_not_found")
    get_or_create_guest_user(session, choir)

    token = secrets.token_urlsafe(32)  # 256 bit of entropy
    link = GuestLink(
        choir_id=choir.id,
        token_hash=_hash_token(token),
        label=(label or None),
        created_by_user_id=creator.id,
        expires_at=datetime.utcnow() + timedelta(minutes=effective_ttl),
        max_uses=max_uses,
        view_mode=view_mode,
    )
    session.add(link)
    session.commit()
    session.refresh(link)
    return link, token


def list_links(session: Session, choir_id: str) -> list[GuestLink]:
    """Return all guest links for a choir, newest first."""
    return list(
        session.exec(
            select(GuestLink)
            .where(GuestLink.choir_id == choir_id)
            .order_by(GuestLink.created_at.desc())  # type: ignore[attr-defined]
        ).all()
    )


def revoke_link(session: Session, link_id: int, choir_id: str) -> Optional[GuestLink]:
    """Mark a link as revoked. Returns the updated link, or None if not
    found / belongs to another choir."""
    link = session.get(GuestLink, link_id)
    if not link or link.choir_id != choir_id:
        return None
    if link.revoked_at is None:
        link.revoked_at = datetime.utcnow()
        session.add(link)
        session.commit()
        session.refresh(link)
    return link


def redeem_link(
    session: Session,
    token: str,
    request_ip: Optional[str],
    request_ua: Optional[str],
) -> tuple[GuestLink, User]:
    """Consume a guest-link token and return (link, guest_user).

    Raises GuestLinkError with one of:
        * ``invalid``   — token not found (wrong or never existed)
        * ``revoked``   — manually invalidated by admin
        * ``expired``   — past expires_at
        * ``exhausted`` — max_uses reached

    The caller should map all of these to the same HTTP status (410 Gone)
    with the same error message to avoid leaking information about which
    case occurred.
    """
    token_hash = _hash_token(token)
    link = session.exec(
        select(GuestLink).where(GuestLink.token_hash == token_hash)
    ).first()
    if not link:
        raise GuestLinkError("invalid")

    now = datetime.utcnow()
    if link.revoked_at is not None:
        raise GuestLinkError("revoked")
    if link.expires_at < now:
        raise GuestLinkError("expired")
    if link.max_uses is not None and link.uses_count >= link.max_uses:
        raise GuestLinkError("exhausted")

    choir = session.get(Choir, link.choir_id)
    if not choir:
        raise GuestLinkError("choir_not_found")

    guest_user = get_or_create_guest_user(session, choir)

    # Count this redemption + audit log.
    link.uses_count += 1
    if link.first_used_at is None:
        link.first_used_at = now
    link.last_used_at = now
    link.last_used_ip = (request_ip or "")[:64] or None
    link.last_used_ua = (request_ua or "")[:255] or None
    session.add(link)
    session.commit()
    session.refresh(link)

    return link, guest_user


def link_status(link: GuestLink) -> str:
    """Return a user-facing status string for the admin UI."""
    if link.revoked_at is not None:
        return "revoked"
    if link.expires_at < datetime.utcnow():
        return "expired"
    if link.max_uses is not None and link.uses_count >= link.max_uses:
        return "exhausted"
    return "active"
