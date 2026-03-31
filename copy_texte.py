#!/usr/bin/env python3
"""
Kopiert Texte (PDFs) aus dem __Texte-Ordner in die passenden
ChoirBox-Unterordner und importiert sie in die App-Datenbank.

Phase 1: PDFs in Dropbox-Ordner kopieren (Name-Matching)
Phase 2: PDFs in data/pdfs/ ablegen + DB-Eintraege erstellen,
         damit sie in der App angezeigt werden.
"""

import os
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from uuid import uuid4

import fitz  # PyMuPDF

# --- Konfiguration ---

SRC = "/Users/jregener/Library/CloudStorage/Dropbox-Privat/middle of the WEek/__Texte"
DST = "/Users/jregener/Library/CloudStorage/Dropbox-Privat/Apps/choirbox/Mein Bester Chor"

PROJECT_ROOT = Path(__file__).resolve().parent
DB_PATH = PROJECT_ROOT / "choirbox.db"
PDF_DIR = PROJECT_ROOT / "data" / "pdfs"

# Dropbox-Root-Folder der App (wird von den User-Pfaden abgezogen)
DROPBOX_ROOT = "Mein Bester Chor"

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav", ".ogg", ".flac"}
SIMILARITY_THRESHOLD = 0.75

# Schluesselwoerter fuer die "Haupt"-Audiodatei (Mix/Komplett/Gesamt)
MAIN_TRACK_KEYWORDS = re.compile(
    r"(mix|komplett|gesamt|full|all|satb|choir|chor)", re.IGNORECASE
)
# Einzelstimmen-Prefixe — diese Tracks sind NICHT der Haupt-Track
VOICE_PART_PATTERN = re.compile(
    r"^(S|A|T|B|Alt|Sopran|Tenor|Bass|Refrain)\b", re.IGNORECASE
)


# --- Hilfsfunktionen ---


def normalize(name: str) -> str:
    """Entfernt Suffixe wie -Foto, _MOTW, Dateiendung etc. fuer den Vergleich."""
    n = os.path.splitext(name)[0]
    for suffix in ["-Foto", "_MOTW_B", "_MOTW", " Kopie", " Neu", " Brian Neu", " Brian Williams"]:
        n = n.replace(suffix, "")
    n = " ".join(n.split()).strip().strip(".")
    return n


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def find_best_match(filename: str, folders: list[str]) -> tuple[str | None, float]:
    norm = normalize(filename)
    best_folder = None
    best_score = 0.0
    for folder in folders:
        score = similarity(norm, folder)
        norm_l, folder_l = norm.lower(), folder.lower()
        if folder_l in norm_l and len(folder) / max(len(norm), 1) >= 0.6:
            score = max(score, 0.85)
        if norm_l in folder_l and len(norm) / max(len(folder), 1) >= 0.5:
            score = max(score, 0.80)
        if folder_l.startswith(norm_l) or norm_l.startswith(folder_l):
            score = max(score, 0.90)
        if score > best_score:
            best_score = score
            best_folder = folder
    return best_folder, best_score


def get_audio_files(folder_path: str) -> list[str]:
    """Gibt alle Audio-Dateien in einem Ordner zurueck (inkl. Unterordnern 1. Ebene)."""
    audio = []
    for entry in os.listdir(folder_path):
        full = os.path.join(folder_path, entry)
        if os.path.isfile(full) and os.path.splitext(entry)[1].lower() in AUDIO_EXTENSIONS:
            audio.append(entry)
    return sorted(audio)


def pick_main_track(audio_files: list[str]) -> str | None:
    """Waehlt die 'Haupt'-Audiodatei (Mix/Komplett/Chor) — bevorzugt
    Tracks mit Main-Keywords und ohne Einzelstimmen-Prefix."""
    if not audio_files:
        return None

    def score(f: str) -> int:
        name = os.path.splitext(f)[0]
        s = 0
        if MAIN_TRACK_KEYWORDS.search(name):
            s += 10
        if VOICE_PART_PATTERN.search(name):
            s -= 5
        return s

    best = max(audio_files, key=score)
    return best


def to_user_path(folder_name: str, filename: str) -> str:
    """Baut den User-Pfad (ohne Root-Folder) fuer die DB."""
    return f"/{folder_name}/{filename}"


