"""Chord-Input API — build ChordPro from plain text + chord positions.

Accepts an optional `vocals` list so the chord editor can preserve
vocal-instruction markers (`{v:xxx}`) across a round-trip.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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

router = APIRouter(prefix="/chord-input", tags=["chord-input"])


class ExportChordProBody(BaseModel):
    text: str = ""
    chords: list = []
    vocals: list = []


@router.post("/export")
def export_chordpro(
    body: ExportChordProBody,
    user: User = Depends(require_permission("chord_input.edit")),
):
    """Build ChordPro body with `[chord]` (and optionally `{v:token}`) markers.

    Request body:
    {
      "text": "...",
      "chords": [{"line": 0, "col": 0, "chord": "G"}],
      "vocals": [{"line": 0, "col": 5, "token": "1"}]    # optional
    }
    Response: { "cho_content": "..." }
    """
    text = body.text
    raw_chords = body.chords

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

    raw_vocals = body.vocals

    vocals: list[VocalMark] = []
    for idx, v in enumerate(raw_vocals):
        if not isinstance(v, dict):
            raise HTTPException(400, f"vocals[{idx}] must be an object")
        line = v.get("line")
        col = v.get("col")
        token = v.get("token")
        if not isinstance(line, int) or not isinstance(col, int):
            raise HTTPException(
                400, f"vocals[{idx}] needs integer line and col"
            )
        if not isinstance(token, str) or not token.strip():
            raise HTTPException(
                400, f"vocals[{idx}] needs non-empty token string"
            )
        vocals.append(VocalMark(line, col, token.strip()))

    try:
        cho_content = build_merged_chordpro(text, positions, vocals)
    except InvalidChordError as exc:
        raise HTTPException(400, str(exc))
    except InvalidVocalTokenError as exc:
        raise HTTPException(400, str(exc))

    return {"cho_content": cho_content}
