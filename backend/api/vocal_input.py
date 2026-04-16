"""Vocal-Input API — build ChordPro body with `{v:token}` directives.

Accepts an optional `chords` list so the vocal editor can preserve chord
markers across a round-trip (the vocal editor strips chord markers from
the displayed text, but needs to put them back on save).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.models.user import User
from backend.policy import require_permission
from backend.services.chord_export_service import (
    ChordPosition,
    InvalidChordError,
)
from backend.services.vocal_export_service import (
    InvalidVocalTokenError,
    VocalMark,
    build_merged_chordpro,
)

router = APIRouter(prefix="/vocal-input", tags=["vocal-input"])


@router.post("/export")
def export_vocal_chordpro(
    data: dict,
    user: User = Depends(require_permission("chord_input.edit")),
):
    """Build ChordPro body with `{v:token}` (and optionally `[chord]`) markers.

    Request body:
    {
      "text": "...",
      "marks":  [{"line": 0, "col": 5, "token": "1"}],
      "chords": [{"line": 0, "col": 0, "chord": "G"}]    # optional
    }
    Response: { "cho_content": "..." }
    """
    text = data.get("text", "")
    if not isinstance(text, str):
        raise HTTPException(400, "text must be a string")

    raw_marks = data.get("marks", [])
    if not isinstance(raw_marks, list):
        raise HTTPException(400, "marks must be a list")

    marks: list[VocalMark] = []
    for idx, m in enumerate(raw_marks):
        if not isinstance(m, dict):
            raise HTTPException(400, f"marks[{idx}] must be an object")
        line = m.get("line")
        col = m.get("col")
        token = m.get("token")
        if not isinstance(line, int) or not isinstance(col, int):
            raise HTTPException(
                400, f"marks[{idx}] needs integer line and col"
            )
        if not isinstance(token, str) or not token.strip():
            raise HTTPException(
                400, f"marks[{idx}] needs non-empty token string"
            )
        marks.append(VocalMark(line, col, token.strip()))

    raw_chords = data.get("chords", [])
    if not isinstance(raw_chords, list):
        raise HTTPException(400, "chords must be a list")

    chords: list[ChordPosition] = []
    for idx, c in enumerate(raw_chords):
        if not isinstance(c, dict):
            raise HTTPException(400, f"chords[{idx}] must be an object")
        line = c.get("line")
        col = c.get("col")
        chord = c.get("chord")
        if not isinstance(line, int) or not isinstance(col, int):
            raise HTTPException(
                400, f"chords[{idx}] needs integer line and col"
            )
        if not isinstance(chord, str) or not chord.strip():
            raise HTTPException(
                400, f"chords[{idx}] needs non-empty chord string"
            )
        chords.append(ChordPosition(line, col, chord.strip()))

    try:
        cho_content = build_merged_chordpro(text, chords, marks)
    except InvalidVocalTokenError as exc:
        raise HTTPException(400, str(exc))
    except InvalidChordError as exc:
        raise HTTPException(400, str(exc))

    return {"cho_content": cho_content}