def get_admin_user_id(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    if not row:
        raise RuntimeError("Admin-User nicht in der DB gefunden")
    return row[0]


# --- Hauptprogramm ---


def main():
    # Phase 1: Dateien matchen
    files = sorted([
        f for f in os.listdir(SRC)
        if os.path.isfile(os.path.join(SRC, f)) and f.lower().endswith(".pdf")
    ])
    folders = sorted([
        d for d in os.listdir(DST)
        if os.path.isdir(os.path.join(DST, d))
    ])

    matches: list[tuple[str, str, float]] = []
    skipped: list[str] = []
    for f in files:
        folder, score = find_best_match(f, folders)
        if folder and score >= SIMILARITY_THRESHOLD:
            matches.append((f, folder, score))
        else:
            skipped.append(f)

    # Phase 2: Audio-Dateien und DB-Import planen
    import_plan: list[dict] = []
    for pdf_name, folder, score in matches:
        folder_path = os.path.join(DST, folder)
        audio_files = get_audio_files(folder_path)
        main_track = pick_main_track(audio_files)
        other_tracks = [a for a in audio_files if a != main_track]

        import_plan.append({
            "pdf_name": pdf_name,
            "folder": folder,
            "score": score,
            "main_track": main_track,
            "other_tracks": other_tracks,
            "audio_count": len(audio_files),
        })

    # Tabelle anzeigen
    print("=" * 120)
    print("ZUORDNUNG: Texte -> ChoirBox-Ordner -> Haupt-Audiodatei")
    print("=" * 120)
    print(f"\n{'Nr':<4} {'PDF':<45} {'Ordner':<30} {'Haupt-Track':<35} {'Tracks'}")
    print("-" * 120)
    for i, p in enumerate(import_plan, 1):
        main = p["main_track"] or "(keine Audio-Datei)"
        print(f"{i:<4} {p['pdf_name']:<45} {p['folder']:<30} {main:<35} {p['audio_count']}")

    no_audio = [p for p in import_plan if not p["main_track"]]
    if no_audio:
        print(f"\n  WARNUNG: {len(no_audio)} Ordner ohne Audio-Dateien:")
        for p in no_audio:
            print(f"    - {p['folder']}")

    if skipped:
        print(f"\n  UEBERSPRUNGEN (kein passender Ordner): {len(skipped)} Dateien")

    valid = [p for p in import_plan if p["main_track"]]
    total_refs = sum(len(p["other_tracks"]) for p in valid)
    print(f"\n  Aktion: {len(valid)} PDFs kopieren + in DB importieren")
    print(f"          {len(valid)} PdfFile-Eintraege (Haupt-Track)")
    print(f"          {total_refs} FileSettings-Eintraege (pdf_ref_path fuer weitere Tracks)")

    answer = input("\nAusfuehren? (j/n): ").strip().lower()
    if answer != "j":
        print("Abgebrochen.")
        return

    # Ausfuehren
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    admin_id = get_admin_user_id(conn)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    copied = 0
    imported = 0
    refs_created = 0
    errors = 0

    for p in valid:
        pdf_name = p["pdf_name"]
        folder = p["folder"]
        main_track = p["main_track"]

        # 1. PDF in Dropbox-Ordner kopieren (falls noch nicht dort)
        src_path = os.path.join(SRC, pdf_name)
        dst_path = os.path.join(DST, folder, pdf_name)
        try:
            if not os.path.exists(dst_path):
                shutil.copy2(src_path, dst_path)
                print(f"  KOPIERT: {pdf_name} -> {folder}/")
                copied += 1
            else:
                print(f"  EXISTIERT: {pdf_name} in {folder}/")
        except Exception as e:
            print(f"  FEHLER (Kopie): {pdf_name} -> {e}")
            errors += 1
            continue

        # 2. PDF lesen, Seiten zaehlen, in data/pdfs/ speichern
        try:
            content = Path(dst_path).read_bytes()
            doc = fitz.open(stream=content, filetype="pdf")
            page_count = len(doc)
            doc.close()

            uuid_name = f"{uuid4().hex}.pdf"
            (PDF_DIR / uuid_name).write_bytes(content)
        except Exception as e:
            print(f"  FEHLER (PDF): {pdf_name} -> {e}")
            errors += 1
            continue

        # 3. PdfFile-Eintrag fuer Haupt-Track
        main_path = to_user_path(folder, main_track)
        try:
            # Bestehenden Eintrag loeschen falls vorhanden
            conn.execute("DELETE FROM pdf_files WHERE dropbox_path = ?", (main_path,))
            conn.execute(
                """INSERT INTO pdf_files
                   (dropbox_path, filename, original_name, file_size, page_count, uploaded_by, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (main_path, uuid_name, pdf_name, len(content), page_count, admin_id, now),
            )
            imported += 1
            print(f"  DB: PdfFile fuer {main_path}")
        except Exception as e:
            print(f"  FEHLER (DB PdfFile): {main_path} -> {e}")
            errors += 1
            continue

        # 4. FileSettings mit pdf_ref_path fuer alle anderen Tracks
        for track in p["other_tracks"]:
            track_path = to_user_path(folder, track)
            try:
                existing = conn.execute(
                    "SELECT dropbox_path FROM file_settings WHERE dropbox_path = ?",
                    (track_path,),
                ).fetchone()
                if existing:
                    conn.execute(
                        "UPDATE file_settings SET pdf_ref_path = ?, updated_at = ? WHERE dropbox_path = ?",
                        (main_path, now, track_path),
                    )
                else:
                    conn.execute(
                        """INSERT INTO file_settings
                           (dropbox_path, pdf_ref_path, created_at, updated_at)
                           VALUES (?, ?, ?, ?)""",
                        (track_path, main_path, now, now),
                    )
                refs_created += 1
            except Exception as e:
                print(f"  FEHLER (DB Ref): {track_path} -> {e}")
                errors += 1

    conn.commit()
    conn.close()

    print(f"\n{'=' * 60}")
    print(f"Fertig!")
    print(f"  {copied} PDFs kopiert (Dropbox)")
    print(f"  {imported} PdfFile-Eintraege erstellt (DB)")
    print(f"  {refs_created} pdf_ref_path-Verweise erstellt (DB)")
    print(f"  {errors} Fehler")


if __name__ == "__main__":
    main()
