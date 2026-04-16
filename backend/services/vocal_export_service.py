"""Build ChordPro output with vocal-instruction directives.

A vocal mark is a (line_index, char_offset, token) tuple. The service
inserts `{v:token}` markers into the original text at the specified
character offsets. Offsets are applied per line from right to left so
earlier offsets stay stable while later ones shift.

`build_merged_chordpro` additionally preserves chord markers `[chord]`
so a round-trip through the vocal editor does not drop them (and vice
versa for the chord editor).

Token vocabulary — current scope:
- beat: `{v:1}` (Taktanfang / Zaehlzeit 1)
- interval: `{v:+1}`..`{v:+12}`, `{v:-1}`..`{v:-12}`
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass


# Current scope: beat (Zaehlzeit 1), intervals (+/-1..+/-12), and free-text
# notes with the `n:` namespace prefix. Additional ABC-tokens (breath,
# fermata, dynamics ...) can be added later via new toolbar tools.
ABC_TOKENS: set[str] = set()
INTERVAL_RE = re.compile(r"^[+-]([1-9]|1[0-2])$")
BEAT_RE = re.compile(r"^1$")
# Free-text note: `n:` followed by at least one non-brace character.
NOTE_RE = re.compile(r"^n:[^{}]+$")


@dataclass(frozen=True)
class VocalMark:
    line_index: int
    char_offset: int
    token: str


class InvalidVocalTokenError(ValueError):
    """Raised when a vocal token does not match the allowed grammar."""


def is_valid_token(token: str) -> bool:
    if token in ABC_TOKENS:
        return True
    if INTERVAL_RE.match(token):
        return True
    if BEAT_RE.match(token):
        return True
    if NOTE_RE.match(token):
        return True
    return False


def validate_token(token: str) -> None:
    if not is_valid_token(token):
        raise InvalidVocalTokenError(f"Invalid vocal token: {token!r}")


def build_chordpro_with_vocals(text: str, marks: list[VocalMark]) -> str:
    """Return ChordPro body with `{v:token}` directives inserted into `text`.

    Kept for backward compatibility / vocals-only export.
    """
    return build_merged_chordpro(text, chords=[], vocals=marks)


def build_merged_chordpro(
    text: str,
    chords: list[object],
    vocals: list[VocalMark],
) -> str:
    """Return ChordPro body with BOTH `[chord]` and `{v:token}` directives.

    `chords` items are expected to have `.line_index`, `.char_offset`,
    `.chord` attributes (ChordPosition from chord_export_service, or a
    compatible dataclass). They are duck-typed to avoid a cross-module
    dependency in the type hints.

    All markers are sorted per line from right to left, so earlier
    offsets stay stable while later ones shift.
    """
    # Local import to avoid circular import at module load
    from backend.services.chord_export_service import validate_chord

    for m in marks_to_validate(vocals):
        validate_token(m.token)
    for c in chords:
        validate_chord(c.chord)  # type: ignore[attr-defined]

    has_trailing_newline = text.endswith("\n")
    body = text[:-1] if has_trailing_newline else text
    lines = body.split("\n")

    # (line_idx) -> list of (offset, rendered_marker) for insertion
    per_line: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for m in vocals:
        if 0 <= m.line_index < len(lines):
            per_line[m.line_index].append(
                (m.char_offset, f"{{v:{m.token}}}")
            )
    for c in chords:
        li = getattr(c, "line_index")
        co = getattr(c, "char_offset")
        if 0 <= li < len(lines):
            per_line[li].append((co, f"[{c.chord}]"))  # type: ignore[attr-defined]

    out: list[str] = []
    for idx, line in enumerate(lines):
        # Sort by offset descending; on tie, keep insertion order reversed
        # so chord is inserted AFTER vocal (vocals appear left of chord).
        items = sorted(per_line[idx], key=lambda x: x[0], reverse=True)
        for offset, rendered in items:
            clamped = max(0, min(offset, len(line)))
            line = line[:clamped] + rendered + line[clamped:]
        out.append(line)

    result = "\n".join(out)
    return result + "\n" if has_trailing_newline else result


def marks_to_validate(vocals: list[VocalMark]) -> list[VocalMark]:
    return vocals
