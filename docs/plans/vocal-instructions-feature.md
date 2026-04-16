# Gesangsanweisungen — Vocal Instructions

## Kontext

Analog zur Akkord-Eingabe (`chord-input-feature.md`) sollen SaengerInnen Anweisungen wie Atempause, Zaehlzeit, Intervallsprung, Dynamik, Crescendo/Decrescendo, Fermate usw. exakt an Textpositionen setzen koennen. Ergebnis: dieselbe `.cho`-Datei kann zusaetzlich zu Akkorden auch Gesangsanweisungen tragen, ohne das ChordPro-Format zu brechen.

Mockup: `docs/mockups/vocal-instructions-a.html`.

---

## Ansatz

**Vokabular an ABC-Notation angelehnt** — statt eigene Zeichen zu erfinden, uebernehmen wir das etablierte Decoration-Vokabular der ABC-Notation (`!breath!`, `!fermata!`, `!crescendo(!` usw.) und verpacken es in ChordPro-konforme Brace-Syntax `{v:xxx}`. Damit:

- Andere ChordPro-Reader ignorieren unbekannte Direktiven → `.cho`-Dateien bleiben kompatibel
- Kein Konflikt mit bestehender `[Chord]`-Syntax
- Wiedererkennbares Vokabular fuer alle, die ABC kennen

**Zwei Anweisungs-Typen:**

1. **Punktuelle Anweisungen** — ein Token an einer exakten Zeichenposition. Beispiele: Atempause, Fermate, Zaehlzeit, Einzelintervall, Dynamik-Marker, Staccato, Einsatz.
2. **Bereichs-Anweisungen** — Start/Ende als Paar an zwei Zeichenpositionen, verbunden durch eine ID. Beispiele: Crescendo, Decrescendo. Beim Rendern wird dazwischen ein echter SVG-Hairpin gezeichnet, statt einen Pfeil zu zeigen.

**Datenmodell analog zu Akkorden:**

```ts
// Punktuell
type VocalMark = {
  line: number;       // 0-basiert
  col: number;        // Zeichen-Offset in der Zeile
  token: string;      // "breath", "fermata", "mf", "1", "+5", ...
};

// Bereich (Paar)
type VocalRange = {
  id: string;                // verbindet Start/Ende
  kind: "cresc" | "dim";
  start: { line: number; col: number };
  end:   { line: number; col: number };
};
```

**Render-Modell:** Wie beim Akkord-System werden Symbole als absolute Overlays ueber bzw. unter der Textzeile positioniert (Zeichen-Offset * `ch`-Breite in Monospace). Oben: Atem, Intervall, Artikulation, Fermate, Einsatz. Unten: Zaehlzeit, Dynamik, Crescendo-Hairpins.

**Eingabe-Flow:**

1. User aktiviert im Viewer „Anweisungs-Modus" (neuer dritter Mode-Switch-Button: Lesen / Akkord / Anweisungen).
2. Lang-Druck auf ein Zeichen oeffnet Popover mit Kategorie-Tabs (Atem · Zaehlzeit · Intervall · Dynamik · Verlauf · Artikulation · Einsatz).
3. Live-Preview zeigt Token und gerendertes Symbol.
4. „Setzen" schliesst Popover und rendert Anweisung.
5. Fuer Bereichs-Anweisungen (Crescendo/Decrescendo): erster Tap setzt Start, zweiter Tap setzt Ende — zwischen beiden wird automatisch der Hairpin gerendert.

**Koexistenz mit Akkorden:** Akkorde oben ueber Zeile (bestehend), Anweisungen darunter bzw. darueber in eigenen Reihen. Zeilenhoehe wird dynamisch angepasst je nachdem, welche Reihen besetzt sind.

---

## Token-Vokabular (ABC-kompatibel)

### Punktuell

