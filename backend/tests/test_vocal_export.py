"""Tests for backend.services.vocal_export_service and /api/vocal-input/export."""

import pytest

from backend.services.chord_export_service import ChordPosition
from backend.services.vocal_export_service import (
    InvalidVocalTokenError,
    VocalMark,
    build_chordpro_with_vocals,
    build_merged_chordpro,
    is_valid_token,
    validate_token,
)


# ---------------------------------------------------------------------------
# is_valid_token / validate_token
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "token",
    [
        "1",  # beat (Zaehlzeit 1)
        "n:Hier zart beginnen",
        "n:x",
        "n:mit Akzent!",
        "n:Einzelwort",
    ],
)
def test_validate_accepts(token):
    validate_token(token)
    assert is_valid_token(token)


@pytest.mark.parametrize(
    "token",
    [
        "", " ", "0", "2", "3", "9",
        "+1", "+5", "-7",  # intervals no longer in scope
        "breath", "fermata", "mf", "staccato",
        "BREATH", "cresc(", "{breath}",
        "n:",              # empty note text
        "n:with{brace}",   # braces forbidden
        "note:text",       # wrong prefix
    ],
)
def test_validate_rejects(token):
    assert not is_valid_token(token)
    with pytest.raises(InvalidVocalTokenError):
        validate_token(token)


# ---------------------------------------------------------------------------
# build_chordpro_with_vocals
# ---------------------------------------------------------------------------

def test_build_empty():
    assert build_chordpro_with_vocals("", []) == ""


def test_build_single_beat_at_start():
    out = build_chordpro_with_vocals("Hello", [VocalMark(0, 0, "1")])
    assert out == "{v:1}Hello"


def test_build_note_mid_line():
    out = build_chordpro_with_vocals(
        "und Stille", [VocalMark(0, 4, "n:leise")]
    )
    assert out == "und {v:n:leise}Stille"


def test_build_multiple_same_line_order_stable():
    """Offsets refer to the ORIGINAL text — earlier marks must not shift."""
    out = build_chordpro_with_vocals(
        "Großer Gott, wir loben dich",
        [
            VocalMark(0, 0, "1"),
            VocalMark(0, 7, "1"),
            VocalMark(0, 17, "n:betont"),
        ],
    )
    assert out == "{v:1}Großer {v:1}Gott, wir {v:n:betont}loben dich"


def test_build_multiple_lines():
    text = "line one\nline two\nline three"
    marks = [VocalMark(0, 0, "1"), VocalMark(2, 5, "n:langsam")]
    out = build_chordpro_with_vocals(text, marks)
    assert out == "{v:1}line one\nline two\nline {v:n:langsam}three"


def test_build_offset_clamped_to_end():
    out = build_chordpro_with_vocals("short", [VocalMark(0, 999, "1")])
    assert out == "short{v:1}"


def test_build_offset_negative_clamped_to_start():
    out = build_chordpro_with_vocals("short", [VocalMark(0, -5, "1")])
    assert out == "{v:1}short"


def test_build_out_of_range_line_silently_dropped():
    out = build_chordpro_with_vocals(
        "only one line", [VocalMark(5, 0, "1")]
    )
    assert out == "only one line"


def test_build_preserves_trailing_newline():
    out = build_chordpro_with_vocals("hello\n", [VocalMark(0, 0, "1")])
    assert out == "{v:1}hello\n"


def test_build_note_token():
    out = build_chordpro_with_vocals(
        "Der Tag bricht an",
        [VocalMark(0, 4, "n:zart beginnen")],
    )
    assert out == "Der {v:n:zart beginnen}Tag bricht an"


def test_build_rejects_invalid_token():
    with pytest.raises(InvalidVocalTokenError):
        build_chordpro_with_vocals("x", [VocalMark(0, 0, "nope")])


def test_build_handles_empty_line():
    out = build_chordpro_with_vocals(
        "first\n\nthird", [VocalMark(2, 0, "1")]
    )
    assert out == "first\n\n{v:1}third"


