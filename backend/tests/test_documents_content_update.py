"""Tests for PUT /api/documents/{doc_id}/content (chord-sheet in-place update)."""


def _create_cho_document(client, headers) -> int:
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Chords",
            "text": "[C]hello world",
            "file_type": "cho",
        },
    )
    assert resp.status_code == 200
    return resp.json()["data"]["id"]


def _create_txt_document(client, headers) -> int:
    resp = client.post(
        "/api/documents/paste-text",
        headers=headers,
        json={
            "folder_path": "/Test.song",
            "title": "Plain",
            "text": "just lyrics",
            "file_type": "txt",
        },
    )
    assert resp.status_code == 200
    return resp.json()["data"]["id"]


def test_update_requires_pro_member(client, member):
    _, headers = member
    resp = client.put(
        "/api/documents/1/content",
        headers=headers,
        json={"content": "x"},
    )
    assert resp.status_code == 403


def test_update_overwrites_cho(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    resp = client.put(
        f"/api/documents/{doc_id}/content",
        headers=headers,
        json={"content": "[G]Amazing [C]grace"},
    )
    assert resp.status_code == 200


def test_update_rejects_txt(client, pro_member):
    _, headers = pro_member
    doc_id = _create_txt_document(client, headers)
    resp = client.put(
        f"/api/documents/{doc_id}/content",
        headers=headers,
        json={"content": "x"},
    )
    assert resp.status_code == 404


def test_update_rejects_non_string_content(client, pro_member):
    _, headers = pro_member
    doc_id = _create_cho_document(client, headers)
    resp = client.put(
        f"/api/documents/{doc_id}/content",
        headers=headers,
        json={"content": 42},
    )
    assert resp.status_code == 400


def test_update_missing_document(client, pro_member):
    _, headers = pro_member
    resp = client.put(
        "/api/documents/99999/content",
        headers=headers,
        json={"content": "x"},
    )
    assert resp.status_code == 404
