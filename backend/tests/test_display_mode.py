"""Tests fuer Choir.display_mode — Anzeige-Modus fuer .cho-Dateien.

Orthogonal zu view_mode (songs/texts). Steuert, ob Akkorde angezeigt und
editierbar sind:
    * "vocal"        — Akkorde aus, Akkord-Edit-Tools aus
    * "instrumental" — Akkorde an (bisheriges Verhalten, Default)
    * "gemischt"     — User toggelt pro Song, alle Tools sichtbar
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_default_display_mode_is_instrumental(client: TestClient, admin):
    _, admin_headers = admin
    res = client.get("/api/admin/settings", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["display_mode"] == "instrumental"


def test_set_display_mode_vocal(client: TestClient, admin):
    _, admin_headers = admin
    res = client.put(
        "/api/admin/settings",
        headers=admin_headers,
        json={"display_mode": "vocal"},
    )
    assert res.status_code == 200
    res2 = client.get("/api/admin/settings", headers=admin_headers)
    assert res2.json()["display_mode"] == "vocal"


def test_set_display_mode_gemischt(client: TestClient, admin):
    _, admin_headers = admin
    res = client.put(
        "/api/admin/settings",
        headers=admin_headers,
        json={"display_mode": "gemischt"},
    )
    assert res.status_code == 200
    res2 = client.get("/api/admin/settings", headers=admin_headers)
    assert res2.json()["display_mode"] == "gemischt"


def test_set_display_mode_invalid(client: TestClient, admin):
    _, admin_headers = admin
    res = client.put(
        "/api/admin/settings",
        headers=admin_headers,
        json={"display_mode": "garbage"},
    )
    assert res.status_code == 400


def test_display_mode_in_auth_me(client: TestClient, admin):
    _, admin_headers = admin
    res = client.get("/api/auth/me", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["choir_display_mode"] == "instrumental"


def test_display_mode_in_auth_me_after_change(client: TestClient, admin, member):
    _, admin_headers = admin
    _, member_headers = member
    client.put(
        "/api/admin/settings",
        headers=admin_headers,
        json={"display_mode": "vocal"},
    )
    # Member sieht den neuen Chor-Mode sofort im naechsten /me-Call
    res = client.get("/api/auth/me", headers=member_headers)
    assert res.status_code == 200
    assert res.json()["choir_display_mode"] == "vocal"


def test_display_mode_independent_of_view_mode(client: TestClient, admin):
    """display_mode und view_mode sind unabhaengige Achsen — beide kombinierbar."""
    _, admin_headers = admin
    res = client.put(
        "/api/admin/settings",
        headers=admin_headers,
        json={"default_view_mode": "texts", "display_mode": "vocal"},
    )
    assert res.status_code == 200
    settings = client.get("/api/admin/settings", headers=admin_headers).json()
    assert settings["default_view_mode"] == "texts"
    assert settings["display_mode"] == "vocal"