# ---------------------------------------------------------------------------
# build_merged_chordpro — chords + vocals round-trip safely
# ---------------------------------------------------------------------------

def test_merged_chords_only():
    out = build_merged_chordpro(
        "Hello world",
        chords=[ChordPosition(0, 6, "G")],
        vocals=[],
    )
    assert out == "Hello [G]world"


def test_merged_vocals_only():
    out = build_merged_chordpro(
        "Hello world",
        chords=[],
        vocals=[VocalMark(0, 0, "1")],
    )
    assert out == "{v:1}Hello world"


def test_merged_round_trip_preserves_both():
    text = "Hello world"
    chords = [ChordPosition(0, 0, "C"), ChordPosition(0, 6, "G")]
    vocals = [VocalMark(0, 0, "1"), VocalMark(0, 6, "n:laut")]
    out = build_merged_chordpro(text, chords, vocals)
    assert "[C]" in out and "[G]" in out
    assert "{v:1}" in out and "{v:n:laut}" in out
    assert out.endswith("world")


def test_merged_multi_line():
    text = "line one\nline two"
    chords = [ChordPosition(1, 5, "D")]
    vocals = [VocalMark(0, 0, "1")]
    out = build_merged_chordpro(text, chords, vocals)
    assert out == "{v:1}line one\nline [D]two"


def test_merged_rejects_invalid_chord():
    from backend.services.chord_export_service import InvalidChordError
    with pytest.raises(InvalidChordError):
        build_merged_chordpro("x", [ChordPosition(0, 0, "nope")], [])


def test_merged_rejects_invalid_vocal():
    with pytest.raises(InvalidVocalTokenError):
        build_merged_chordpro("x", [], [VocalMark(0, 0, "nope")])


# ---------------------------------------------------------------------------
# API: both endpoints preserve the "other" markup
# ---------------------------------------------------------------------------

def test_api_vocal_export_preserves_chords(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/vocal-input/export",
        headers=headers,
        json={
            "text": "Hello world",
            "marks": [{"line": 0, "col": 0, "token": "1"}],
            "chords": [{"line": 0, "col": 6, "chord": "G"}],
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"cho_content": "{v:1}Hello [G]world"}


def test_api_chord_export_preserves_vocals(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/chord-input/export",
        headers=headers,
        json={
            "text": "Hello world",
            "chords": [{"line": 0, "col": 0, "chord": "C"}],
            "vocals": [{"line": 0, "col": 6, "token": "n:laut"}],
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"cho_content": "[C]Hello {v:n:laut}world"}


# ---------------------------------------------------------------------------
# API endpoint — reuses chord_input.edit permission
# ---------------------------------------------------------------------------

def test_api_export_requires_auth(client):
    resp = client.post("/api/vocal-input/export", json={"text": "x", "marks": []})
    assert resp.status_code in (401, 403)


def test_api_export_forbidden_for_member(client, member):
    _, headers = member
    resp = client.post(
        "/api/vocal-input/export",
        headers=headers,
        json={"text": "hello", "marks": []},
    )
    assert resp.status_code == 403


def test_api_export_roundtrip_for_pro_member(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/vocal-input/export",
        headers=headers,
        json={
            "text": "Amazing grace",
            "marks": [
                {"line": 0, "col": 0, "token": "1"},
                {"line": 0, "col": 8, "token": "n:sanft"},
            ],
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "cho_content": "{v:1}Amazing {v:n:sanft}grace"
    }


def test_api_export_rejects_invalid_token(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/vocal-input/export",
        headers=headers,
        json={
            "text": "hello",
            "marks": [{"line": 0, "col": 0, "token": "nope"}],
        },
    )
    assert resp.status_code == 400


def test_api_export_rejects_malformed_payload(client, pro_member):
    _, headers = pro_member
    resp = client.post(
        "/api/vocal-input/export",
        headers=headers,
        json={"text": "x", "marks": [{"line": "zero", "col": 0, "token": "1"}]},
    )
    assert resp.status_code == 400
