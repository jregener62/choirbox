# Implementierungsplan: Song-Export / -Import (.songbox)

## Ziel

`.song`-Ordner zwischen ChoirBox-Instanzen austauschbar machen — auch ueber getrennte
Dropbox-Konten hinweg. Format: **`.songbox`** (ZIP + `manifest.json`). Keine User-Daten.

## Format-Spezifikation

### Dateiendung
`.songbox` (ZIP-Container, MIME-Type `application/zip`).

### Aufbau
```
Hallelujah.songbox
├── manifest.json
├── audio/
│   ├── 001_sopran.mp3
│   ├── 002_tenor.mp3
│   └── ...
├── documents/
│   └── songtext.pdf
└── chordsheets/
    └── hallelujah_C.pdf
```

Datei-Reihenfolge und Nummern-Praefix sind nur Ordnung; die Zuordnung erfolgt
ausschliesslich ueber `manifest.json`.

### manifest.json — Schema v1

```json
{
  "schema_version": 1,
  "exported_at": "2026-04-13T10:30:00Z",
  "exported_by": {
    "choir_name": "Gemischter Chor Delmenhorst",
    "app_version": "0.12.3"
  },
  "song": {
    "name": "Hallelujah",
    "folder_name": "Hallelujah.song"
  },
  "audio": [
    {
      "filename": "audio/001_sopran.mp3",
      "display_name": "Hallelujah — Sopran",
      "voice_part": "sopran",
      "duration_s": 222,
      "size_bytes": 4612345
    }
  ],
  "documents": [
    {
      "filename": "documents/songtext.pdf",
      "display_name": "Hallelujah — Songtext",
      "kind": "text"
    }
  ],
  "chordsheets": [
    {
      "filename": "chordsheets/hallelujah_C.pdf",
      "original_key": "C",
      "parsed_data": { /* Sections mit Akkorden pro Silbe */ }
    }
  ],
  "sections": [
    {
      "name": "Strophe 1",
      "order_index": 0,
      "start_s": 0,
      "end_s": 32,
      "lyrics": "..."
    }
  ]
}
```

Bewusst **nicht** im manifest: `dropbox_file_id` (nicht portabel), `user_id`, Favoriten,
Transpositionen, `voice_part`-Zuweisungen pro User.

## Phasen

### Phase 1: Export (MVP)

**Backend**

- Neues Modul: `backend/services/song_export_service.py`
  - `build_export_package(session, song_id) -> BytesIO` — baut ZIP im Speicher
    (bei kleinen Songs) oder streamt (>50 MB).
  - Laedt Dateien ueber `dropbox_service.download(path)`.
  - Sammelt Metadaten aus DB: `Song`, `Document`, `Section`, Chordsheet-Parsed-Data.
  - Baut `manifest.json`, schreibt alles ins ZIP.
- Neuer Endpoint: `backend/api/songs.py` (oder vorhandener Router)
  - `GET /api/songs/{song_id}/export` → `StreamingResponse`,
    `Content-Type: application/zip`,
    `Content-Disposition: attachment; filename="<Name>.songbox"`.
- Berechtigung: Member+.

**Frontend**

- Mockup-Variante **B** (Export-Modal mit Paket-Preview) als Referenz.
- Neues Modal: `frontend/src/components/song/ExportSongModal.tsx`
  - Vorab-Request `GET /api/songs/{song_id}/export/preview` — liefert nur Metadata
    + geschaetzte Groesse, ohne Dateien zu laden.
  - Primaer-Button "Teilen" (nutzt Web Share API) + Sekundaer "Speichern" (Download).
  - Web Share API Call:
    ```ts
    const res = await fetch(`/api/songs/${id}/export`);
    const blob = await res.blob();
    const file = new File([blob], `${name}.songbox`, { type: 'application/zip' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      // Download-Fallback
    }
    ```
- Einstieg: 3-Punkt-Menue im Song-Header (Mockup **A**). Bestehende Actions bleiben,
  neue Sheet-Items "Teilen" + "Als .songbox exportieren".

**Tests**

- Backend: Unit-Test `song_export_service.build_export_package` — Manifest-Schema,
  Datei-Zaehlung, Mock fuer `dropbox_service.download`.
- Integration: Mit einem realen Song gegen Test-Dropbox, Download des ZIPs, Schema-Check.

### Phase 2: Import

**Backend**

- Neues Modul: `backend/services/song_import_service.py`
  - `validate_package(zip_bytes) -> ImportPreview` — liest `manifest.json`,
    prueft Schema-Version, zaehlt Dateien. Kein Upload.
  - `import_package(session, zip_bytes, target_folder) -> ImportResult`
    - Entpackt in Tempdir.
    - Erzeugt Ziel-Ordner `<Name>.song` unter `target_folder`. Bei Konflikt Suffix `(Import)`.
    - Laedt alle Audio/Docs/Chordsheets via `dropbox_service.upload` hoch.
    - Legt `Song`-Row an (neue `dropbox_file_id` aus Dropbox-Response).
    - Legt `Document`-Rows an mit `voice_part` aus Manifest.
    - Legt `Section`-Rows an, verknuepft mit `song_id`.
    - Legt Chordsheet-Rows an, uebernimmt `parsed_data` unveraendert.
