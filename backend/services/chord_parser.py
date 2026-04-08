"""PDF chord sheet parser — extracts chords and lyrics from Ultimate Guitar style PDFs."""

import re
import json
from io import BytesIO

# Chord symbol pattern:
# Root: A-G with optional sharp/flat
# Quality: m, maj, min, dim, aug, sus
# Extensions: 2, 4, 5, 6, 7, 9, 11, 13, add, no
# Slash bass: /A-G with optional accidental
CHORD_PATTERN = re.compile(
    r'\b([A-G][b#]?'
    r'(?:m(?:aj|in)?|maj|dim|aug|sus)?'
    r'(?:2|4|5|6|7|9|11|13|add[0-9]+|no[0-9]+)?'
    r'(?:sus[24]?)?'
    r'(?:/[A-G][b#]?)?'
    r')\b'
)

# Section header pattern: [Verse], [Chorus], [Intro], [Bridge], [Outro], [Solo] etc.
SECTION_PATTERN = re.compile(
    r'^\[([A-Za-z0-9\s\+\-\.]+)\]\s*$'
)

# Pattern for repeat markers like "x2", "x4"
REPEAT_PATTERN = re.compile(r'\bx(\d+)\b')


def _is_chord_line(line: str) -> bool:
    """Determine if a line consists primarily of chord symbols.

    A chord line has:
    - At least one valid chord
    - Most non-whitespace content is chords
    - No long non-chord words (>4 chars that aren't chords)
    """
    stripped = line.strip()
    if not stripped:
        return False

    # Find all chord matches
    chords = list(CHORD_PATTERN.finditer(stripped))
    if not chords:
        return False

    # Calculate how much of the non-whitespace content is chords
    chord_chars = sum(len(m.group(0)) for m in chords)
    non_ws = len(stripped.replace(' ', ''))

    if non_ws == 0:
        return False

    chord_ratio = chord_chars / non_ws

    # Also check: are there long non-chord words?
    remaining = CHORD_PATTERN.sub('', stripped).strip()
    # Allow: spaces, repeat markers (x2, x4), parentheses, slashes, dashes
    remaining = re.sub(r'[x\d\(\)\-/\s\|]+', '', remaining)

    if len(remaining) > 3:
        return False

    return chord_ratio > 0.5


def _extract_chords_with_positions(line: str) -> list[dict]:
    """Extract chord symbols and their column positions from a chord line."""
    chords = []
    for match in CHORD_PATTERN.finditer(line):
        chords.append({
            "chord": match.group(1),
            "col": match.start()
        })
    return chords


def _is_section_header(line: str) -> str | None:
    """Check if line is a section header like [Verse], [Chorus].
    Returns the section label or None."""
    match = SECTION_PATTERN.match(line.strip())
    if match:
        return match.group(1).strip()
    return None


def _classify_section_type(label: str) -> str:
    """Map section label to a normalized type."""
    label_lower = label.lower()
    if any(v in label_lower for v in ('verse', 'strophe')):
        return 'verse'
    if any(c in label_lower for c in ('chorus', 'refrain')):
        return 'chorus'
    if 'bridge' in label_lower:
        return 'bridge'
    if 'intro' in label_lower:
        return 'intro'
    if 'outro' in label_lower:
        return 'outro'
    if 'solo' in label_lower:
        return 'solo'
    if 'pre-chorus' in label_lower or 'pre chorus' in label_lower:
        return 'pre-chorus'
    return 'other'


def _fix_ocr_chord_errors(text: str) -> str:
    """Fix common OCR errors in chord sheet text.

    Tesseract often misreads:
    - '#' as 'i', '¥', '!', 't', 'I'
    - 'ß' as 'B' or 'b' (German, but not in chord context)
    """
    # Fix sharp symbol misreads in chord-like patterns
    # E.g., "F#m" OCR'd as "Fim", "Ftm", "FIm", "F!m"
    # Pattern: [A-G] + misread-sharp + valid chord suffix
    def fix_sharp(match):
        root = match.group(1)
        suffix = match.group(2)
        return f"{root}#{suffix}"

    # Fix common misreads of # after note letters
    # Must be careful: only fix in chord-line context
    text = re.sub(
        r'\b([A-G])[iItI!¥]'  # Note letter + misread sharp
        r'(m(?:aj)?|dim|aug|sus|add|[0-9]|/[A-G]|\b)',  # Followed by chord suffix or word boundary
        fix_sharp,
        text
    )

    return text


