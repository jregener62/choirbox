"""Tests fuer POST /api/dropbox/duplicate.

Die Dropbox-Integration ist in der Test-Suite auf None gezwungen (siehe
conftest). Damit decken wir hier:
    * Permission-Gate (pro-member required)
    * Input-Validierung
    * Dropbox-not-connected-Handling
Die eigentliche Namens-Ableitung ist als reine Helper-Funktion testbar.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_duplicate_requires_pro_member(client: TestClient, member):
    _, headers = member
    r = client.post(
        "/api/dropbox/duplicate",
        json={"path": "/Song/audio.mp3"},
        headers=headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "permission_denied"
    assert r.json()["detail"]["permission"] == "documents.duplicate"


def test_duplicate_without_dropbox_returns_400(client: TestClient, pro_member):
    _, headers = pro_member
    r = client.post(
        "/api/dropbox/duplicate",
        json={"path": "/Song/audio.mp3"},
        headers=headers,
    )
    assert r.status_code == 400
    assert "Dropbox" in r.json()["detail"]


def test_duplicate_rejects_empty_path(client: TestClient, pro_member):
    _, headers = pro_member
    r = client.post(
        "/api/dropbox/duplicate",
        json={"path": "   "},
        headers=headers,
    )
    assert r.status_code == 400


def test_duplicate_anonymous_returns_401(client: TestClient):
    r = client.post("/api/dropbox/duplicate", json={"path": "/a.mp3"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Helper-Funktionen (reine Logik, ohne Dropbox)
# ---------------------------------------------------------------------------

def test_split_name_file_with_extension():
    from backend.api.dropbox import _split_name
    assert _split_name("SongA.mp3", is_folder=False) == ("SongA", ".mp3")


def test_split_name_plain_folder():
    from backend.api.dropbox import _split_name
    assert _split_name("MyFolder", is_folder=True) == ("MyFolder", "")


def test_split_name_song_folder_keeps_suffix():
    from backend.api.dropbox import _split_name
    assert _split_name("Great Song.song", is_folder=True) == ("Great Song", ".song")


def test_split_name_file_without_extension():
    from backend.api.dropbox import _split_name
    assert _split_name("README", is_folder=False) == ("README", "")


def test_find_kopie_name_no_collision():
    from backend.api.dropbox import _find_kopie_name
    assert _find_kopie_name("SongA", ".mp3", set()) == "SongA (Kopie).mp3"


def test_find_kopie_name_first_collision():
    from backend.api.dropbox import _find_kopie_name
    existing = {"songa (kopie).mp3"}
    assert _find_kopie_name("SongA", ".mp3", existing) == "SongA (Kopie 2).mp3"


def test_find_kopie_name_multiple_collisions():
    from backend.api.dropbox import _find_kopie_name
    existing = {
        "songa (kopie).mp3",
        "songa (kopie 2).mp3",
        "songa (kopie 3).mp3",
    }
    assert _find_kopie_name("SongA", ".mp3", existing) == "SongA (Kopie 4).mp3"


def test_find_kopie_name_case_insensitive():
    from backend.api.dropbox import _find_kopie_name
    # Dropbox ist case-insensitive — "SongA (Kopie).MP3" blockiert auch kleingeschriebene.
    existing = {"songa (kopie).mp3"}
    assert _find_kopie_name("SongA", ".MP3", existing) == "SongA (Kopie 2).MP3"


def test_find_kopie_name_folder_with_song_suffix():
    from backend.api.dropbox import _find_kopie_name
    assert _find_kopie_name("Great Song", ".song", set()) == "Great Song (Kopie).song"
