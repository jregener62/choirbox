# Future: Akkord-Eingabe fuer .txt-Texte

## Idee

User oeffnet einen reinen Liedtext (`.txt`) und setzt Akkorde an exakte Zeichen-Positionen per Tap, ohne ChordPro-Syntax manuell tippen zu muessen. Ergebnis ist eine `.cho`-Datei mit korrekten `[Akkord]`-Markern.

Urspruenglicher Gedanke war handschriftliche Akkord-Erkennung auf Papier-Fotos. Durch iteratives Verfeinern wurde klar: Tap-auf-Silbe + Popover-Eingabe loest das Positionierungsproblem deterministisch, ohne OCR.

## Voraussetzungen

- Liedtext liegt als `.txt` (oder vergleichbar) bereits im System
- Darstellung in monospaced Schrift im Akkord-Modus (fuer lineare X-Positionierung)
- Existierendes Annotationen-Feature als Referenz (perfect-freehand ist bereits integriert und koennte fuer Phase 2 genutzt werden)

## Drei UX-Varianten (Mockups)

Ausgearbeitet in `docs/mockups/`:

- **[A — Keypad-Popover](../mockups/chord-input-a-keypad.html)**: Tap auf Silbe oeffnet Popover mit strukturiertem Akkord-Keypad (A-G, ♯/♭, m/maj/dim/sus/aug, Zahlen, Slash). Deterministisch, offline, keine ML-Abhaengigkeit.
- **[B — Mal-Canvas](../mockups/chord-input-b-draw.html)**: Tap oeffnet Canvas, User malt Akkord, Vision-API erkennt Token und zeigt Alternativen. Auto-Advance beim Tap auf naechste Silbe.
- **[C — Hybrid mit Tabs](../mockups/chord-input-c-hybrid.html)**: Popover mit drei Tabs (Tasten / Malen / Text), User waehlt bevorzugten Modus. Kombiniert Staerken von A und B.

Ausfuehrlicher Umsetzungs-Plan: `docs/plans/chord-input-feature.md`.

## Offene Design-Fragen

- **Speicher-Ziel:** Erzeugt das Feature eine **neue** `.cho`-Datei (z.B. `song.txt` → `song.cho`), oder ersetzt es die `.txt` inline? Oder eine separate „User-Chord-Layer" pro User (wie Annotationen)?
- **Mehrere User, ein Text:** Kann jeder User eigene Akkorde setzen (persoenliche Layer wie Annotationen), oder ist das ein Admin-Workflow der allen gilt?
- **Konflikt mit existierenden `.cho`:** Wenn bereits eine `.cho` zum Song vorhanden ist — ueberschreiben, mergen, neuer Name, oder Feature ausblenden?
- **Zeilen-Identitaet bei Textaenderung:** Wie wandern gesetzte Akkorde mit, wenn der Originaltext geaendert wird? Best effort per Zeilen-Index, oder stabile Zeilen-IDs?
- **Berechtigung:** Nur Members+, oder auch Guests?

## Technischer Ansatz

### Positions-Modell

Zeichen-Offset innerhalb einer Zeile ist die Quelle der Wahrheit. Jeder Akkord = `(line_index, char_offset, chord_token)`.

```
Zeile 0: "Amazing grace, how sweet the sound"
Akkord: {line: 0, col: 0, chord: "G"}    → [G]Amazing grace...
Akkord: {line: 0, col: 8, chord: "C"}    → [G]Amazing [C]grace...
```

Beim Speichern wird aus Text + Akkord-Liste die `.cho`-Syntax einmal erzeugt (Einfuegen von hinten nach vorn, damit Offsets stabil bleiben).

### Render-Modell

Text wird nicht mutiert. Im Viewer liegt ueber jeder Textzeile eine absolute positionierte Akkord-Reihe, positioniert per `ch`-Einheit (setzt monospace voraus).

```
   G        C          G
Amazing grace, how sweet
```

### Betroffene Bereiche

| Bereich | Aenderung |
|---|---|
| `backend/services/chord_export_service.py` (neu) | ChordPro-Body aus Text + Chord-Liste bauen, Regex-Validierung |
| `backend/api/chord_input.py` (neu) | POST `/export`, optional GET/PUT `/draft/{doc_id}` |
| `backend/policy/permissions.json` | Neue Action `chord_input.edit` |
| `frontend/src/components/ui/ChordInputViewer.tsx` (neu) | Text-Viewer mit tappbaren Zeichen, Popover-Mount |
| `frontend/src/components/ui/ChordKeypadPopover.tsx` (neu) | Variante A: Token-Builder |
| `frontend/src/hooks/useChordInput.ts` (neu) | State: Chord-Map, dirty, save |
| `frontend/src/utils/chordValidation.ts` (neu) | `^[A-G](#\|b)?(m\|maj\|sus\|dim\|aug)?\d*(/[A-G](#\|b)?)?$` |
| `frontend/src/components/ui/ChordSheetTextViewer.tsx` | Erweitern um Akkord-Modus-Toggle |
| `docs/FEATURES.md` | Feature + Berechtigungsmatrix |

### Herausforderungen

- **Monospace garantieren:** Im Akkord-Modus muss die Schrift zwingend monospaced sein, sonst stimmt die Zeichen-Position nicht mehr mit der Pixel-Position ueberein.
- **Popover-Positionierung:** Bei Zeilen nahe am Viewport-Rand muss das Popover flippen (unter statt ueber die Zeile). Evtl. Floating UI einbinden.
- **Aenderungen am Originaltext:** Wenn der Admin den Text nachtraeglich aendert, koennen gesetzte Akkorde an der falschen Stelle landen. Akzeptable Phase-1-Loesung: best effort, User kann korrigieren.
- **Export-Konflikt:** Wenn schon eine `.cho` existiert, klaeren wie verfahren wird (siehe offene Fragen).

## Phasen

### Phase 1 — Keypad-MVP (Variante A)

Minimal funktionsfaehige Umsetzung mit deterministischem Keypad. Kein Vision-API-Call, kein externes ML. Ziel: Feature ist benutzbar, ohne Kosten oder Online-Abhaengigkeit.

**Aufwand:** 1–2 Tage.

### Phase 2 — Mal-Canvas (Variante B)

Addiert den handschriftlichen Modus. Canvas-Popover schickt Strokes an Backend, Backend ruft Claude Vision auf, gibt Token + Alternativen zurueck. Nutzt das bereits installierte `perfect-freehand`.

**Aufwand:** 2–3 Tage. Erfordert API-Key und Kostenbetrachtung.

### Phase 3 — Hybrid (Variante C)

Tab-Komponente im Popover, User-Praeferenz pro Account persistieren. Auto-Advance beim Tap auf naechstes Zeichen.

**Aufwand:** 1 Tag zusaetzlich.

---

## Status

**Konzept fertig — wartet auf Go fuer Phase 1.** Vor Start muessen die offenen Design-Fragen (Speicher-Ziel, Mehrfach-User, `.cho`-Konflikt) geklaert sein.
