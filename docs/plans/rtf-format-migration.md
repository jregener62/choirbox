# RTF-Format — Umstellung Songtexte auf Rich Text

## Ziele

1. `.rtf` loest `.txt` als primaeres Format fuer Songtexte ab.
2. Formatierung (fett, kursiv, Farben, Groessen) wird **intuitiver** — WYSIWYG im App-Editor, kein Tag-Syntax.
3. Dateien sind in **externen Editoren** (TextEdit, WordPad, LibreOffice, MS Word) les- und schreibbar.
4. Die App zeigt externe Edits **ohne Konvertierungsschritt** an — RTF ist Source-of-Truth, nicht Zwischenformat.
5. **Kommentare** und **Taktanfangs-Marker** bleiben moeglich — in `.rtf` **und** `.cho`, mit **einheitlicher Syntax**.

## Ist-Zustand (Kurz)

- `.txt` — plain, Monospace-Anzeige (`TextViewer.tsx`).
- `.cho` — ChordPro-Parser (`utils/chordPro.ts`), Akkorde ueber Text, Kommentare via `{comment: ...}`, Sektionen via `{start_of_verse}`.
- **Formatierung in `.cho`** — experimentell per `# choirbox-format:`-Kommentaren am Dateiende (per-Char-Flags, `utils/textFormat.ts`). Funktioniert, ist aber nicht intuitiv und in fremden Editoren unsichtbar.
- Dropbox ist Source-of-Truth, SQLite cached Metadaten + Content (`document_service.py`).

## Problem mit dem Ist-Zustand

- **Doppelte Pflege**: `.txt` fuer reinen Text, `.cho` fuer Akkord-Sheets — User muss entscheiden.
- **Format-Kommentare sind kein Rich-Text**: Externer Editor zeigt kryptische `# choirbox-format:`-Zeilen statt formatierten Text.
- **Keine Rueckfuehrbarkeit**: User bearbeitet `.txt` in TextEdit → verliert jede Formatierung, weil `.txt` keine hat.

---

## 1. Format-Aufteilung nach der Migration

| Format | Zweck | Kommentare | Takt-Marker | Akkorde |
|--------|-------|-----------|-------------|---------|
| **`.rtf`** | Songtexte mit Rich-Text-Formatierung (ersetzt `.txt`) | Ja | Ja | Nein |
| **`.cho`** | ChordPro-Chord-Sheets mit Akkorden ueber Text | Ja | Ja | Ja |
| **`.txt`** | Legacy, read-only; Migration nach `.rtf` | Nein | Nein | Nein |

Wichtige Design-Entscheidung: **`.rtf` ersetzt nicht `.cho`**. ChordPro bleibt Standard fuer Akkord-Sheets (Kompatibilitaet mit anderen Chord-Tools). `.rtf` ist fuer Texte **ohne** Akkord-ueber-Text-Layout.

### 1.1 Design-Rationale: Warum zwei getrennte Formate statt einem universellen

Diskutiert wurde auch eine "Eierlegende Wollmilchsau" — ein universelles `.rtf` mit inline ChordPro-Akkorden `[C]`. Bewusst **verworfen**. Gruende (Begruendung des Projekt-Owners, zur spaeteren Nachvollziehbarkeit):

- **Texte haben verschiedene Adressaten.** Pro Song gibt es typischerweise **mehrere** Text-Files — nicht einen Meta-Text fuer alle. Beispiel-Dateinamen in Dropbox:
  - `A-Der Mond ist aufgegangen.rtf` — Alt-Stimme
  - `T-Der Mond ist aufgegangen.rtf` — Tenor-Stimme
  - `S-Der Mond ist aufgegangen.rtf` — Sopran-Stimme
  - `B-Der Mond ist aufgegangen.rtf` — Bass-Stimme
  - `I-Der Mond ist aufgegangen.cho` — Instrument-Sheet mit Akkorden
- **Akkorde sind nicht fuer SaengerInnen.** Fuer Stimmen sind sie Noise. Der Instrumentalist oeffnet bewusst das `.cho`.
- **Kommentare sind stimmen-/instrument-spezifisch.** "Ruhig beginnen" fuer Sopran, "Vorspiel 4 Takte" fuer Instrument. Ein Universalformat muesste alles mischen — unnoetige Komplexitaet.
- **ChordPro-Standard fuer `.cho` bleibt voll erhalten** — keine Erweiterungen, die andere Chord-Tools brechen wuerden. Einzige ChoirBox-spezifische Ergaenzung: die `[[ ... ]]`-Kommentar-Syntax, die in anderen Tools als Literaltext durchgeht.

