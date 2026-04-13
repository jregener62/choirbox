"""Chord-Input API — build ChordPro from plain text + tapped chord positions.

Phase 1 (Keypad-MVP): single stateless endpoint that takes text + chord list
and returns the ChordPro body. No persistence, no drafts — the frontend
manages editing state and either downloads or saves the result as a new
.cho document via the existing documents endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.models.user import User
from backend.policy import require_permission
from backend.services.chord_export_service import (
    ChordPosition,
    InvalidChordError,
    build_chordpro,
)

router = APIRouter(prefix="/chord-input", tags=["chord-input"])


@router.post("/export")
def export_chordpro(
    data: dict,
    user: User = Depends(require_permission("chord_input.edit")),
):
    """Build ChordPro body from plain text + chord positions.

    Request body:
    {
      "text": "...",                     # original lines, \\n-separated
      "chords": [
        {"line": 0, "col": 0,  "chord": "G"},
        {"line": 0, "col": 8,  "chord": "C"}
      ]
    }
    Response: { "cho_content": "..." }
    """
    text = data.get("text", "")
    if not isinstance(text, str):
        raise HTTPException(400, "text must be a string")

    raw_chords = data.get("chords", [])
    if not isinstance(raw_chords, list):
        raise HTTPException(400, "chords must be a list")

    positions: list[ChordPosition] = []
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
        positions.append(ChordPosition(line, col, chord.strip()))

    try:
        cho_content = build_chordpro(text, positions)
    except InvalidChordError as exc:
        raise HTTPException(400, str(exc))

    return {"cho_content": cho_content}