- Neue Endpoints:
  - `POST /api/songs/import/preview` (multipart) → `ImportPreview` (Manifest-Snippet +
    Konflikt-Check). Nur Admin.
  - `POST /api/songs/import` (multipart, `folder` als Form-Field) → `ImportResult`.
    Nur Admin.

**Frontend**

- Mockup-Variante **C** (Import-Flow).
- Neue Seite oder Modal: `frontend/src/pages/admin/ImportSongModal.tsx` (Zugang via
  DataCarePage oder BrowsePage-FAB fuer Admins).
- Ablauf:
  1. Drop-Zone / File-Picker — akzeptiert `.songbox` (`application/zip`).
  2. Upload → Preview. Anzeige: Quelle, Statistik, Ziel-Ordner-Picker, Konflikt-Hinweis.
  3. Bestaetigung → Upload + Progress-Anzeige.
  4. Erfolgs-Toast + Navigation zum neuen Song.

**Tests**

- Backend: Unit-Test fuer `validate_package` (kaputtes ZIP, fehlendes Manifest, falsche
  Schema-Version). Unit-Test fuer Konflikt-Suffix.
- Integration: Export eines Test-Songs → Import in anderes Test-Konto → Vergleich.

### Phase 3: Polish

- Fortschrittsanzeige beim Export/Import (Server-Sent Events fuer grosse Pakete).
- Audio-Duration im Manifest statt aus MP3-Header neu auslesen.
- Permission-Check verschaerfen: Nur Admin darf exportieren, wenn Chor Lizenz hat (falls
  SaaS-Pfad kommt).

### Phase 4 (separater Future-Punkt): Web Share Target

- `manifest.json` (PWA) um `share_target` erweitern:
  ```json
  "share_target": {
    "action": "/import",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": { "files": [{ "name": "songbox", "accept": ["application/zip"] }] }
  }
  ```
- Setzt PWA-Installation voraus (siehe `docs/future/pwa-audio-caching.md`).
- Funktioniert zuverlaessig auf Android Chrome; iOS unterstuetzt Share-Target sehr
  eingeschraenkt — dort bleibt der Import-Dialog der Hauptweg.

## Datenmodell-Aenderungen

**Keine.** Export liest bestehende Tabellen. Import legt neue Rows in vorhandenen
Tabellen an (`songs`, `documents`, `sections`, `chordsheets`). `dropbox_file_id`
wird beim Import neu vergeben — das entspricht dem normalen Sync-Verhalten.

## Berechtigungen

Neue Policy-Keys in `backend/policy/permissions.json`:

| Key | Rolle | Beschreibung |
|---|---|---|
| `songs.export` | member+ | Eigenen Chor-Song als `.songbox` exportieren |
| `songs.import` | admin | `.songbox` in Dropbox des eigenen Chors importieren |

## Risiken / Fallstricke

- **Dropbox-Rate-Limits:** Import laedt potentiell 10+ Dateien hintereinander hoch.
  Serielles Upload mit Retry; `dropbox_service` hat bereits Rate-Limit-Handling.
- **Paketgroesse:** 100+ MB als Streaming-Response serven, nicht in-Memory bauen.
  `tempfile.SpooledTemporaryFile` mit 10 MB Threshold.
- **Web Share API Desktop:** Chrome-Desktop kann Files teilen, Firefox nicht. Fallback
  auf Download muss sauber ausgelost werden (`navigator.canShare` pruefen).
- **Schema-Evolution:** `schema_version` im Manifest von Anfang an. Import lehnt
  unbekannte Major-Versionen ab.
- **Chordsheet-`parsed_data`:** Struktur ist heute nicht versioniert. Vor Export
  kurz pruefen, ob das Parse-Format stabil genug ist — sonst bei Import neu parsen.

## Abgeleitete Fragen an den Entwickler (vor Implementierungsstart)

1. Soll Export auch fuer **Gaeste** via Guest-Link moeglich sein, oder strikt eingeloggt?
2. Ist das `parsed_data`-Format von Chordsheets stabil genug zum Uebernehmen, oder
   beim Import sicherheitshalber neu parsen?
3. Beim Namenskonflikt: Suffix `(Import)` — oder User-Entscheidung im Dialog
   ("Umbenennen" / "Abbrechen")?
4. Wo genau soll der Import-Einstieg liegen — `DataCarePage`, FAB in `BrowsePage`,
   oder beides?

## Referenzen

- Future-Issue: `docs/future/song-export-import.md`
- Mockups: `docs/mockups/song-export-a-menu-sheet.html`,
  `docs/mockups/song-export-b-modal.html`,
  `docs/mockups/song-export-c-import.html`
- Datenmodell: `docs/plans/bug-alarm-datenmodell.md` (Song-Tabelle, dropbox_file_id)
