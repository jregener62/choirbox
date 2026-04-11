"""Tests fuer das Policy-System.

Deckt ab:
    * Policy laedt ohne Fehler.
    * Konsistenz: jede FastAPI-Route hat einen Policy-Eintrag.
    * ``PolicyEngine.can`` fuer alle Rollen × Permissions.
    * Developer-Bypass fuer deaktivierte Features.
    * Enforcement via ``require_permission`` (HTTP 401/403) am lebenden
      FastAPI-Testclient.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.policy import get_policy, validate_routes_against_policy
from backend.policy.engine import PolicyEngine, PolicyError


# ---------------------------------------------------------------------------
# Engine-Ebene
# ---------------------------------------------------------------------------

def test_policy_loads_default():
    policy = get_policy()
    assert policy.distribution
    assert policy.active_features
    assert policy.active_permissions


def test_policy_roles_have_levels():
    policy = get_policy()
    roles = policy.all_roles
    for expected in ("guest", "member", "pro-member", "chorleiter", "admin", "developer"):
        assert expected in roles, f"Role {expected} missing from policy"
    # Hierarchy must be strictly ascending in this project's design
    assert roles["guest"].level < roles["member"].level
    assert roles["member"].level < roles["pro-member"].level
    assert roles["pro-member"].level < roles["chorleiter"].level
    assert roles["chorleiter"].level < roles["admin"].level


def test_developer_bypasses_distribution():
    policy = get_policy()
    assert policy.role_bypasses_distribution("developer") is True
    assert policy.role_bypasses_distribution("admin") is False


def test_every_permission_belongs_to_exactly_one_feature():
    policy = get_policy()
    perms_from_features: set[str] = set()
    for f in policy.all_features.values():
        for p in f.permissions:
            assert p not in perms_from_features, f"{p} duplicated"
            perms_from_features.add(p)
    assert perms_from_features == set(policy.all_permissions.keys())


@pytest.mark.parametrize(
    "role, perm, expected",
    [
        # Guest — darf Browsen, Streamen, Transponieren
        ("guest", "browse.read", True),
        ("guest", "stream.play", True),
        ("guest", "transposition.write", True),
        ("guest", "profile.read", True),
        # Guest — darf NICHT schreiben, nicht ins Profil, keine Passwoerter
        ("guest", "favorites.write", False),
        ("guest", "profile.write", False),
        ("guest", "profile.password", False),
        ("guest", "annotations.read", False),
        # Member
        ("member", "favorites.write", True),
        ("member", "annotations.write", True),
        ("member", "labels.manage", False),
        ("member", "documents.delete", False),
        # Pro-Member — GAP #1: darf NICHT mehr loeschen
        ("pro-member", "labels.manage", True),
        ("pro-member", "documents.upload", True),
        ("pro-member", "documents.delete", False),
        # Chorleiter — darf loeschen
        ("chorleiter", "documents.delete", True),
        ("chorleiter", "folders.delete", True),
        ("chorleiter", "folders.create", False),
        ("chorleiter", "users.manage", False),
        # Admin
        ("admin", "users.manage", True),
        ("admin", "folders.create", True),
        ("admin", "choirs.manage", False),
        # Developer — bypasst Distribution, kann alles
        ("developer", "choirs.manage", True),
        ("developer", "dropbox.connect", True),
        ("developer", "users.manage", True),
    ],
)
def test_policy_can(role, perm, expected):
    policy = get_policy()
    allowed, _ = policy.can(role, perm)
    assert allowed is expected, f"{role} / {perm}: expected {expected}, got {allowed}"


def test_unknown_role_and_permission_reasons():
    policy = get_policy()
    assert policy.can("hacker", "browse.read") == (False, "unknown_role")
    assert policy.can("guest", "made.up") == (False, "unknown_permission")


# ---------------------------------------------------------------------------
# Route-Konsistenz
# ---------------------------------------------------------------------------

def test_route_policy_consistency():
    from backend.app import app
    # should not raise
    validate_routes_against_policy(app)


# ---------------------------------------------------------------------------
# Minimal-Distribution (Negativ-Test fuer Feature-Gating)
# ---------------------------------------------------------------------------

def test_minimal_distribution_disables_non_core_features(tmp_path, monkeypatch):
    """Simulate a distribution that disables 'favorites'. Members should be
    locked out of favorites.write, but developers should still bypass it."""
    import json
    import shutil

    src = __import__("backend.policy.engine", fromlist=["POLICY_FILE"]).POLICY_FILE
    dst = tmp_path / "permissions.json"
    shutil.copy(src, dst)

    data = json.loads(dst.read_text())
    data["distributions"]["minimal"] = {
        "description": "Test-Minimal",
        "features": ["core", "browse", "transposition"],
    }
    dst.write_text(json.dumps(data))

    engine = PolicyEngine(policy_file=dst, distribution="minimal")
    # favorites.write is NOT in minimal -> feature_not_available
    assert engine.can("member", "favorites.write") == (False, "feature_not_available")
    # browse.read IS in minimal -> ok
    assert engine.can("guest", "browse.read") == (True, "ok")
    # Developer bypasses distribution
    assert engine.can("developer", "favorites.write") == (True, "ok")


def test_invalid_distribution_raises():
    import shutil
    import tempfile
    from pathlib import Path

    src = __import__("backend.policy.engine", fromlist=["POLICY_FILE"]).POLICY_FILE
    with tempfile.TemporaryDirectory() as d:
        dst = Path(d) / "permissions.json"
        shutil.copy(src, dst)
        with pytest.raises(PolicyError, match="is not a defined distribution"):
            PolicyEngine(policy_file=dst, distribution="demo")


# ---------------------------------------------------------------------------
# HTTP-Ebene: Enforcement via require_permission am lebenden Endpoint
# ---------------------------------------------------------------------------

def test_anonymous_request_returns_401(client: TestClient):
    r = client.get("/api/favorites")
    assert r.status_code == 401


def test_member_can_access_favorites(client: TestClient, member):
    _, headers = member
    r = client.get("/api/favorites", headers=headers)
    assert r.status_code == 200


def test_guest_cannot_write_favorites(client: TestClient, user_factory):
    _, headers = user_factory(role="guest")
    r = client.post(
        "/api/favorites",
        json={"dropbox_path": "/Song/audio.mp3"},
        headers=headers,
    )
    assert r.status_code == 403
    body = r.json()
    # require_permission returns structured detail
    assert body["detail"]["error"] == "permission_denied"
    assert body["detail"]["permission"] == "favorites.write"
    assert body["detail"]["required_role"] == "member"


def test_guest_can_read_browse(client: TestClient, user_factory):
    # /api/dropbox/browse needs dropbox connected; we don't mock it, so we
    # just assert the auth layer allows guest through (status 400 = "Dropbox
    # not connected" is fine — that means role check passed).
    _, headers = user_factory(role="guest")
    r = client.get("/api/dropbox/browse?path=", headers=headers)
    assert r.status_code != 401
    assert r.status_code != 403


def test_pro_member_cannot_delete_document(client: TestClient, pro_member):
    """GAP #1 regression test: pro-member must no longer delete documents."""
    _, headers = pro_member
    # 403 should come from the permission check, not from a 404 for a
    # missing document. We call the endpoint with a doc_id that does not
    # exist; permission_denied fires first.
    r = client.delete("/api/documents/999999", headers=headers)
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "permission_denied"
    assert r.json()["detail"]["permission"] == "documents.delete"


def test_chorleiter_reaches_delete_handler(client: TestClient, user_factory):
    """GAP #1 regression test: chorleiter passes the permission gate and
    hits the real handler (which then 404s because the doc doesn't exist)."""
    _, headers = user_factory(role="chorleiter")
    r = client.delete("/api/documents/999999", headers=headers)
    # permission check passed — 404 from the handler, not 403
    assert r.status_code == 404


def test_developer_can_manage_choirs(client: TestClient, user_factory):
    _, headers = user_factory(role="developer")
    r = client.get("/api/admin/choirs", headers=headers)
    assert r.status_code == 200


def test_admin_cannot_manage_choirs(client: TestClient, admin):
    _, headers = admin
    r = client.get("/api/admin/choirs", headers=headers)
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "permission_denied"
