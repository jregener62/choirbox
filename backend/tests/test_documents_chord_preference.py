"""Tests for GET/PUT /api/documents/{id}/chord-preference.

The endpoint stores per-user transposition (in semitones, range -12..+12)
for .cho documents only.
"""

from sqlmodel import select

from backend.models.document import Document
from backend.models.user_chord_preference import UserChordPreference


def _create_cho_document(client, headers) -> int:
    """Helper: create a .cho document via paste-text and return its id."""
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Pref",
            "text": "[Am]hello",
            "file_type": "cho",
        },
    )
    assert resp.status_code == 200
    return resp.json()["data"]["id"]


# ---------------------------------------------------------------------------
# GET: default value when no preference exists
# ---------------------------------------------------------------------------

def test_get_preference_defaults_to_zero(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    resp = client.get(f"/api/documents/{doc_id}/chord-preference", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == {"transposition": 0}


# ---------------------------------------------------------------------------
# PUT: set, then read back
# ---------------------------------------------------------------------------

def test_set_then_get_preference(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)

    put = client.put(
        f"/api/documents/{doc_id}/chord-preference",
        headers=headers,
        json={"transposition": 3},
    )
    assert put.status_code == 200
    assert put.json()["transposition"] == 3

    get = client.get(f"/api/documents/{doc_id}/chord-preference", headers=headers)
    assert get.status_code == 200
    assert get.json() == {"transposition": 3}


def test_set_overwrites_existing(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    client.put(f"/api/documents/{doc_id}/chord-preference", headers=headers, json={"transposition": 5})
    client.put(f"/api/documents/{doc_id}/chord-preference", headers=headers, json={"transposition": -2})
    get = client.get(f"/api/documents/{doc_id}/chord-preference", headers=headers)
    assert get.json() == {"transposition": -2}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_set_preference_out_of_range(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    resp = client.put(
        f"/api/documents/{doc_id}/chord-preference",
        headers=headers,
        json={"transposition": 13},
    )
    assert resp.status_code == 400


def test_set_preference_negative_out_of_range(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    resp = client.put(
        f"/api/documents/{doc_id}/chord-preference",
        headers=headers,
        json={"transposition": -13},
    )
    assert resp.status_code == 400


def test_preference_only_for_cho(client, pro_member, session):
    """A .txt document must not have chord preferences."""
    _, headers = pro_member
    # Create a .txt via paste-text
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Lyrics",
            "text": "no chords",
            "file_type": "txt",
        },
    )
    txt_id = resp.json()["data"]["id"]

    get = client.get(f"/api/documents/{txt_id}/chord-preference", headers=headers)
    assert get.status_code == 404

    put = client.put(
        f"/api/documents/{txt_id}/chord-preference",
        headers=headers,
        json={"transposition": 0},
    )
    assert put.status_code == 404


def test_preference_unknown_document(client, pro_member):
    _, headers = pro_member
    resp = client.get("/api/documents/9999/chord-preference", headers=headers)
    assert resp.status_code == 404


def test_preference_requires_auth(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    # No auth header on the request
    resp = client.get(f"/api/documents/{doc_id}/chord-preference")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Per-user isolation
# ---------------------------------------------------------------------------

def test_preference_is_per_user(client, user_factory):
    """Two users on the same .cho should have independent transpositions."""
    _, alice_headers = user_factory(role="pro-member", username="alice")
    _, bob_headers = user_factory(role="pro-member", username="bob")

    doc_id = _create_cho_document(client, alice_headers)

    client.put(
        f"/api/documents/{doc_id}/chord-preference",
        headers=alice_headers,
        json={"transposition": 4},
    )
    client.put(
        f"/api/documents/{doc_id}/chord-preference",
        headers=bob_headers,
        json={"transposition": -3},
    )

    alice_get = client.get(f"/api/documents/{doc_id}/chord-preference", headers=alice_headers)
    bob_get = client.get(f"/api/documents/{doc_id}/chord-preference", headers=bob_headers)

    assert alice_get.json() == {"transposition": 4}
    assert bob_get.json() == {"transposition": -3}


def test_preference_persists_in_db(client, session, pro_member):
    user, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    client.put(
        f"/api/documents/{doc_id}/chord-preference",
        headers=headers,
        json={"transposition": 7},
    )
    pref = session.exec(
        select(UserChordPreference).where(
            UserChordPreference.user_id == user.id,
            UserChordPreference.document_id == doc_id,
        )
    ).first()
    assert pref is not None
    assert pref.transposition_semitones == 7
