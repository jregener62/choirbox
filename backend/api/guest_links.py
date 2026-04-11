"""Guest-Link API — Einmal-URL-Codes fuer Gast-Zugang.

Endpoints:
    * GET    /api/guest-links            — Admin listet Codes (nur eigener Chor)
    * POST   /api/guest-links            — Admin erzeugt neuen Code
    * DELETE /api/guest-links/{id}       — Admin widerruft Code
    * POST   /api/guest-links/redeem     — public: Code einloesen, Session bekommen
    * GET    /api/guest-links/ttl-config — public: erlaubter Wertebereich fuer TTL
                                           (fuer die Admin-UI ohne Auth-Overhead)

Sicherheit siehe backend/services/guest_link_service.py.
"""

from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session

from backend.api.auth import _create_token, _user_response
from backend.database import get_session
from backend.models.user import User
from backend.policy import require_permission
from backend.schemas import ActionResponse
from backend.services.guest_link_service import (
    GUEST_SESSION_TTL_SECONDS,
    MAX_LINK_TTL_MINUTES,
    MIN_LINK_TTL_MINUTES,
    GuestLinkError,
    create_link,
    link_status,
    list_links,
    redeem_link,
    revoke_link,
)

router = APIRouter(prefix="/guest-links", tags=["guest-links"])


# ---------------------------------------------------------------------------
# Rate-Limiting fuer den public Redeem-Endpoint (separat von Login-Limits)
# ---------------------------------------------------------------------------

_redeem_attempts: dict[str, list[float]] = {}
REDEEM_MAX_ATTEMPTS = 10
REDEEM_WINDOW = 60  # seconds


def _check_redeem_rate_limit(ip: str) -> None:
    now = time.time()
    attempts = _redeem_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < REDEEM_WINDOW]
    _redeem_attempts[ip] = attempts
    if len(attempts) >= REDEEM_MAX_ATTEMPTS:
        raise HTTPException(429, "Zu viele Einloese-Versuche. Bitte warte eine Minute.")


def _record_redeem_attempt(ip: str) -> None:
    _redeem_attempts.setdefault(ip, []).append(time.time())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _link_to_dict(link) -> dict:
    return {
        "id": link.id,
        "label": link.label,
        "created_at": link.created_at.isoformat(),
        "expires_at": link.expires_at.isoformat(),
        "consumed_at": link.consumed_at.isoformat() if link.consumed_at else None,
        "consumed_by_ip": link.consumed_by_ip,
        "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
        "status": link_status(link),
    }


def _client_ip(request: Request) -> str:
    # Behind a reverse proxy (Caddy) the real IP is in X-Forwarded-For.
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Public: TTL-Config (kein Auth noetig, pure Konstanten)
# ---------------------------------------------------------------------------

@router.get("/ttl-config")
def get_ttl_config():
    return {
        "min_minutes": MIN_LINK_TTL_MINUTES,
        "max_minutes": MAX_LINK_TTL_MINUTES,
        "guest_session_ttl_seconds": GUEST_SESSION_TTL_SECONDS,
    }


# ---------------------------------------------------------------------------
# Admin/Chorleiter: CRUD
# ---------------------------------------------------------------------------

@router.get("")
def list_guest_links(
    user: User = Depends(require_permission("guest_links.manage")),
    session: Session = Depends(get_session),
):
    if not user.choir_id:
        return []
    links = list_links(session, user.choir_id)
    return [_link_to_dict(l) for l in links]


@router.post("")
def create_guest_link(
    data: dict,
    user: User = Depends(require_permission("guest_links.manage")),
    session: Session = Depends(get_session),
):
    label = (data.get("label") or "").strip() or None
    ttl_minutes: Optional[int] = data.get("ttl_minutes")
    if ttl_minutes is not None:
        try:
            ttl_minutes = int(ttl_minutes)
        except (TypeError, ValueError):
            raise HTTPException(400, "ttl_minutes muss eine Zahl sein")

    try:
        link, plaintext_token = create_link(
            session, user, label=label, ttl_minutes=ttl_minutes
        )
    except GuestLinkError as e:
        raise HTTPException(400, str(e))

    # Der Klartext-Token ist NUR in dieser einen Response sichtbar.
    body = _link_to_dict(link)
    body["token"] = plaintext_token
    body["redeem_path"] = f"/guest/{plaintext_token}"
    return ActionResponse.success(data=body)


@router.delete("/{link_id}")
def revoke_guest_link(
    link_id: int,
    user: User = Depends(require_permission("guest_links.manage")),
    session: Session = Depends(get_session),
):
    if not user.choir_id:
        raise HTTPException(404, "Link nicht gefunden")
    link = revoke_link(session, link_id, user.choir_id)
    if not link:
        raise HTTPException(404, "Link nicht gefunden")
    return ActionResponse.success(data=_link_to_dict(link))


# ---------------------------------------------------------------------------
# Public: Redeem
# ---------------------------------------------------------------------------

@router.post("/redeem")
def redeem_guest_link(
    data: dict,
    request: Request,
    session: Session = Depends(get_session),
):
    ip = _client_ip(request)
    _check_redeem_rate_limit(ip)

    token = (data.get("token") or "").strip()
    if not token:
        _record_redeem_attempt(ip)
        raise HTTPException(400, "token fehlt")

    ua = request.headers.get("User-Agent", "")[:255]
    try:
        _, guest_user = redeem_link(session, token, ip, ua)
    except GuestLinkError:
        # Einheitliche Fehlermeldung — Angreifer soll nicht unterscheiden
        # koennen zwischen "falsch", "schon benutzt", "widerrufen",
        # "abgelaufen".
        _record_redeem_attempt(ip)
        raise HTTPException(410, "Gast-Link ungueltig oder abgelaufen")

    # Gast-Session mit kurzer TTL
    session_token = _create_token(
        guest_user.id, session, max_age_seconds=GUEST_SESSION_TTL_SECONDS
    )
    return {
        "token": session_token,
        "user": _user_response(guest_user, session),
        "expires_in": GUEST_SESSION_TTL_SECONDS,
    }
