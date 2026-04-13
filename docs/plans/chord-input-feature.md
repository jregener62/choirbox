# Akkord-Eingabe fuer .txt-Texte

## Kontext

User oeffnet einen reinen Liedtext (`.txt` oder Plain-Text-Teil eines Dokuments) und will Akkorde an exakte Zeichen-Positionen setzen, ohne ChordPro-Syntax manuell zu schreiben. Ergebnis: eine `.cho`-Datei mit `[Akkord]`-Markern an den richtigen Stellen.

Drei UX-Varianten sind in `docs/mockups/chord-input-*.html` ausgearbeitet:

- **A — Keypad-Popover**: deterministisch, offline, schnell. Button-Grid fuer Noten/Modifier.
- **B — Mal-Canvas**: handschriftlich im Popover, Vision-API erkennt Token.
- **C — Hybrid mit Tabs**: Keypad/Malen/Text im selben Popover, Mode wird pro User gemerkt.

**Empfehlung:** Phase 1 als **Variante A** umsetzen. Sie loest 80% des Problems ohne externe Abhaengigkeiten. Mal-Modus erst addieren, wenn echter Bedarf da ist.

---

## Ansatz

**Positions-Modell:** Zeichen-Offset innerhalb einer Zeile ist die Quelle der Wahrheit. Jeder gesetzte Akkord ist ein Tupel `(line_index, char_offset, chord_token)`. Daraus wird zur Laufzeit (oder beim Speichern als `.cho`) ChordPro generiert — `[C]` wird an der Zeichenposition in die Textzeile eingefuegt.

**Render-Modell:** Der Text wird nicht mutiert. Stattdessen rendern wir im Viewer ueber jeder Zeile eine absolute positionierte Akkord-Reihe. Zeichen-Offset * Zeichenbreite (monospaced!) = pixel-left. Beim Export wird die finale `.cho`-Syntax einmal erzeugt.

**Eingabe-Flow (Variante A):**

1. User aktiviert im Viewer „Akkord-Modus" (Toolbar-Button).
2. Jedes nicht-leere Zeichen wird tappable.
3. Tap oeffnet Popover ueber der Zeile, positioniert so dass das getappte Zeichen markiert bleibt.
4. Keypad baut das Token auf: Note -> optional ♯/♭ -> optional m/maj/dim/sus/aug -> optional Zahl -> optional `/Bass`.
5. Live-Preview zeigt das aktuelle Token in der Popover-Header-Zeile.
6. „Setzen" schliesst Popover und rendert den Akkord.
7. Bestehender Akkord an dieser Position ersetzt, leeres Token loescht.

**Speicher-Modell:** Waehrend der Bearbeitung Live-Overlay, kein DB-Write pro Tap. `Speichern`-Button unten erzeugt `.cho` und persistiert — optional auch Auto-Save mit Debounce.

---

## Neue Dateien

| # | Datei | Beschreibung |
|---|-------|-------------|
| 1 | `backend/services/chord_export_service.py` | Build `.cho` aus `(line_index, char_offset, chord)` + Originaltext |
| 2 | `backend/api/chord_input.py` | POST `/api/chord-input/export` (txt + chords -> cho), GET/PUT `/api/chord-input/draft/{doc_id}` |
| 3 | `backend/models/chord_input_draft.py` | Optional: Entwuerfe pro User+Doc persistieren (user_id, document_id, chords_json, updated_at) |
| 4 | `frontend/src/components/ui/ChordInputViewer.tsx` | Text-Viewer mit tappbaren Zeichen + Popover-Mount |
| 5 | `frontend/src/components/ui/ChordKeypadPopover.tsx` | Variante A: Keypad-UI, bauen/editieren eines Tokens |
| 6 | `frontend/src/components/ui/ChordCanvasPopover.tsx` | Variante B (Phase 2): Canvas + Recognition-API-Call |
| 7 | `frontend/src/components/ui/ChordInputToolbar.tsx` | Moduswechsel, Speichern, Abbrechen, Undo |
| 8 | `frontend/src/hooks/useChordInput.ts` | Zustand Store: `chords: Map<key, token>`, `addChord`, `removeChord`, `dirty`, `save()` |
| 9 | `frontend/src/utils/chordValidation.ts` | Regex-Validator fuer Akkord-Token |
| 10 | `frontend/src/utils/chordExport.ts` | Client-seitig: aus Chord-Map + Originaltext den ChordPro-Body erzeugen (Preview) |

