"""Tests for POST /api/documents/paste-text.

Covers both modes:
- inside-song: write into an existing .song folder's Texte/
- root-mode: create a new <song_folder_name>.song folder first, then write
"""

from sqlmodel import select

from backend.models.document import Document


# ---------------------------------------------------------------------------
# Inside-song mode
# ---------------------------------------------------------------------------

def test_paste_txt_into_song_folder(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Lyrics",
            "text": "Some lyrics here.",
            "file_type": "txt",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["file_type"] == "txt"
    assert data["original_name"] == "Lyrics.txt"
    assert data["folder_path"] == "/Test.song/Texte"


def test_paste_cho_into_song_folder(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Akkorde",
            "text": "[Verse]\nC G Am F\nLyrics",
            "file_type": "cho",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["file_type"] == "cho"
    assert data["original_name"] == "Akkorde.cho"
    assert data["folder_path"] == "/Test.song/Texte"


# ---------------------------------------------------------------------------
# Root mode (creates a new .song folder)
# ---------------------------------------------------------------------------

def test_paste_cho_root_mode_creates_song_folder(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/",
            "title": "House Of The Rising Sun",
            "text": "{title: House}\n[Am]A house",
            "file_type": "cho",
            "song_folder_name": "House Of The Rising Sun",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["folder_path"] == "/House Of The Rising Sun.song/Texte"
    assert data["original_name"] == "House Of The Rising Sun.cho"


def test_paste_txt_root_mode_with_subfolder_parent(client, pro_member):
    """song_folder_name in a non-root parent folder also works."""
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Konzerte",
            "title": "Solo",
            "text": "lyrics",
            "file_type": "txt",
            "song_folder_name": "Solo",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["folder_path"] == "/Konzerte/Solo.song/Texte"


# ---------------------------------------------------------------------------
# Validation & error cases
# ---------------------------------------------------------------------------

def test_paste_invalid_file_type(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "x",
            "text": "y",
            "file_type": "pdf",  # not allowed for paste-text
        },
    )
    assert resp.status_code == 400


def test_paste_empty_text_rejected(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "x",
            "text": "   \n  ",
            "file_type": "txt",
        },
    )
    assert resp.status_code == 400


def test_paste_oversized_text_rejected(client, pro_member):
    _, headers = pro_member
    big_text = "x" * (3 * 1024 * 1024)  # 3 MB > 2 MB limit
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "x",
            "text": big_text,
            "file_type": "txt",
        },
    )
    assert resp.status_code == 400


def test_paste_requires_pro_member(client, member):
    """A plain member must not be allowed to paste."""
    _, headers = member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "x",
            "text": "y",
            "file_type": "txt",
        },
    )
    assert resp.status_code == 403


def test_paste_unauthenticated(client):
    resp = client.post(
        "/api/documents/paste-text",
        json={
            "folder_path": "/Test.song",
            "title": "x",
            "text": "y",
            "file_type": "txt",
        },
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def test_paste_persists_document_in_db(client, session, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Persisted",
            "text": "content",
            "file_type": "cho",
        },
    )
    assert resp.status_code == 200
    doc_id = resp.json()["data"]["id"]
    doc = session.exec(select(Document).where(Document.id == doc_id)).first()
    assert doc is not None
    assert doc.file_type == "cho"
    assert doc.original_name == "Persisted.cho"
    assert doc.folder_path == "/Test.song/Texte"