Konsequenz fuer zukuenftige Features: Stimmen-/Instrument-Prefix im Dateinamen (`A-`, `T-`, `S-`, `B-`, `I-`) koennte fuer UI-Filterung oder Rollen-gebundene Anzeige verwendet werden — **derzeit nicht im Scope**, aber die Namensgebung der Sample-Dateien reflektiert dieses Schema.

---

## 2. Offene Designfragen — mit Empfehlungen

> Diese Entscheidungen sollten vor Implementierungs-Start geklaert werden.

### 2.1 Syntax fuer Kommentare und Takt-Marker (in `.rtf` und `.cho`)

**Problem:** RTF speichert Formatierung, aber semantische Marker (Kommentar, Takt) brauchen eigene Syntax. Ziel: in beiden Formaten gleich, in fremden Editoren lesbar.

| Marker | Empfehlung | Alternative |
|--------|-----------|-------------|
| **Kommentar** (Anweisung an Saenger) | `[[ ruhig beginnen ]]` — doppelte eckige Klammern, inline oder als eigene Zeile | `{c: ...}` (ChordPro-konform, aber kryptisch in Word) |
| **Takt-Marker** | `|` am Zeilenanfang gefolgt von Leerzeichen | `[1]`, `[2]` fuer nummerierte Takte; `||:` / `:||` fuer Wiederholungen |
| **Sektion** (Strophe/Refrain) — nur `.rtf` | `### Refrain` (Markdown-Style), als eigene Zeile | Eigener Absatz-Style in RTF |

**Begruendung fuer `[[ ... ]]`:**
- In Word/TextEdit als normaler Text sichtbar, keine Magie.
- Einfach zu parsen (Regex), einfach zu tippen.
- Nicht verwechselbar mit ChordPro-Akkorden `[Cm]` (einfache Klammern).
- Unterstuetzt Inline-Kommentare **und** ganze Kommentarzeilen.

**Fuer `.cho`-Parser:** zusaetzlich zur bestehenden `{c: ...}`/`{comment: ...}`-Syntax wird `[[ ... ]]` akzeptiert und bevorzugt.

### 2.2 RTF-Parser-Strategie

| Option | Aufwand | Trade-off |
|--------|---------|-----------|
| **A — `rtf.js` / `rtfjs` (Library)** | Niedrig | Groessere Bundle, deckt RTF komplett ab, aber u.U. UEberladen. |
| **B — Eigener Minimal-Parser** | Mittel | Nur unser RTF-Subset (b/i/u/s, Farbe, Groesse, Paragraph, Font). Kleiner, kontrollierbar, robuste Fehlerbehandlung fuer fremde Editoren. |
| **C — Server-seitige Konvertierung (Pandoc)** | Hoch | Verletzt Ziel 4 (keine Konvertierung). |

**Empfehlung: B — Eigener Minimal-Parser.** RTF ist textbasiert, unser Subset klein. Externe Editoren schreiben teils viele Properties, die wir einfach ignorieren (unbekannte Control-Words ueberspringen). Verhaelt sich wie ein toleranter Lexer.

### 2.3 WYSIWYG-Editor fuer RTF

| Option | Bundle | Extensibility |
|--------|--------|---------------|
| **Tiptap** (ProseMirror) | ~150kb | Hoch — Custom Marks fuer `[[ ]]` und Takt-Marker leicht moeglich |
| **Lexical** | ~90kb | Mittel — komplexer Custom-Node-API |
| **Quill** | ~200kb | Niedrig — veraltet |

**Empfehlung: Tiptap.** Custom-Node-Typen fuer Kommentar und Takt-Marker passen gut in das Schema-System. Der Editor braucht zwei UEbersetzer:
- **Deserialisieren** (Oeffnen): RTF-String aus Dropbox → Tiptap-JSON-Doc (wird im Editor angezeigt).
- **Serialisieren** (Speichern): Tiptap-JSON-Doc → RTF-String (zurueck nach Dropbox).

### 2.4 Was passiert, wenn externer Editor unbekannte RTF-Properties hinzufuegt?

**Entscheidung:** **Preserve-on-Passthrough.** Unbekannte Control-Words werden beim Parsen in einem `unknownTokens`-Feld am jeweiligen Run gespeichert, beim Serialisieren wieder ausgegeben. Alternativ: stripped (einfacher, aber verliert User-Intent).

**Empfehlung:** Fuer v1 **stripped** — nur unser Subset bleibt erhalten. User-Warnung im Editor: _"Formatierung, die ChoirBox nicht kennt, geht verloren."_ Preserve kann in v2 nachgezogen werden.

### 2.5 Migration bestehender `.txt`-Dateien