| Token | Rendering | Beschreibung | ABC-Quelle |
|-------|-----------|--------------|------------|
| `{v:breath}` | `ʼ` | Atempause | `!breath!` |
| `{v:caesura}` | `‖` | Luftpause (lang) | `!caesura!` |
| `{v:fermata}` | `𝄐` | Fermate | `!fermata!` |
| `{v:staccato}` | `·` | Staccato | `!.!` |
| `{v:tenuto}` | `—` | Tenuto | `!tenuto!` |
| `{v:accent}` | `>` | Akzent | `!>!` |
| `{v:pp}` … `{v:ff}` | *pp* … *ff* (italic) | Dynamik | `!pp!` … `!ff!` |
| `{v:segno}` / `{v:coda}` / `{v:fine}` | `𝄋` / `𝄌` / *fine* | Navigation | `!segno!` usw. |
| `{v:1}` … `{v:8}` | `①`…`⑧` | Zaehlzeit *(eigene Erw.)* | — |
| `{v:+1}` … `{v:+12}` / `{v:-1}` … `{v:-12}` | `↑5` / `↓3` … | Intervall hoch/runter, 1–12 Halbtoene *(eigene Erw.)* | — |
| `{v:entry}` | `▶` | Einsatz *(eigene Erw.)* | — |

### Bereichs-Anweisungen (Paar-Marker)

| Token | Rendering | Beschreibung | ABC-Quelle |
|-------|-----------|--------------|------------|
| `{v:cresc(}` … `{v:cresc)}` | SVG-Hairpin `<═══` | Crescendo | `!crescendo(!` … `!crescendo)!` |
| `{v:dim(}` … `{v:dim)}` | SVG-Hairpin `═══>` | Decrescendo | `!diminuendo(!` … `!diminuendo)!` |

### Farbcodierung

| Kategorie | CSS-Token | Farbe |
|-----------|-----------|-------|
| Atem | `--v-breath` | cyan |
| Zaehlzeit | `--v-beat` | lime |
| Intervall | `--v-interval` | amber |
| Dynamik | `--v-dyn` | purple |
| Verlauf (Hairpin) | `--v-hairpin` | light green |
| Artikulation | `--v-artic` | neutral |
| Einsatz | `--v-entry` | red |

---

## Neue Dateien

| # | Datei | Beschreibung |
|---|-------|-------------|
| 1 | `backend/services/vocal_export_service.py` | Build `.cho` aus Marks + Ranges + Originaltext (analog `chord_export_service.py`) |
| 2 | `backend/api/vocal_input.py` | POST `/api/vocal-input/export` (text + marks + ranges -> cho) |
| 3 | `frontend/src/components/ui/VocalInputViewer.tsx` | Viewer mit tappbaren Zeichen + Popover-Mount (analog `ChordInputViewer`) |
| 4 | `frontend/src/components/ui/VocalInstructionPopover.tsx` | Kategorie-Tabs + Palette + Live-Preview |
| 5 | `frontend/src/components/ui/VocalHairpin.tsx` | SVG-Hairpin-Komponente fuer Crescendo/Decrescendo |
| 6 | `frontend/src/hooks/useVocalInput.ts` | Zustand Store: `marks: Map`, `ranges: Map`, CRUD-Operationen |
| 7 | `frontend/src/utils/vocalValidation.ts` | Token-Validator (Whitelist der erlaubten Tokens) |
| 8 | `frontend/src/utils/vocalExport.ts` | Client-seitig ChordPro-Body bauen (fuer Preview) |

## Zu aendernde Dateien

| Datei | Aenderung |
|-------|-----------|
| `backend/app.py` | Router registrieren |
| `backend/policy/permissions.json` | **Keine neue Action** — bestehende `chord_input.edit` deckt Vocal-Input mit ab |
| `frontend/src/types/index.ts` | `VocalMark`, `VocalRange` Types |
| `frontend/src/components/ui/TextViewer.tsx` | Button „Anweisungen hinzufuegen" fuer `.txt` |
| `frontend/src/components/ui/ChordSheetTextViewer.tsx` | Mode-Switch erweitern um „Anweisungen" |
| `frontend/src/styles/tokens.css` | Neue Tokens: `--v-breath`, `--v-beat`, `--v-interval`, `--v-dyn`, `--v-hairpin`, `--v-artic`, `--v-entry` |
| `docs/FEATURES.md` | Feature dokumentieren, Berechtigungsmatrix erweitern |

