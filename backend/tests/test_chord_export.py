"""Tests for backend.services.chord_export_service and /api/chord-input/export."""

import pytest

from backend.services.chord_export_service import (
    ChordPosition,
    InvalidChordError,
    build_chordpro,
    validate_chord,
)


# ---------------------------------------------------------------------------
# validate_chord
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "token",
    [
        "C", "D", "Am", "G7", "Cmaj7", "F#m", "Bb", "Dsus4", "Edim",
        "Gaug", "C/G", "D/F#", "Am7", "Cmaj9", "G/B",
    ],
)
def test_validate_chord_accepts_valid(token):
    validate_chord(token)


@pytest.mark.parametrize(
    "token",
    [
        "", " ", "H", "cmaj7", "C##", "Cbb", "C/", "/C",
        "C-7", "hello", "7", "#C",
    ],
)
def test_validate_chord_rejects_invalid(token):
    with pytest.raises(InvalidChordError):
        validate_chord(token)


# ---------------------------------------------------------------------------
# build_chordpro
# ---------------------------------------------------------------------------

def test_build_empty_text_no_chords():
    assert build_chordpro("", []) == ""


def test_build_single_chord_at_start():
    out = build_chordpro("Hello world", [ChordPosition(0, 0, "C")])
    assert out == "[C]Hello world"


def test_build_single_chord_mid_line():
    out = build_chordpro("Hello world", [ChordPosition(0, 6, "C")])
    assert out == "Hello [C]world"


def test_build_multiple_chords_same_line_order_stable():
    """Offsets must refer to the ORIGINAL text, not to shifting indices."""
    out = build_chordpro(
        "Amazing grace, how sweet",
        [
            ChordPosition(0, 0, "G"),
            ChordPosition(0, 8, "C"),
            ChordPosition(0, 19, "G"),
        ],
    )
    assert out == "[G]Amazing [C]grace, how [G]sweet"


def test_build_multiple_lines():
    text = "line one\nline two\nline three"
    chords = [
        ChordPosition(0, 0, "C"),
        ChordPosition(2, 5, "G"),
    ]
    out = build_chordpro(text, chords)
    assert out == "[C]line one\nline two\nline [G]three"


def test_build_offset_beyond_line_clamped_to_end():
    out = build_chordpro("short", [ChordPosition(0, 999, "F")])
    assert out == "short[F]"


def test_build_offset_negative_clamped_to_start():
    out = build_chordpro("short", [ChordPosition(0, -5, "F")])
    assert out == "[F]short"


def test_build_out_of_range_line_silently_dropped():
    out = build_chordpro("only one line", [ChordPosition(5, 0, "C")])
    assert out == "only one line"


def test_build_preserves_trailing_newline():
    out = build_chordpro("hello\n", [ChordPosition(0, 0, "C")])
    assert out == "[C]hello\n"


def test_build_rejects_invalid_chord():
    with pytest.raises(InvalidChordError):
        build_chordpro("x", [ChordPosition(0, 0, "nope")])


def test_build_handles_empty_line():
    out = build_chordpro("first\n\nthird", [ChordPosition(2, 0, "D")])
    assert out == "first\n\n[D]third"


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

def test_api_export_requires_auth(client):
    resp = client.post("/api/chord-input/export", json={"text": "x", "chords": []})
    assert resp.status_code in (401, 403)


def test_api_export_forbidden_for_member(client, member):
    _, headers = member
    resp = client.post(
        "/api/chord-input/export",
        headers=headers,
        json={"text": "hello", "chords": []},
    )
    assert resp.status_code == 403


def test_api_export_roundtrip_for_pro_member(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/chord-input/export",
        headers=headers,
        json={
            "text": "Amazing grace, how sweet",
            "chords": [
                {"line": 0, "col": 0, "chord": "G"},
                {"line": 0, "col": 8, "chord": "C"},
            ],
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"cho_content": "[G]Amazing [C]grace, how sweet"}


def test_api_export_rejects_invalid_chord(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/chord-input/export",
        headers=headers,
        json={
            "text": "hello",
            "chords": [{"line": 0, "col": 0, "chord": "nope"}],
        },
    )
    assert resp.status_code == 400


def test_api_export_rejects_malformed_payload(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/chord-input/export",
        headers=headers,
        json={"text": "x", "chords": [{"line": "zero", "col": 0, "chord": "C"}]},
    )
    assert resp.status_code == 400