| Option | Trade-off |
|--------|-----------|
| **A — Automatisch bei erstem Oeffnen** | Dropbox-Mutation im Hintergrund — User koennte verwundert sein. |
| **B — Admin-Migrations-Button in Settings** | Explizit, kontrolliert, aber manueller Aufwand. |
| **C — Nur Viewer-Kompatibilitaet fuer `.txt`** (lesen bleibt, neue Dateien `.rtf`) | Kein Migrations-Stress, alte Dateien bleiben. |

**Empfehlung: C.** `.txt` bleibt lesbar, alle _neuen_ Dateien werden als `.rtf` angelegt. Admin kann bei Bedarf manuell konvertieren. **Keine stillen Dropbox-Mutationen.** Keine Warnung / kein Migrations-Dialog noetig — wir sind in der Dev-Phase, vorhandene `.txt`-Dateien sind Test-Daten.

### 2.6 Kompatibilitaet mit Cycle-Play / Takt-Navigation

Falls Takt-Marker fuer zukuenftige Audio-Sync-Features (Cycle-Play auf Takt-Ebene) genutzt werden sollen: Parser muss Marker mit Takt-Nummer liefern (`{ bar: 1, offset: 0 }`). **Scope-Frage — derzeit nicht im Plan, aber die Syntax sollte es erlauben.**

---

## 3. Implementierungs-Phasen

Jede Phase ist einzeln mergeable und E2E lauffaehig.

### Phase 0 — Spec-Freeze (kein Code)
- Designfragen oben durchentscheiden (ich → du).
- RTF-Subset schriftlich fixieren (in dieser Datei, Abschnitt 4).
- Syntax-Test-Dateien anlegen (`docs/samples/example.rtf`, `example.cho`) — als Referenz.

### Phase 1 — `.rtf`-Viewer (read-only)
- **Backend:**
  - `file_type = 'rtf'` in `Document`-Model ergaenzen (Migration).
  - `document_service.py`: RTF-Erkennung, Caching wie `.txt` (Text, nicht Binaer).
  - `api/documents.py`: `.rtf` in `list_documents` / `get_content` durchreichen.
- **Frontend:**
  - Neuer Parser `utils/rtfParser.ts` (Minimal-Subset, siehe 4).
  - Neue Komponente `components/ui/RtfViewer.tsx` — rendert Parser-Output als React-Baum mit CSS.
  - `DocumentPanel.tsx`: Branch `file_type === 'rtf'` → `RtfViewer`.
- **Test:** Sample-RTF aus TextEdit/Word in Dropbox legen, in App oeffnen, Formatierung muss korrekt sein.

### Phase 2 — Kommentar- & Takt-Marker-Erkennung
- `utils/markers.ts`: Parser fuer `[[ ... ]]` und `|`-Zeilenanfang.
- Marker werden im RTF-Viewer visuell hervorgehoben (z.B. Kommentar kursiv + Farbe, Takt-Marker fett).
- Gleicher Parser wird in `chordPro.ts` als zusaetzliche Syntax ergaenzt — `.cho` erkennt `[[ ... ]]` zusaetzlich zu `{c: ...}`.
- **Test:** `.rtf` und `.cho` mit Markern in beiden Viewern konsistent.

### Phase 3 — `.rtf`-Editor (WYSIWYG)
- Tiptap integrieren (neue Dep).
- Neue Komponente `components/ui/RtfEditor.tsx`:
  - Toolbar: B / I / U / S / Farbe / Hintergrund / Schriftgroesse.
  - Extra-Buttons: "Kommentar" (wrapped Selektion in `[[ ... ]]`), "Takt-Marker" (fuegt `|` am Zeilenanfang ein).
  - Auto-Save mit Debounce (alle 2s).
- `utils/rtfSerializer.ts` — Tiptap-Doc → RTF-String.
- Backend: neuer Endpunkt `PUT /documents/{id}/rtf-content` (analog zum bestehenden `update-content`).
- **Test:** In der App bearbeiten → in Dropbox anschauen (TextEdit) → dort formatieren → in App zurueckkehren, Aenderungen sichtbar.

### Phase 4 — `.cho` Parity-Update
- `chordPro.ts` erweitern: `[[ ... ]]`-Kommentare parsen, Takt-Marker `|` erkennen.
- `SheetEditor.tsx`: Toolbar-Buttons fuer Kommentar + Takt-Marker analog zu Phase 3.
- **Test:** Bestehende `.cho`-Dateien bleiben kompatibel, neue Marker zusaetzlich moeglich.

### Phase 5 — Upload-Flow & neue Dateien
- `PasteTextModal.tsx`: "Als RTF speichern" ist Default, Fallback `.cho` bei erkannten ChordPro-Direktiven.
- Neuer Button "Neuer Songtext" legt direkt `.rtf` in Dropbox an.

