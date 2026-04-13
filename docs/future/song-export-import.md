# Future: Song-Export / -Import (.songbox)

## Idee

Ein `.song`-Ordner (Audio, Dokumente, Chordsheets und dazugehoerige DB-Metadaten wie
Sections/Lyrics) soll aus einer ChoirBox-Instanz **exportiert** und in einer anderen
Instanz wieder **importiert** werden koennen — auch ueber **getrennte Dropbox-Konten** hinweg.

User-spezifische Daten (Favoriten, Transpositionen, Stimmzuordnungen) werden **nicht**
mit exportiert. Nur chorweite Inhalte.

## Anwendungsfall

Chor A erarbeitet ein Stueck und stellt es Chor B zur Verfuegung — inklusive Audiospuren,
eingescannter Noten und der bereits annotierten Lyrics/Chordsheet-Struktur. Chor B soll
das Stueck ohne manuelles Nachbauen uebernehmen koennen.

## Kernentscheidungen (vorgeschlagen)

- **Format:** `.songbox` — ZIP mit `manifest.json` + Dateien (Audio, PDFs, Texte, Chordsheets).
- **Reichweite:** Ein Song pro Paket. Multi-Song-Export spaeter.
- **Transport:** Datei-basiert (Download / OS-Share / Upload). Kein Backend-zu-Backend.
- **User-Daten:** Werden bewusst ausgeschlossen.
- **Berechtigung:** Export fuer Member+; Import nur fuer Admin (schreibt in Dropbox).

## Offene Design-Fragen

- **Konflikte beim Import:** Song mit gleichem Namen existiert — ueberschreiben, Suffix
  "(Import)", oder mergen? Vorschlag: Suffix, niemals ueberschreiben.
- **Dropbox-IDs:** `dropbox_file_id` aus Quell-Dropbox ist im Ziel-Konto nicht gueltig.
  Beim Import werden neue IDs vergeben, Metadaten verweisen dann auf die neuen Objekte.
- **Chordsheet-Parsing:** Parsed-Data (Akkorde pro Silbe) direkt uebernehmen oder neu parsen?
  Vorschlag: Parsed-Data uebernehmen, Ausgangs-PDF als Fallback mitliefern.
- **Versionierung:** Zwei Chöre entwickeln denselben Song weiter — Wiederimport als Update
  oder als neue Kopie? Vorschlag: V1 immer neue Kopie, Update-Flow spaeter.
- **Paketgroesse:** MP3-Bundles koennen 50-200 MB werden. Separates
  Audio-/Metadaten-Split-Format anbieten?
- **OS-Share-Target (PWA):** ChoirBox als Ziel im Share-Sheet — eigener Future-Punkt,
  setzt PWA-Install voraus.

## Technischer Ansatz (grob)

### Export

1. Backend-Endpoint `POST /api/songs/{song_id}/export` streamt ein ZIP zurueck.
2. Inhalt:
   - `manifest.json` — Schema-Version, Song-Name, Quelle, Audio-Liste mit Voice-Part,
     Dokumente-Liste, Sections, Chordsheets inkl. Parse-Struktur.
   - `audio/`, `documents/`, `chordsheets/` — Originaldateien aus Dropbox (Stream ueber
     `dropbox_service.download`).
3. Frontend:
   - 3-Punkt-Menue im Song-Header → "Teilen" / "Als .songbox exportieren".
   - "Teilen" nutzt **Web Share API Level 2** (`navigator.share({files})`) — OS-Share-Sheet
     mit AirDrop, Mail, WhatsApp etc. Fallback: Download.

### Import

1. Admin-UI in DataCare oder Browse-Root: "Song importieren" → Datei-Picker / Drag&Drop.
2. Frontend laedt `.songbox` zum Backend: `POST /api/songs/import?folder=...`
3. Backend:
   - Entpackt ZIP in Tempdir.
   - Validiert `manifest.json` (Schema-Version).
   - Erzeugt Ziel-Ordner `<Name>.song` in Dropbox (bei Namenskonflikt Suffix `(Import)`).
   - Laedt alle Dateien per `dropbox_service.upload` hoch.
   - Legt `Song`-Row, `Document`-Rows, `Section`-Rows, Chordsheet-Daten an.
4. Response: Ziel-Ordner-Pfad + Statistik (X Dateien, Y Sections).

## Nicht im Scope (jetzt)

- Multi-Song-Export (ganze Projekte / Setlists).
- Delta-/Merge-Updates eines bereits importierten Songs.
- Live-Sync zwischen Instanzen.
- Web Share Target (ChoirBox als Ziel im OS-Share-Sheet) — eigener Future-Punkt.

## Verwandte Mockups

- `docs/mockups/song-export-a-menu-sheet.html` — Einstieg via 3-Punkt-Menue
- `docs/mockups/song-export-b-modal.html` — Export-Modal mit Paket-Preview
- `docs/mockups/song-export-c-import.html` — Import-Flow mit Vorschau
