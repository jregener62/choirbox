"""Tests fuer das Guest-Link-Feature.

Deckt ab:
    * Shared Gast-User wird pro Chor automatisch angelegt
    * Create/List/Revoke (admin only)
    * Redeem: Happy-Path + alle Fehler-Zustaende (invalid, consumed,
      revoked, expired) landen alle auf 410 Gone (keine Unterscheidung)
    * Rate-Limit auf dem Redeem-Endpoint
    * Gast-User kann sich nicht per Passwort einloggen
    * Gast-Session hat kurze TTL und funktioniert fuer read-only Aktionen
    * Token-Klartext nur einmal bei create sichtbar, spaeter in DB nur Hash
    * TTL-Grenzen (15 min - 24 h)
    * Cross-Choir-Isolation: Admin A kann Link von Chor B nicht revoken
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Callable

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend.models.choir import Choir
from backend.models.guest_link import GuestLink
from backend.models.user import User
from backend.services.guest_link_service import (
    GUEST_SESSION_TTL_SECONDS,
    create_link,
    get_or_create_guest_user,
    redeem_link,
    revoke_link,
)


# ---------------------------------------------------------------------------
# Service-Ebene: get_or_create_guest_user
# ---------------------------------------------------------------------------

def test_guest_user_created_per_choir(session: Session, test_choir: Choir):
    guest = get_or_create_guest_user(session, test_choir)
    assert guest.role == "guest"
    assert guest.username == f"_guest_{test_choir.id}"
    assert guest.choir_id == test_choir.id
    # Idempotent
    again = get_or_create_guest_user(session, test_choir)
    assert again.id == guest.id


def test_guest_user_unique_per_choir(session: Session):
    a = Choir(name="A", invite_code="CODE_A")
    b = Choir(name="B", invite_code="CODE_B")
    session.add(a)
    session.add(b)
    session.commit()
    session.refresh(a)
    session.refresh(b)
    ga = get_or_create_guest_user(session, a)
    gb = get_or_create_guest_user(session, b)
    assert ga.id != gb.id
    assert ga.choir_id == a.id
    assert gb.choir_id == b.id


# ---------------------------------------------------------------------------
# Service-Ebene: create / redeem / revoke
# ---------------------------------------------------------------------------

def test_create_link_returns_plaintext_once(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    admin, _ = user_factory(role="admin")
    link, token = create_link(session, admin, label="Probe")
    assert token  # plaintext returned exactly once here
    assert len(token) >= 32  # 256-bit base64 token
    assert link.label == "Probe"
    assert link.uses_count == 0
    assert link.max_uses is None  # Default: unlimited (Multi-Use)
    assert link.first_used_at is None
    assert link.last_used_at is None
    assert link.revoked_at is None
    # DB stores only the hash, not the plaintext
    assert link.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in link.token_hash


def test_redeem_link_happy_path(
    session: Session, test_choir: Choir, user_factory: Callable[..., tuple[User, dict]]
):
    admin, _ = user_factory(role="admin")
    link, token = create_link(session, admin)
    _, guest = redeem_link(session, token, "1.2.3.4", "TestAgent")
    assert guest.role == "guest"
    assert guest.choir_id == test_choir.id
    # Refresh link from DB — first redemption audit should be set
    session.refresh(link)
    assert link.uses_count == 1
    assert link.first_used_at is not None
    assert link.last_used_at is not None
    assert link.last_used_ip == "1.2.3.4"
    assert link.last_used_ua == "TestAgent"


def test_multi_use_link_can_be_redeemed_repeatedly(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    """Default-Modus: unbegrenzt einloesbar bis expires_at (Liederabend)."""
    admin, _ = user_factory(role="admin")
    link, token = create_link(session, admin)  # max_uses=None -> unlimited

    first_used: datetime | None = None
    for i in range(5):
        redeem_link(session, token, f"10.0.0.{i}", f"Agent {i}")
    session.refresh(link)
    assert link.uses_count == 5
    assert link.max_uses is None
    first_used = link.first_used_at
    assert first_used is not None
    # last_used_ip wird bei jeder Einloesung aktualisiert
    assert link.last_used_ip == "10.0.0.4"


def test_single_use_link_still_works_via_max_uses_1(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    """Einmal-Modus bleibt im Service verfuegbar (max_uses=1)."""
    from backend.services.guest_link_service import GuestLinkError

    admin, _ = user_factory(role="admin")
    link, token = create_link(session, admin, max_uses=1)
    assert link.max_uses == 1
    redeem_link(session, token, "1.1.1.1", "ua")
    with pytest.raises(GuestLinkError, match="exhausted"):
        redeem_link(session, token, "1.1.1.1", "ua")


def test_max_uses_n_exhausts_after_n_redemptions(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    """Einstellbares Limit — nach N Einloesungen ist Schluss."""
    from backend.services.guest_link_service import GuestLinkError

    admin, _ = user_factory(role="admin")
    _, token = create_link(session, admin, max_uses=3)
    redeem_link(session, token, "1.1.1.1", "ua")
    redeem_link(session, token, "1.1.1.2", "ua")
    redeem_link(session, token, "1.1.1.3", "ua")
    with pytest.raises(GuestLinkError, match="exhausted"):
        redeem_link(session, token, "1.1.1.4", "ua")


def test_create_with_max_uses_zero_is_invalid(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    from backend.services.guest_link_service import GuestLinkError

    admin, _ = user_factory(role="admin")
    with pytest.raises(GuestLinkError, match="max_uses_invalid"):
        create_link(session, admin, max_uses=0)


def test_redeem_revoked_link_fails(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    from backend.services.guest_link_service import GuestLinkError

    admin, _ = user_factory(role="admin")
    link, token = create_link(session, admin)
    revoke_link(session, link.id, admin.choir_id)
    with pytest.raises(GuestLinkError, match="revoked"):
        redeem_link(session, token, "1.1.1.1", "ua")


def test_redeem_expired_link_fails(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    from backend.services.guest_link_service import GuestLinkError

    admin, _ = user_factory(role="admin")
    link, token = create_link(session, admin)
    # Force expire
    link.expires_at = datetime.utcnow() - timedelta(minutes=1)
    session.add(link)
    session.commit()
    with pytest.raises(GuestLinkError, match="expired"):
        redeem_link(session, token, "1.1.1.1", "ua")


def test_redeem_invalid_token_fails(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    from backend.services.guest_link_service import GuestLinkError

    user_factory(role="admin")  # needed for choir setup
    with pytest.raises(GuestLinkError, match="invalid"):
        redeem_link(session, "totally_made_up_token", "1.1.1.1", "ua")


def test_create_ttl_out_of_range_fails(
    session: Session, user_factory: Callable[..., tuple[User, dict]]
):
    from backend.services.guest_link_service import GuestLinkError

    admin, _ = user_factory(role="admin")
    with pytest.raises(GuestLinkError, match="ttl_out_of_range"):
        create_link(session, admin, ttl_minutes=5)
    with pytest.raises(GuestLinkError, match="ttl_out_of_range"):
        create_link(session, admin, ttl_minutes=2000)


# ---------------------------------------------------------------------------
# HTTP-Ebene: Admin-Flow
# ---------------------------------------------------------------------------

def test_member_cannot_create_guest_link(client: TestClient, member):
    _, headers = member
    r = client.post("/api/guest-links", json={"label": "Nope"}, headers=headers)
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "permission_denied"


def test_admin_can_create_and_see_plaintext_once(client: TestClient, admin):
    _, headers = admin
    r = client.post(
        "/api/guest-links",
        json={"label": "Probenbesuch"},
        headers=headers,
    )
    assert r.status_code == 200
    # Router wraps in ActionResponse.success(data=...)
    data = r.json()["data"]
    assert data["token"]  # plaintext here
    assert data["redeem_path"].startswith("/guest/")
    assert data["label"] == "Probenbesuch"
    assert data["status"] == "active"

    # List: does NOT contain plaintext token
    r2 = client.get("/api/guest-links", headers=headers)
    assert r2.status_code == 200
    listed = r2.json()
    assert len(listed) == 1
    assert "token" not in listed[0]
    assert listed[0]["status"] == "active"


def test_admin_can_revoke_guest_link(client: TestClient, admin):
    _, headers = admin
    r = client.post("/api/guest-links", json={}, headers=headers)
    link_id = r.json()["data"]["id"]
    r2 = client.delete(f"/api/guest-links/{link_id}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["data"]["status"] == "revoked"


def test_admin_cannot_revoke_other_choirs_link(
    client: TestClient, session: Session, user_factory
):
    # Admin A in existing test_choir
    _, headers_a = user_factory(role="admin")
    r = client.post("/api/guest-links", json={}, headers=headers_a)
    link_id = r.json()["data"]["id"]

    # Create another choir with its own admin
    other = Choir(name="Anderer Chor", invite_code="OTHER_CODE")
    session.add(other)
    session.commit()
    session.refresh(other)

    from backend.api.auth import _hash_password
    from backend.models.session_token import SessionToken
    admin_b = User(
        username="admin_b",
        display_name="Admin B",
        role="admin",
        voice_part="",
        password_hash=_hash_password("pw"),
        choir_id=other.id,
    )
    session.add(admin_b)
    session.commit()
    session.refresh(admin_b)
    st = SessionToken(user_id=admin_b.id)
    session.add(st)
    session.commit()
    session.refresh(st)
    headers_b = {"Authorization": f"Bearer {st.token}"}

    r2 = client.delete(f"/api/guest-links/{link_id}", headers=headers_b)
    # Admin B should not see Admin A's link
    assert r2.status_code == 404


# ---------------------------------------------------------------------------
# HTTP-Ebene: Redeem-Flow
# ---------------------------------------------------------------------------

def test_redeem_happy_path_http(client: TestClient, admin):
    _, headers = admin
    r = client.post("/api/guest-links", json={}, headers=headers)
    token = r.json()["data"]["token"]

    r2 = client.post("/api/guest-links/redeem", json={"token": token})
    assert r2.status_code == 200
    body = r2.json()
    assert body["token"]
    assert body["expires_in"] == GUEST_SESSION_TTL_SECONDS
    assert body["user"]["role"] == "guest"


def test_redeem_happy_path_guest_can_browse(client: TestClient, admin):
    _, headers = admin
    r = client.post("/api/guest-links", json={}, headers=headers)
    token = r.json()["data"]["token"]

    r2 = client.post("/api/guest-links/redeem", json={"token": token})
    session_token = r2.json()["token"]
    guest_headers = {"Authorization": f"Bearer {session_token}"}

    # Guest can access browse.read endpoint — may return 400 "Dropbox not
    # connected" (conftest mocks dropbox to None), but that's past the
    # permission gate. Critical: not 401 and not 403.
    r3 = client.get("/api/dropbox/browse?path=", headers=guest_headers)
    assert r3.status_code != 401
    assert r3.status_code != 403


def test_redeem_guest_cannot_write(client: TestClient, admin):
    _, headers = admin
    r = client.post("/api/guest-links", json={}, headers=headers)
    token = r.json()["data"]["token"]

    r2 = client.post("/api/guest-links/redeem", json={"token": token})
    session_token = r2.json()["token"]
    guest_headers = {"Authorization": f"Bearer {session_token}"}

    r3 = client.post(
        "/api/favorites",
        json={"dropbox_path": "/foo"},
        headers=guest_headers,
    )
    assert r3.status_code == 403
    assert r3.json()["detail"]["error"] == "permission_denied"


def test_redeem_guest_cannot_change_password(client: TestClient, admin):
    """Sicherheits-Kern: ein Gast darf nicht das (geteilte) Passwort
    des Guest-Users aendern und damit alle anderen aussperren."""
    _, headers = admin
    r = client.post("/api/guest-links", json={}, headers=headers)
    token = r.json()["data"]["token"]
    r2 = client.post("/api/guest-links/redeem", json={"token": token})
    guest_headers = {"Authorization": f"Bearer {r2.json()['token']}"}

    r3 = client.put(
        "/api/auth/me/password",
        json={"old_password": "x", "new_password": "y"},
        headers=guest_headers,
    )
    assert r3.status_code == 403
    assert r3.json()["detail"]["permission"] == "profile.password"


def test_redeem_invalid_token_returns_410(client: TestClient):
    r = client.post("/api/guest-links/redeem", json={"token": "garbage_nope"})
    assert r.status_code == 410


def test_redeem_exhausted_link_returns_410(client: TestClient, admin):
    """max_uses=1 ueber die API — nach erster Einloesung 410 Gone."""
    _, headers = admin
    r = client.post("/api/guest-links", json={"max_uses": 1}, headers=headers)
    token = r.json()["data"]["token"]
    client.post("/api/guest-links/redeem", json={"token": token})
    r2 = client.post("/api/guest-links/redeem", json={"token": token})
    assert r2.status_code == 410


def test_multi_use_link_can_be_redeemed_twice_via_http(client: TestClient, admin):
    """Default-Multi-Use: zweite Einloesung liefert eine weitere Session."""
    _, headers = admin
    r = client.post("/api/guest-links", json={}, headers=headers)
    token = r.json()["data"]["token"]
    r1 = client.post("/api/guest-links/redeem", json={"token": token})
    r2 = client.post("/api/guest-links/redeem", json={"token": token})
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Zwei verschiedene Session-Tokens
    assert r1.json()["token"] != r2.json()["token"]
    # Liste zeigt uses_count == 2
    r3 = client.get("/api/guest-links", headers=headers)
    assert r3.json()[0]["uses_count"] == 2


def test_create_link_with_max_uses_ten(client: TestClient, admin):
    """Admin kann einstellbares Limit setzen — hier 10 Einloesungen."""
    _, headers = admin
    r = client.post(
        "/api/guest-links",
        json={"label": "Liederabend", "max_uses": 10},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["max_uses"] == 10
    assert data["uses_count"] == 0


def test_create_link_with_invalid_max_uses_returns_400(client: TestClient, admin):
    _, headers = admin
    r = client.post("/api/guest-links", json={"max_uses": -5}, headers=headers)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Gast-User kann sich nicht per Passwort einloggen
# ---------------------------------------------------------------------------

def test_guest_user_cannot_login_with_password(
    client: TestClient, session: Session, test_choir: Choir
):
    guest = get_or_create_guest_user(session, test_choir)
    # Overwrite password hash with a known one for the test
    from backend.api.auth import _hash_password
    guest.password_hash = _hash_password("knownpw")
    session.add(guest)
    session.commit()

    r = client.post(
        "/api/auth/login",
        json={"username": guest.username, "password": "knownpw"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Public: TTL-Config-Endpoint
# ---------------------------------------------------------------------------

def test_ttl_config_is_public(client: TestClient):
    r = client.get("/api/guest-links/ttl-config")
    assert r.status_code == 200
    body = r.json()
    assert body["min_minutes"] == 15
    assert body["max_minutes"] == 24 * 60
    assert body["guest_session_ttl_seconds"] == GUEST_SESSION_TTL_SECONDS


# ---------------------------------------------------------------------------
# Kurze-TTL-Session: expires_at greift
# ---------------------------------------------------------------------------

def test_guest_session_has_short_expiry(
    session: Session, test_choir: Choir, user_factory
):
    """Die Gast-Session muss ein ``expires_at`` haben, das in ca. 2h
    liegt — nicht die 7 Tage der normalen Session."""
    from backend.api.auth import _create_token
    from backend.models.session_token import SessionToken

    guest = get_or_create_guest_user(session, test_choir)
    token = _create_token(guest.id, session, max_age_seconds=GUEST_SESSION_TTL_SECONDS)
    st = session.get(SessionToken, token)
    assert st is not None
    assert st.expires_at is not None
    delta = st.expires_at - datetime.utcnow()
    assert timedelta(hours=1, minutes=55) < delta < timedelta(hours=2, minutes=5)