### Phase 6 — Doku
- `FEATURES.md` aktualisieren — RTF-Support, neue Marker-Syntax.
- `.txt`-Viewer bleibt erhalten (read-only).

---

## 4. RTF-Subset-Spezifikation (Entwurf)

Nur diese Control-Words werden verstanden. Alles andere wird beim Parsen ignoriert, beim Serialisieren nicht erzeugt.

### Struktur
- `{\rtf1\ansi\ansicpg1252 ... }` — Header (erwartet, sonst Fehler)
- `{\fonttbl ... }` — Font-Tabelle (geparst fuer Font-Namen)
- `{\colortbl ... }` — Farb-Tabelle (geparst fuer Farb-Index)
- `\par` — Absatz-Ende

### Character-Formatting
| Control | Bedeutung |
|---------|-----------|
| `\b` / `\b0` | Bold an/aus |
| `\i` / `\i0` | Italic an/aus |
| `\ul` / `\ulnone` | Underline an/aus |
| `\strike` / `\strike0` | Durchgestrichen an/aus |
| `\fs24` | Schriftgroesse (halbpunkte; 24 = 12pt) |
| `\cf2` | Vordergrund-Farbe, Index in `\colortbl` |
| `\highlight2` | Hintergrund-Farbe |
| `\f0` | Font, Index in `\fonttbl` (nur Anzeige, nicht editierbar in v1) |

### Sonderzeichen
- `\\`, `\{`, `\}` — Escape
- `\'XX` — Hex-Byte fuer Nicht-ASCII
- `\uNNNN ?` — Unicode-Codepoint

### Ignoriert in v1
- Tabellen (`\trowd`)
- Listen (`\pn`, `\pntext`) — evtl. in v2
- Bilder (`\pict`)
- Kopf-/Fusszeilen
- Alle anderen Control-Words (toleranter Skip)

### Marker (ChoirBox-spezifisch, im reinen Text)
- `[[ Kommentar ]]` — inline oder eigene Zeile
- `|` am Zeilenanfang (gefolgt von Leerzeichen) — Taktanfang
- `### Sektion` — Sektions-Header (Markdown-aehnlich; wird als fetter, farbiger Block gerendert)

---

## 5. Risiken & Gegenmassnahmen

| Risiko                                                       | Gegenmassnahme                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| RTF-Parser stolpert ueber ungewoehnliche Editor-Outputs      | Breiter Test-Korpus (TextEdit, Word, LibreOffice, WordPad, Pages). Unbekannte Tokens robust skippen.                                             |
| Tiptap-Bundle zu gross                                       | Code-Splitting — Editor wird nur geladen, wenn User ins Edit-Mode geht (dynamischer Import).                                                     |
| Formatierung bei Roundtrip verlustbehaftet                   | Explizite User-Warnung im Editor. Preserve-on-Passthrough in v2 nachziehen.                                                                      |
| `[[ ... ]]` kollidiert mit User-Text                         | Escape: `\[[` fuer literales `[[`. In der Praxis selten.                                                                                         |
| Bestehende `.cho`-Format-Kommentare (`# choirbox-format:`)   | Bleiben funktional (Phase 4 entfernt sie nicht — Legacy-Support). Neue `.cho` werden ohne sie geschrieben, wenn alle Formatierung in Runs passt. |
| Dropbox-Konflikt bei gleichzeitiger Bearbeitung (App + Word) | Bestehender `content_hash`-Mechanismus erkennt externe Aenderungen → App zeigt Konfliktdialog.                                                   |

---

## 6. Aufwandsschaetzung (grob)

| Phase              | Aufwand                                  |
| ------------------ | ---------------------------------------- |
| 0 — Spec           | 0.5 Tage (Hauptsaechlich Entscheidungen) |
| 1 — RTF-Viewer     | 2 Tage                                   |
| 2 — Marker-Parser  | 1 Tag                                    |
| 3 — RTF-Editor     | 3 Tage                                   |
| 4 — `.cho`-Parity  | 1 Tag                                    |
| 5 — Upload-Flow    | 0.5 Tage                                 |
| 6 — Migration/Doku | 0.5 Tage                                 |
| **Summe**          | **~8.5 Tage**                            |

---

## 7. Naechste Schritte

1. **Entscheide die 6 offenen Designfragen** in Abschnitt 2 (oder bestaetige die Empfehlungen).
2. **Lege Sample-Dateien** an (`docs/samples/example-textedit.rtf` etc.), damit der Parser reale Inputs kennt.
3. Erst danach startet Phase 1.
