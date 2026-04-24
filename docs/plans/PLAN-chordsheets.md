# Feature-Plan: Chord Sheets für ChoirBox

## Übersicht

Neues Feature zum Importieren, Anzeigen und Transponieren von Akkord-Texten innerhalb von `.song`-Ordnern. PDFs (z.B. von Ultimate Guitar) werden per OCR geparst, die Akkorde über den Textzeilen dargestellt und können pro User in die bevorzugte Tonart transponiert werden.

## Anforderungen

- **Import**: PDF-Upload + automatische Erkennung von Akkorden und Text
- **Berechtigung**: ab `pro-member` (Erstellen/Bearbeiten), `member` kann ansehen + transponieren
- **Speicherort**: Neuer reservierter Unterordner `Chordsheets/` in `.song`-Ordnern
- **Transposition**: Pro User speicherbar (z.B. Gitarrist in C, Keyboarder in Eb)

## Ordnerstruktur

```
Konzert/
  Delmenhorst.song/
    Audio/
    Texte/
    Videos/
    Multitrack/
    Chordsheets/          ← NEU
      delmenhorst-chords.pdf   ← Original-PDF (Referenz)
```

Metadaten (geparster Inhalt, Tonart, User-Präferenzen) liegen in der Datenbank, nicht in Dropbox.

---

## Datenmodelle

### ChordSheet

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | int (PK) | |
| song_folder_path | str | Pfad zum `.song`-Ordner |
| title | str | z.B. "Delmenhorst" |
| original_key | str? | Erkannte Original-Tonart (z.B. "E") |
| parsed_content | str (JSON) | Geparste Zeilen mit Akkord-Positionen |
| source_filename | str? | Originaler PDF-Dateiname |
| dropbox_path | str? | Pfad zur PDF in Dropbox (optional) |
| created_by | FK→User | |
| created_at / updated_at | datetime | |
| content_hash | str? | Für Änderungserkennung |

### UserChordPreference

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | int (PK) | |
| user_id | FK→User | |
| chord_sheet_id | FK→ChordSheet | |
| transposition_semitones | int | -12 bis +12 (0 = Original) |
| preferred_key | str? | Gecachte Anzeige-Tonart |
| created_at / updated_at | datetime | |

Unique Constraint: `(user_id, chord_sheet_id)`

### parsed_content Format (JSON)

```json
{
  "sections": [
    {
      "type": "verse",
      "label": "[Verse]",
      "lines": [
        {
          "text": "Ich bin jetzt immer da, wo du nicht bist",
          "chords": [
            {"chord": "E", "col": 0},
            {"chord": "Amaj7", "col": 36}
          ]
        }
      ]
    }
  ],
  "detected_key": "E",
  "detection_confidence": 0.85
}
```

---

## Backend

### Neuer Service: `chord_sheet_service.py`

Kernfunktionen:

1. **PDF-Parsing-Pipeline**
   - Erst `pdfplumber` (für text-basierte PDFs wie Ultimate Guitar — schnell, genau)
   - Fallback: `pytesseract` + `pdf2image` (für gescannte PDFs)
   - Akkord-Erkennung per Regex: `[A-G][b#]?(m|maj|min|dim|aug|sus)?[0-9]?(/[A-G][b#]?)?`
   - Heuristik: Zeile mit >50% Akkord-Matches = Akkord-Zeile
   - Akkord-Zeilen werden mit der folgenden Text-Zeile gepaart
   - Sektionen erkannt: `[Verse]`, `[Chorus]`, `[Intro]` etc.

2. **Tonart-Erkennung**
   - Häufigste Akkord-Grundtöne zählen
   - I-IV-V Muster erkennen
   - Konfidenz-Score mitliefern

3. **Transpositions-Engine**
   - Chromatische Skala: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
   - Akkord parsen (Root + Suffix), Root verschieben, Suffix beibehalten
   - Enharmonische Varianten: Db statt C# je nach Kontext (optional, Phase 2)

### Neue API-Endpoints: `/api/chord-sheets`

| Method | Endpoint | Rolle | Beschreibung |
|--------|----------|-------|-------------|
| POST | `/import` | pro-member+ | PDF hochladen → parsen → Vorschau zurückgeben |
| POST | `/import/confirm` | pro-member+ | Geprüften Inhalt speichern |
| GET | `/list?folder=...` | member+ | Chord Sheets eines `.song`-Ordners |
| GET | `/{id}` | member+ | Einzelnes Sheet (mit optionalem `?transpose=N`) |
| PUT | `/{id}` | pro-member+ | Inhalt/Titel/Tonart bearbeiten |
| DELETE | `/{id}` | pro-member+ | Sheet löschen |
| PUT | `/{id}/my-preference` | member+ | Eigene Transposition speichern |
| GET | `/{id}/my-preference` | member+ | Eigene Transposition laden |

### Integration bestehender Code

- `folder_types.py`: `Chordsheets` als neuen reservierten Ordner registrieren
- `database.py`: Neue Tabellen beim Start erstellen
- `app.py`: Router registrieren
- `models/__init__.py`: Neue Models exportieren

---

## Frontend

### Neue Komponenten