## Zu aendernde Dateien

| Datei | Aenderung |
|-------|-----------|
| `backend/app.py` | Router registrieren |
| `backend/policy/permissions.json` | Neue Action `chord_input.edit` fuer Members+ |
| `frontend/src/types/index.ts` | `ChordPosition`, `ChordInputDraft` Types |
| `frontend/src/pages/SongPage.tsx` (o.ae.) | Route/Button „Akkorde hinzufuegen" fuer `.txt`-Dokumente |
| `frontend/src/styles/tokens.css` | Ggf. neue Tokens fuer Akkord-Farbe (`--chord`), falls nicht vorhanden |
| `docs/FEATURES.md` | Feature dokumentieren, Berechtigungsmatrix erweitern |

---

## Backend-Design

### Chord Export Service

```python
# chord_export_service.py

CHORD_RE = re.compile(r'^[A-G](#|b)?(m|maj|sus|dim|aug)?(\d+)?(/[A-G](#|b)?)?$')

@dataclass
class ChordPosition:
    line_index: int
    char_offset: int
    chord: str

def build_chordpro(text: str, chords: list[ChordPosition]) -> str:
    """
    text: Originaltext mit \n-getrennten Zeilen
    chords: Liste der Positionen, sortiert nach line_index, char_offset DESC
            (hinten zuerst einfuegen, damit vordere Offsets stabil bleiben)
    """
    lines = text.split('\n')
    by_line: dict[int, list[ChordPosition]] = defaultdict(list)
    for c in chords:
        if not CHORD_RE.match(c.chord):
            raise ValueError(f"Invalid chord: {c.chord}")
        by_line[c.line_index].append(c)

    out = []
    for idx, line in enumerate(lines):
        positions = sorted(by_line[idx], key=lambda x: x.char_offset, reverse=True)
        for p in positions:
            offset = min(p.char_offset, len(line))
            line = line[:offset] + f"[{p.chord}]" + line[offset:]
        out.append(line)
    return '\n'.join(out)
```

### API

```
POST /api/chord-input/export
Body: { document_id, chords: [{line_index, char_offset, chord}] }
Response: { cho_content: str, filename: str }

PUT /api/chord-input/draft/{document_id}
Body: { chords: [...] }
Response: { saved_at }

GET /api/chord-input/draft/{document_id}
Response: { chords: [...] } | 404
```

Drafts sind optional — Phase 1 kann rein im Frontend-State leben, Speichern erzeugt direkt die `.cho`. Drafts lohnen sich, sobald User eine laengere Bearbeitung unterbrechen wollen.

---

## Frontend-Design

### State (`useChordInput.ts`)

```ts
type ChordKey = `${number}:${number}`  // "line_index:char_offset"

interface ChordInputState {
  documentId: number
  text: string                           // Original-Text
  chords: Map<ChordKey, string>          // Position -> Token
  activeCell: { line: number; col: number } | null
  dirty: boolean
  setChord(line: number, col: number, token: string): void
  removeChord(line: number, col: number): void
  setActiveCell(cell | null): void
  buildChordPro(): string                // Preview
  save(): Promise<void>                  // POST export + Datei speichern
}
```

### Rendering (`ChordInputViewer.tsx`)

Pro Zeile:

```tsx
<div className="line" style={{ position: 'relative' }}>
  <div className="chord-row">
    {chordsInLine.map(c => (
      <span
        key={c.col}
        className="chord-token"
        style={{ left: `${c.col}ch` }}
      >
        {c.token}
      </span>
    ))}
  </div>
  {[...line].map((ch, col) => (
    <span
      className="char tappable"
      onClick={() => setActiveCell({ line, col })}
    >
      {ch}
    </span>
  ))}
</div>
```

**Wichtig:** `font-family: monospace` fuer korrekte `ch`-Einheit und damit lineare X-Positionierung. Der bestehende `ChordSheetTextViewer.tsx` ist der Ausgangspunkt — nicht neu bauen, erweitern.

### Popover-Positionierung

Floating UI (lib `@floating-ui/react` — bereits im Projekt? pruefen) oder simple Eigenlosung: `getBoundingClientRect` vom aktiven Char, Popover absolut mit `top`, `left`, Pfeil ueber X-Offset ausgerichtet. Bei Viewport-Kollision: Popover unterhalb der Zeile statt oberhalb.