---

## Phasen

**Phase 1 — MVP (punktuelle Anweisungen)**
- Alle punktuellen Tokens: Atem, Fermate, Dynamik (pp…ff), Staccato, Tenuto, Akzent, Einsatz, Zaehlzeit (1–8), Intervall
- Popover mit Kategorie-Tabs
- Backend `POST /vocal-input/export`
- Integration in `TextViewer` und `ChordSheetTextViewer` als dritter Edit-Mode
- Permission: bestehende `chord_input.edit` wiederverwenden

**Phase 2 — Bereichs-Anweisungen**
- Crescendo / Decrescendo als Paar-Marker mit SVG-Hairpin-Rendering
- Zwei-Schritt-Setzen im Popover (Start → Ende)
- Loeschen eines Endes entfernt das ganze Paar

**Phase 3 — Feinschliff**
- Segno/Coda/Fine
- Kollisions-Handling wenn Akkorde + Anweisungen auf derselben Zeile knapp werden
- Tastatur-Shortcuts (Desktop)
- Undo/Redo

---

## Entscheidungen

1. **Zeilenhoehe — adaptiv.** Eine Zeile waechst nur dann, wenn tatsaechlich Markup in einer Reihe (oben/unten) gesetzt ist. Leere Zeilen bleiben schmal. Umsetzung: pro Zeile berechnen, ob `mark-above` / `mark-below` / `hairpin` existieren, und die Zeilenhoehe entsprechend als `1.5em` / `2.6em` / `3.8em` setzen.
2. **Intervall-Zahlen — 1 bis 12.** Tokens `{v:+1}` … `{v:+12}` und `{v:-1}` … `{v:-12}`. Deckt chromatisch alles bis zur Oktave und etwas darueber ab. Rendering: `↑7`, `↓12` usw.
3. **Berechtigung — gleiche wie Chord-Input.** Keine neue Action `vocal_input.edit`, stattdessen `chord_input.edit` mitnutzen. Weniger Policy-Aufwand, semantisch: „kann in Text-Dateien editieren".
4. **Export kompatibel — ja.** `.cho`-Dateien enthalten nur ChordPro-konforme `{v:xxx}`-Direktiven. Externe ChordPro-Reader ignorieren unbekannte Direktiven still. Akzeptiert.
5. **Hairpin-Rendering — inline SVG.** Konsistent mit bestehendem Code: App nutzt `lucide-react` (SVG-Icons) plus inline SVG in `DocumentPanel.tsx`, `ChordSheetTextViewer.tsx`, `AnnotatedPage.tsx`, `TopPlayerBar.tsx`, `PlayerPage.tsx`, `FolderImportIcon.tsx`. Kein CSS-Only-Ansatz in der Codebase — also SVG.

---

## Test-Plan

- **Unit (Backend)**: `vocal_export_service` baut korrekt `.cho` mit `{v:xxx}`-Direktiven an richtigen Positionen; Roundtrip Text → Export → Parse erhaelt alle Marks.
- **Unit (Frontend)**: `useVocalInput`-Hook — set/remove/move fuer punktuelle Marks; Paar-Logik fuer Ranges (Orphan-Handling wenn Start ohne Ende o.ae.).
- **E2E**: In Preview-UI drei Marks pro Kategorie setzen, speichern, erneut oeffnen, Marks sind an richtigen Positionen.
- **Visueller Regressionstest**: Mockup-Screenshot vs. gerenderte `.cho`-Datei.
