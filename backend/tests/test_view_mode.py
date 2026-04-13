"""Tests fuer User.view_mode (Member-seitiger "Nur Texte"-Modus).

Deckt ab:
    * Default ist "songs"
    * PUT /admin/users/{id} setzt view_mode mit Validierung
    * POST /admin/users/bulk-view-mode schaltet nur Member/Pro-Member um
    * Chorleiter/Admin werden uebersprungen
    * all-members-Shortcut und explizite Liste funktionieren
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.models.user import User


def _reload(session: Session, user: User) -> User:
    session.expire_all()
    return session.get(User, user.id)  # type: ignore[return-value]


def test_default_view_mode_is_songs(client: TestClient, admin):
    _, headers = admin
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["view_mode"] == "songs"


def test_put_view_mode_valid(client: TestClient, session: Session, admin, member):
    _, admin_headers = admin
    member_user, _ = member
    res = client.put(
        f"/api/admin/users/{member_user.id}",
        headers=admin_headers,
        json={"view_mode": "texts"},
    )
    assert res.status_code == 200
    assert _reload(session, member_user).view_mode == "texts"


def test_put_view_mode_invalid(client: TestClient, admin, member):
    _, admin_headers = admin
    member_user, _ = member
    res = client.put(
        f"/api/admin/users/{member_user.id}",
        headers=admin_headers,
        json={"view_mode": "invalid"},
    )
    assert res.status_code == 400


def test_bulk_all_members_updates_only_applicable_roles(
    client: TestClient, session: Session, admin, user_factory
):
    _, admin_headers = admin
    member_u, _ = user_factory(role="member")
    pro_u, _ = user_factory(role="pro-member")
    leader_u, _ = user_factory(role="chorleiter")

    res = client.post(
        "/api/admin/users/bulk-view-mode",
        headers=admin_headers,
        json={"view_mode": "texts", "user_ids": "all-members"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["outcome"] == "success"
    # Member + Pro-Member werden umgeschaltet; Chorleiter/Admin nicht.
    assert body["data"]["updated"] == 2
    assert body["data"]["skipped"] == 0

    assert _reload(session, member_u).view_mode == "texts"
    assert _reload(session, pro_u).view_mode == "texts"
    assert _reload(session, leader_u).view_mode == "songs"


def test_bulk_with_explicit_user_ids_skips_non_applicable(
    client: TestClient, session: Session, admin, user_factory
):
    _, admin_headers = admin
    member_u, _ = user_factory(role="member")
    leader_u, _ = user_factory(role="chorleiter")

    res = client.post(
        "/api/admin/users/bulk-view-mode",
        headers=admin_headers,
        json={"view_mode": "texts", "user_ids": [member_u.id, leader_u.id]},
    )
    assert res.status_code == 200
    assert res.json()["data"] == {"updated": 1, "skipped": 1}
    assert _reload(session, member_u).view_mode == "texts"
    assert _reload(session, leader_u).view_mode == "songs"


def test_bulk_invalid_view_mode_400(client: TestClient, admin):
    _, admin_headers = admin
    res = client.post(
        "/api/admin/users/bulk-view-mode",
        headers=admin_headers,
        json={"view_mode": "foo", "user_ids": "all-members"},
    )
    assert res.status_code == 400


def test_bulk_empty_user_ids_400(client: TestClient, admin):
    _, admin_headers = admin
    res = client.post(
        "/api/admin/users/bulk-view-mode",
        headers=admin_headers,
        json={"view_mode": "texts", "user_ids": []},
    )
    assert res.status_code == 400


def test_bulk_requires_admin_permission(client: TestClient, member):
    _, member_headers = member
    res = client.post(
        "/api/admin/users/bulk-view-mode",
        headers=member_headers,
        json={"view_mode": "texts", "user_ids": "all-members"},
    )
    assert res.status_code == 403