### Validierung

```ts
// chordValidation.ts
const CHORD_RE = /^[A-G](#|b)?(m|maj|sus|dim|aug)?(\d+)?(\/[A-G](#|b)?)?$/
export const isValidChord = (s: string) => CHORD_RE.test(s)
```

Preview-Header im Popover zeigt rot, wenn ungueltig. Setzen-Button disabled.

---

## Phasen

### Phase 1 — Keypad-MVP (Mockup A)

1. Bestehenden `ChordSheetTextViewer` um Tappable-Mode erweitern (Toolbar-Toggle).
2. `ChordKeypadPopover` implementieren — Token-Builder mit Live-Preview.
3. `useChordInput` Store.
4. Chord-Overlay-Rendering (absolute positioniert, `ch`-Einheit).
5. Backend `chord_export_service` + POST-Endpoint.
6. „Speichern"-Flow: erzeugt `.cho`, ersetzt oder ergaenzt das Dokument (hier: **Rueckfrage an Entwickler noetig** — neue Datei, oder Original ersetzen, oder Kopie mit Suffix?).
7. E2E-Test in Preview.
8. FEATURES.md aktualisieren, Commit, Deploy.

**Aufwand:** 1–2 Tage.

### Phase 2 — Mal-Canvas (Mockup B)

1. `ChordCanvasPopover` — kleines SVG-Canvas (perfect-freehand ist schon da via Annotation-Feature!), Undo, Leeren.
2. Backend-Endpoint `POST /api/chord-input/recognize` mit Canvas-PNG oder Stroke-JSON im Body.
3. Recognition-Service (`services/chord_recognition_service.py`): Claude Vision Call, JSON-Response mit `{chord, confidence, alternatives}`.
4. Frontend rendert Haupt-Vorschlag + Alternativen als Chips.
5. Lernen aus Korrekturen optional speichern (nur wenn DSGVO geklaert).

**Aufwand:** 2–3 Tage. Erfordert API-Key + Kostenbetrachtung (Claude Vision pro Call).

### Phase 3 — Hybrid (Mockup C)

1. Popover um Tab-Komponente erweitern.
2. `useChordInput` um `preferredMode: 'keypad' | 'draw' | 'text'` erweitern, pro User persistieren.
3. Text-Tab: `<input>` mit Regex-Validierung, Live-Fehlermeldung.
4. Auto-Advance beim Tap auf naechstes Zeichen (commit + oeffnen an neuer Position).

**Aufwand:** 1 Tag zusaetzlich, vorausgesetzt Phase 1+2 stehen.

---

## Offene Fragen (vor Start klaeren)

1. **Speicher-Ziel:** Erzeugt das Feature eine **neue** `.cho`-Datei (z.B. `song.txt` -> `song.cho`), oder ersetzt es die `.txt` inline? Oder entsteht eine separate „User-Chord-Layer" pro User (wie Annotationen)?
2. **Mehrere User, ein Text:** Kann jeder User eigene Akkorde setzen, oder ist das ein Admin-Workflow der allen gilt?
3. **Konflikt mit existierenden `.cho`:** Was passiert, wenn schon eine `.cho` zum Song existiert? Ueberschreiben? Mergen? Neuer Name?
4. **Zeilen-Identitaet:** Was, wenn sich der Originaltext aendert (z.B. Admin korrigiert Tippfehler) — wie wandern gesetzte Akkorde mit? Phase-1-Antwort: best effort per Zeilen-Index, bei starker Abweichung verwerfen.
5. **Proportionale Schrift:** Aktueller Text-Viewer — ist monospace garantiert? Wenn nicht, braucht Phase 1 eine CSS-Aenderung (`font-family: 'Menlo', monospace` nur im Akkord-Modus).

---

## Tests

- **Backend:** `test_chord_export.py` — Build-Logik, Edge-Cases (Offset > Zeilenlaenge, leere Zeilen, Unicode, mehrere Akkorde pro Zeile, Reihenfolge-Stabilitaet).
- **Frontend:** `chordValidation.test.ts` — Regex gegen bekannte gueltige/ungueltige Tokens.
- **Frontend:** `useChordInput.test.ts` — Store-Logik (set, remove, build).
- **E2E (manuell in Preview):** Kompletter Flow von Akkord-Modus aktivieren bis `.cho`-Download.
