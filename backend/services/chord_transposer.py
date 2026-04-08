"""Chord transposition engine — transpose chords by semitone steps."""

import re

# Chromatic scale with sharp notation
SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Flat equivalents for display (used when original uses flats)
FLAT_SCALE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

# Map all note names to semitone index
NOTE_TO_INDEX = {}
for i, note in enumerate(SHARP_SCALE):
    NOTE_TO_INDEX[note] = i
for i, note in enumerate(FLAT_SCALE):
    NOTE_TO_INDEX[note] = i

# Regex to parse a chord: root note (with optional accidental) + suffix
CHORD_RE = re.compile(
    r'^([A-G][b#]?)'           # Root note
    r'(.*?)$'                   # Suffix (m, maj7, dim, sus4, add9, /bass etc.)
)

# Regex for bass note in slash chords (e.g., Am/G)
SLASH_RE = re.compile(r'^(.*)/([A-G][b#]?)$')


def _note_index(note: str) -> int:
    """Get semitone index for a note name."""
    return NOTE_TO_INDEX.get(note, -1)


def _use_flats(chords: list[str]) -> bool:
    """Heuristic: if any chord in the song uses flats, prefer flat notation."""
    for chord in chords:
        if 'b' in chord and chord[0] != 'b':
            return True
    return False


def transpose_note(note: str, semitones: int, use_flats: bool = False) -> str:
    """Transpose a single note name by N semitones."""
    idx = _note_index(note)
    if idx < 0:
        return note  # Unknown note, return as-is
    new_idx = (idx + semitones) % 12
    scale = FLAT_SCALE if use_flats else SHARP_SCALE
    return scale[new_idx]


def transpose_chord(chord: str, semitones: int, use_flats: bool = False) -> str:
    """Transpose a full chord symbol by N semitones.

    Examples:
        transpose_chord("F#m7", 2) -> "G#m7"
        transpose_chord("Amaj7", -3) -> "F#maj7"
        transpose_chord("Am/G", 2) -> "Bm/A"
    """
    if semitones == 0:
        return chord

    chord = chord.strip()
    if not chord:
        return chord

    # Handle slash chords first
    slash_match = SLASH_RE.match(chord)
    if slash_match:
        main_part = slash_match.group(1)
        bass_note = slash_match.group(2)
        transposed_main = transpose_chord(main_part, semitones, use_flats)
        transposed_bass = transpose_note(bass_note, semitones, use_flats)
        return f"{transposed_main}/{transposed_bass}"

    # Parse root + suffix
    match = CHORD_RE.match(chord)
    if not match:
        return chord

    root = match.group(1)
    suffix = match.group(2)

    new_root = transpose_note(root, semitones, use_flats)
    return f"{new_root}{suffix}"


def transpose_parsed_content(parsed: dict, semitones: int) -> dict:
    """Transpose all chords in a parsed chord sheet content structure.

    The parsed structure has:
    {
        "sections": [
            {
                "type": "verse",
                "label": "[Verse]",
                "lines": [
                    {"text": "lyrics", "chords": [{"chord": "Em", "col": 0}]}
                ]
            }
        ],
        "detected_key": "E",
        ...
    }
    """
    if semitones == 0:
        return parsed

    # Collect all chords to decide sharp/flat preference
    all_chords = []
    for section in parsed.get("sections", []):
        for line in section.get("lines", []):
            for c in line.get("chords", []):
                all_chords.append(c["chord"])

    flats = _use_flats(all_chords)

    # Deep copy and transpose
    result = {**parsed}
    result["sections"] = []

    for section in parsed.get("sections", []):
        new_section = {**section}
        new_section["lines"] = []
        for line in section.get("lines", []):
            new_line = {**line}
            new_line["chords"] = [
                {**c, "chord": transpose_chord(c["chord"], semitones, flats)}
                for c in line.get("chords", [])
            ]
            new_section["lines"].append(new_line)
        result["sections"].append(new_section)

    # Transpose detected key
    if parsed.get("detected_key"):
        result["detected_key"] = transpose_chord(
            parsed["detected_key"], semitones, flats
        )

    return result


def detect_key(chords: list[str]) -> tuple[str, float]:
    """Detect the likely key of a song from its chord list.

    Uses a simple heuristic: the most frequent root note, weighted by
    position (first and last chords matter more).

    Returns (key_name, confidence 0.0-1.0).
    """
    if not chords:
        return ("C", 0.0)

    from collections import Counter

    roots = []
    for chord in chords:
        match = CHORD_RE.match(chord.strip())
        if match:
            roots.append(match.group(1))

    if not roots:
        return ("C", 0.0)

    # Weight: first chord x3, last chord x2, all others x1
    weighted = Counter()
    for i, root in enumerate(roots):
        weight = 1
        if i == 0:
            weight = 3
        elif i == len(roots) - 1:
            weight = 2
        weighted[root] += weight

    most_common = weighted.most_common(1)[0]
    total_weight = sum(weighted.values())
    confidence = min(most_common[1] / total_weight * 2, 1.0)

    return (most_common[0], round(confidence, 2))