1. **ChordSheetViewer** (`components/ui/ChordSheetViewer.tsx`)
   - Akkorde über Textzeilen rendern (Monospace-Font für exakte Positionierung)
   - Sektions-Header farblich hervorheben (`[Verse]`, `[Chorus]`)
   - Responsive: Font-Größe anpassbar, horizontaler Scroll wenn nötig

2. **TransposeControls** (`components/ui/TransposeControls.tsx`)
   - Minus-Button | Tonart-Anzeige (z.B. "E → G") | Plus-Button
   - "Speichern"-Indikator wenn Transposition gespeichert
   - Touch-Targets ≥ 44px

3. **ChordSheetImportModal** (`components/ui/ChordSheetImportModal.tsx`)
   - Nutzt `<Modal>` Base-Component
   - 3-Step-Flow: Upload → Vorschau/Korrektur → Speichern
   - Vorschau zeigt geparste Akkorde über Text
   - User kann Titel und Original-Tonart korrigieren

### Neue Pages

4. **ChordSheetListPage** (`pages/ChordSheetListPage.tsx`)
   - Liste aller Chord Sheets im `.song`-Ordner
   - Import-Button (ab pro-member)
   - Klick → ChordSheetPage

5. **ChordSheetPage** (`pages/ChordSheetPage.tsx`)
   - Route: `/chord-sheet/:id`
   - ChordSheetViewer + TransposeControls
   - Bearbeiten/Löschen im Menü (ab pro-member)
   - Auto-Load der gespeicherten User-Transposition

### BrowsePage-Integration

- `Chordsheets` als synthetischer Eintrag in `.song`-Ordnern (wie Texte, Audio etc.)
- Icon: Musik-Note oder Gitarre (lucide-react)
- Farbe: Lila (`#a78bfa`)
- `folderTypeConfig.ts` erweitern

### Zustand Store

- `useChordSheets` Hook oder Teil von `appStore`
- Cached: geladene Sheets, User-Präferenzen
- Actions: `loadSheets`, `savePreference`, `importSheet`

---

## Implementierungs-Phasen

### Phase 1: Kern-Infrastruktur (2-3 Tage)
- [ ] Datenmodelle erstellen (ChordSheet, UserChordPreference)
- [ ] Transpositions-Logik implementieren und testen
- [ ] `Chordsheets` als reservierten Ordner registrieren
- [ ] Basis-API-Endpoints (CRUD)

### Phase 2: PDF-Import-Pipeline (3-4 Tage)
- [ ] pdfplumber-Integration für Text-Extraktion
- [ ] Akkord-Erkennung (Regex + Heuristik)
- [ ] Sektions-Erkennung ([Verse], [Chorus] etc.)
- [ ] Tonart-Erkennung
- [ ] Import-Endpoint mit Vorschau-Schritt
- [ ] Tests mit verschiedenen PDF-Formaten

### Phase 3: Frontend Viewer (3-4 Tage)
- [ ] ChordSheetViewer-Komponente (Akkorde über Text)
- [ ] TransposeControls (Hoch/Runter, Tonart-Anzeige)
- [ ] ChordSheetPage mit User-Präferenz-Speicherung
- [ ] Mobile-Optimierung (Touch, Font-Größe, Scroll)

### Phase 4: Import-UI + Integration (2-3 Tage)
- [ ] ChordSheetImportModal (Upload → Vorschau → Speichern)
- [ ] ChordSheetListPage
- [ ] BrowsePage-Integration (synthetischer Eintrag)
- [ ] folderTypeConfig erweitern

### Phase 5: Polish + E2E-Tests (2 Tage)
- [ ] Fehlerbehandlung (kaputte PDFs, leere Erkennung)
- [ ] Preview-Tests im Browser
- [ ] Edge Cases (lange Zeilen, Sonderzeichen, Umlaute)
- [ ] FEATURES.md aktualisieren

**Geschätzter Gesamtaufwand: 12-16 Tage**

---

## Architektur-Entscheidungen

| Entscheidung | Gewählt | Warum |
|-------------|---------|-------|
| Geparster Inhalt in DB (JSON) | ✅ | Schneller Zugriff, kein Dropbox-Sync nötig, Transposition on-the-fly |
| Original-PDF in Dropbox behalten | ✅ | User kann bei schlechter Erkennung neu importieren |
| pdfplumber + pytesseract Fallback | ✅ | Schnell für Text-PDFs (häufigster Fall), OCR als Backup |
| Monospace-Font für Akkord-Positionierung | ✅ | Einfach, zuverlässig, funktioniert offline |
| Transposition in Halbtönen | ✅ | Musikalisch korrekt, einfache Mathematik (mod 12) |

## Risiken

| Risiko | Maßnahme |
|--------|---------|
| OCR-Genauigkeit bei Scan-PDFs | Manueller Review-Schritt vor dem Speichern |
| False Positives bei Akkord-Erkennung (z.B. "Am" in Text) | Kontextuelle Heuristik: Akkord-Zeilen vs. Text-Zeilen trennen |
| Akkord-Positionierung bricht auf schmalen Screens | Horizontal-Scroll erlauben, Font-Größe anpassbar |
| Große PDFs (>5 MB) langsam beim Parsen | Upload-Limit setzen, Async-Processing |