def parse_chord_text(text: str) -> dict:
    """Parse raw text (from PDF extraction) into structured chord sheet format.

    Input: Raw text with chords on separate lines above lyrics.
    Output: {
        "sections": [
            {
                "type": "verse",
                "label": "[Verse 1]",
                "lines": [
                    {"text": "lyrics here", "chords": [{"chord": "Am", "col": 0}]}
                ]
            }
        ],
        "all_chords": ["Am", "C", "E", ...],
        "detected_key": "Am",
        "key_confidence": 0.75
    }
    """
    lines = text.split('\n')
    sections = []
    current_section = {
        "type": "intro",
        "label": "",
        "lines": []
    }
    all_chords = []
    pending_chords = None  # Chords waiting for a lyrics line

    for line in lines:
        stripped = line.rstrip()

        # Skip empty lines (but flush pending chords)
        if not stripped.strip():
            if pending_chords is not None:
                # Chord-only line (no lyrics follow) — add as instrumental
                current_section["lines"].append({
                    "text": "",
                    "chords": pending_chords
                })
                pending_chords = None
            continue

        # Check for section header
        section_label = _is_section_header(stripped)
        if section_label:
            # Flush pending chords
            if pending_chords is not None:
                current_section["lines"].append({
                    "text": "",
                    "chords": pending_chords
                })
                pending_chords = None

            # Save current section if it has content
            if current_section["lines"]:
                sections.append(current_section)

            current_section = {
                "type": _classify_section_type(section_label),
                "label": f"[{section_label}]",
                "lines": []
            }
            continue

        # Check if this is a chord line
        if _is_chord_line(stripped):
            # Flush any previous pending chords (chord-only line)
            if pending_chords is not None:
                current_section["lines"].append({
                    "text": "",
                    "chords": pending_chords
                })

            chords = _extract_chords_with_positions(stripped)
            all_chords.extend(c["chord"] for c in chords)
            pending_chords = chords
            continue

        # This is a lyrics line
        if pending_chords is not None:
            # Pair with pending chords
            current_section["lines"].append({
                "text": stripped,
                "chords": pending_chords
            })
            pending_chords = None
        else:
            # Lyrics without chords
            current_section["lines"].append({
                "text": stripped,
                "chords": []
            })

    # Flush remaining
    if pending_chords is not None:
        current_section["lines"].append({
            "text": "",
            "chords": pending_chords
        })

    if current_section["lines"]:
        sections.append(current_section)

    # Detect key
    from backend.services.chord_transposer import detect_key
    detected_key, key_confidence = detect_key(all_chords)

    return {
        "sections": sections,
        "all_chords": list(dict.fromkeys(all_chords)),  # unique, preserving order
        "detected_key": detected_key,
        "key_confidence": key_confidence,
    }


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF file.

    Strategy:
    1. Try pdfplumber (fast, accurate for text-based PDFs)
    2. Fallback to OCR via pytesseract + pdf2image (for scanned/image PDFs)
    """
    # Strategy 1: pdfplumber for text-based PDFs
    text = _extract_text_pdfplumber(pdf_bytes)
    if text and len(text.strip()) > 20:
        return text

    # Strategy 2: OCR fallback
    return _extract_text_ocr(pdf_bytes)


def _extract_text_pdfplumber(pdf_bytes: bytes) -> str:
    """Extract text using pdfplumber (text-based PDFs)."""
    import pdfplumber

    text_parts = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    return '\n'.join(text_parts)


def _extract_text_ocr(pdf_bytes: bytes) -> str:
    """Extract text using OCR (pytesseract + pdf2image).

    Handles multi-column layouts by detecting columns and OCR-ing each separately.
    Preserves spatial layout (chord positioning above lyrics).
    """
    from pdf2image import convert_from_bytes
    import pytesseract

    images = convert_from_bytes(pdf_bytes, dpi=300)

    text_parts = []
    for img in images:
        # Detect if this is a multi-column layout and extract accordingly
        page_text = _ocr_page_with_columns(img)
        if page_text:
            text_parts.append(page_text)

    return '\n'.join(text_parts)


def _ocr_page_with_columns(img) -> str:
    """OCR a page image, detecting and handling multi-column layouts.

    Strategy: Check if the page has a two-column layout by looking for
    a vertical gap in the middle. If so, OCR left and right halves separately.
    """
    import pytesseract
    import numpy as np

    width, height = img.size
    custom_config = r'--psm 6 -c preserve_interword_spaces=1'

    # Convert to numpy array for column detection
    img_array = np.array(img.convert('L'))  # Grayscale

    # Check for two-column layout: look at middle vertical strip
    mid_x = width // 2
    strip_width = width // 20  # 5% of width
    mid_strip = img_array[:, mid_x - strip_width:mid_x + strip_width]

    # Count how many rows in the content area are mostly white in the middle
    # Skip top 15% (title area) and bottom 5% (footer)
    content_top = int(height * 0.15)
    content_bottom = int(height * 0.95)
    mid_content = mid_strip[content_top:content_bottom]

    # A row is "empty" if the middle strip is very light (>240 on 0-255 scale)
    white_rows = np.mean(mid_content, axis=1) > 240
    white_ratio = np.sum(white_rows) / len(white_rows)

    # If >60% of content rows have a white middle strip, it's two columns
    is_two_column = white_ratio > 0.6

    if is_two_column:
        # Split into left and right columns
        # Find the actual gap center more precisely
        col_profile = np.mean(img_array[content_top:content_bottom, :], axis=0)
        # Look in the middle 30% for the whitest vertical line
        search_start = int(width * 0.35)
        search_end = int(width * 0.65)
        search_region = col_profile[search_start:search_end]
        gap_center = search_start + np.argmax(search_region)

        # Add some margin
        margin = width // 40

        left_img = img.crop((0, 0, gap_center - margin, height))
        right_img = img.crop((gap_center + margin, 0, width, height))

        left_text = pytesseract.image_to_string(
            left_img, config=custom_config, lang='deu+eng'
        )
        right_text = pytesseract.image_to_string(
            right_img, config=custom_config, lang='deu+eng'
        )

        return (left_text.strip() + '\n\n' + right_text.strip())
    else:
        return pytesseract.image_to_string(
            img, config=custom_config, lang='deu+eng'
        )


def extract_title_from_text(text: str) -> str:
    """Try to extract song title from the first line of the text.

    Ultimate Guitar PDFs typically start with:
    "Song Title Chords by Artist Name"
    """
    # Take first few lines to handle multi-line titles (OCR sometimes splits)
    lines = text.strip().split('\n')
    # Combine first 1-3 lines until we find a section marker or chord line
    header_lines = []
    for line in lines[:5]:
        stripped = line.strip()
        if not stripped:
            continue
        if _is_section_header(stripped) or _is_chord_line(stripped):
            break
        header_lines.append(stripped)
        # Stop after finding "by" pattern
        if re.search(r'\b(Chords|Tabs)\s+(by|—|-)\s+', stripped, re.IGNORECASE):
            break

    first_line = ' '.join(header_lines)

    # Remove common suffixes (case-insensitive patterns from Ultimate Guitar)
    for suffix in [' Chords by ', ' chords by ', ' Tabs by ', ' tabs by ',
                   ' Chords |', ' chords |']:
        if suffix in first_line:
            return first_line.split(suffix)[0].strip()

    # Remove trailing patterns
    for ending in [' Chords', ' chords', ' Tabs', ' tabs']:
        if first_line.endswith(ending):
            return first_line[:-len(ending)].strip()

    # OCR cleanup: remove trailing non-alphanumeric junk
    title = re.sub(r'[\s|¥]+$', '', first_line)

    return title


def _title_from_filename(filename: str) -> str:
    """Derive a title from the PDF filename."""
    name = filename.rsplit('.', 1)[0] if '.' in filename else filename
    # Remove common suffixes
    for suffix in [' chords', ' tabs', ' chord', ' tab']:
        if name.lower().endswith(suffix):
            name = name[:-len(suffix)]
    return name.strip().title()


def parse_pdf_to_chord_sheet(pdf_bytes: bytes, filename: str = "") -> dict:
    """Full pipeline: PDF bytes → structured chord sheet data.

    Returns: {
        "title": "Song Title",
        "parsed_content": { sections, all_chords, detected_key, key_confidence },
        "source_filename": "original.pdf"
    }
    """
    text = extract_text_from_pdf(pdf_bytes)

    if not text or len(text.strip()) < 20:
        raise ValueError("Konnte keinen Text aus dem PDF extrahieren. "
                         "Möglicherweise ist es ein gescanntes Bild-PDF.")

    # Apply OCR error corrections
    text = _fix_ocr_chord_errors(text)

    title = extract_title_from_text(text)

    # Filename-based title is often more reliable than OCR
    filename_title = _title_from_filename(filename) if filename else ""
    if filename_title and len(filename_title) >= 3:
        title = filename_title

    parsed = parse_chord_text(text)

    return {
        "title": title,
        "parsed_content": parsed,
        "source_filename": filename,
    }
