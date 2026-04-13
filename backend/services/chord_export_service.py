"""Build ChordPro output from plain text + chord positions.

A chord position is a (line_index, char_offset, chord_token) tuple. The
service inserts `[chord]` markers into the original text at the specified
character offsets. Offsets are applied per line from right to left so that
earlier offsets stay stable while later ones shift.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass


CHORD_RE = re.compile(r"^[A-G](#|b)?(m|maj|sus|dim|aug)?(\d+)?(/[A-G](#|b)?)?$")


@dataclass(frozen=True)
class ChordPosition:
    line_index: int
    char_offset: int
    chord: str


class InvalidChordError(ValueError):
    """Raised when a chord token does not match the allowed grammar."""


def validate_chord(token: str) -> None:
    if not CHORD_RE.match(token):
        raise InvalidChordError(f"Invalid chord token: {token!r}")


def build_chordpro(text: str, chords: list[ChordPosition]) -> str:
    """Return ChordPro body with `[chord]` markers inserted into `text`.

    `text` is split on `\\n`; trailing newline is preserved if present.
    Offsets greater than a line's length are clamped to the line end.
    Negative offsets are clamped to 0.
    Later offsets on the same line are inserted first so earlier offsets
    remain valid.
    """
    for c in chords:
        validate_chord(c.chord)

    has_trailing_newline = text.endswith("\n")
    body = text[:-1] if has_trailing_newline else text
    lines = body.split("\n")

    by_line: dict[int, list[ChordPosition]] = defaultdict(list)
    for c in chords:
        if 0 <= c.line_index < len(lines):
            by_line[c.line_index].append(c)

    out: list[str] = []
    for idx, line in enumerate(lines):
        positions = sorted(
            by_line[idx], key=lambda x: x.char_offset, reverse=True
        )
        for p in positions:
            offset = max(0, min(p.char_offset, len(line)))
            line = line[:offset] + f"[{p.chord}]" + line[offset:]
        out.append(line)

    result = "\n".join(out)
    return result + "\n" if has_trailing_newline else result
