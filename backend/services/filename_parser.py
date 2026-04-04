"""Parse audio filenames into voice, section, song name, and free text components."""

import re
from typing import Optional

AUDIO_EXT_RE = re.compile(r'\.(mp3|m4a|wav|ogg|flac|aac|webm|mp4)$', re.IGNORECASE)
DEFAULT_SECTION_RE = re.compile(r'^(Intro|Strophe|Refrain|Bridge|Solo|Outro)(\d[\+\d]*)?$', re.IGNORECASE)


def _build_section_regex(shortcodes: list[str]) -> re.Pattern:
    if not shortcodes:
        return DEFAULT_SECTION_RE
    escaped = [re.escape(s) for s in shortcodes]
    return re.compile(rf'^({"|".join(escaped)})(\d[\+\d]*)?$', re.IGNORECASE)


def _build_voice_regex(shortcodes: list[str]) -> re.Pattern:
    if not shortcodes:
        return re.compile(r'^[SATB]+$')
    single_chars = [s for s in shortcodes if len(s) == 1]
    multi_words = [re.escape(s) for s in shortcodes if len(s) > 1]
    parts = []
    if single_chars:
        parts.append(f'[{"".join(re.escape(c) for c in single_chars)}]+')
    parts.extend(multi_words)
    flags = 0 if single_chars else re.IGNORECASE
    return re.compile(rf'^({"|".join(parts)})$', flags)


def _strip_folder_extension(name: str) -> str:
    """Remove .song and similar extensions from folder name."""
    for ext in ('.song', '.tx', '.audio', '.videos', '.multitrack'):
        if name.lower().endswith(ext):
            return name[:-len(ext)]
    return name


def _is_reserved_name(name: str) -> bool:
    return name.lower() in ('texte', 'audio', 'videos', 'multitrack')


def _derive_song_name(dropbox_path: str) -> str:
    """Extract song name from the .song ancestor in the path."""
    segments = [s for s in dropbox_path.split('/') if s]
    # Walk from the file upward to find .song folder
    for i in range(len(segments) - 1, -1, -1):
        if segments[i].lower().endswith('.song'):
            return _strip_folder_extension(segments[i])
    # No .song folder — use parent folder name
    if len(segments) >= 2:
        parent = segments[-2]
        if _is_reserved_name(parent) and len(segments) >= 3:
            return _strip_folder_extension(segments[-3])
        return _strip_folder_extension(parent)
    return ''


def parse_audio_filename(
    filename: str,
    dropbox_path: str,
    voice_shortcodes: list[str],
    section_shortcodes: list[str],
) -> dict:
    """Parse an audio filename into components.

    Returns dict with keys: voice_keys, section_keys, song_name, free_text.
    All values are strings (comma-separated for lists) or empty string.
    """
    song_name = _derive_song_name(dropbox_path)

    # Strip extension
    name = AUDIO_EXT_RE.sub('', filename)
    if name == filename and not AUDIO_EXT_RE.search(filename):
        return {"voice_keys": "", "section_keys": "", "song_name": song_name, "free_text": ""}

    parts = [p for p in name.split('-') if p]
    if not parts:
        return {"voice_keys": "", "section_keys": "", "song_name": song_name, "free_text": ""}

    # First part: voice shortcode
    voice_re = _build_voice_regex(voice_shortcodes)
    voice_keys = ""
    if voice_re.match(parts[0]):
        first = parts[0]
        single_chars = [s for s in voice_shortcodes if len(s) == 1]
        if single_chars and any(c in first for c in single_chars):
            # Split combined single-char shortcodes: "SA" → ["S", "A"]
            seen = set()
            letters = []
            for ch in first:
                if ch not in seen:
                    seen.add(ch)
                    letters.append(ch)
            voice_keys = ",".join(letters)
        else:
            voice_keys = first
        parts = parts[1:]
    else:
        return {"voice_keys": "", "section_keys": "", "song_name": song_name, "free_text": ""}

    # Skip folder name parts
    folder_parts = [p for p in re.sub(r'[^a-zA-Z0-9äöüÄÖÜß-]', '-', song_name).replace('--', '-').strip('-').split('-') if p]
    if folder_parts and len(parts) >= len(folder_parts):
        candidate = parts[:len(folder_parts)]
        if all(c.lower() == f.lower() for c, f in zip(candidate, folder_parts)):
            parts = parts[len(folder_parts):]

    # Parse sections
    section_re = _build_section_regex(section_shortcodes)
    sections = []
    free_text_parts = []
    for part in parts:
        m = section_re.match(part)
        if m:
            sections.append(m.group(1) + (m.group(2) or ''))
        else:
            free_text_parts.append(part)

    return {
        "voice_keys": voice_keys,
        "section_keys": ",".join(sections),
        "song_name": song_name,
        "free_text": "-".join(free_text_parts),
    }
