# Plan: Marker-basiertes Loop-System

## Kontext

Bisher werden Loops ueber zwei grosse A/B-Buttons gesetzt, die den Loop-Start/End auf die aktuelle Playback-Position setzen. Das wird ersetzt durch ein System, bei dem Loops ueber bereits gesetzte Marker definiert werden. Der Loop-Button bekommt drei Modi (Off/Set/Play), die per Klick durchgeschaltet werden.

## Dateien

| Datei | Aenderung |
|---|---|
| `frontend/src/stores/playerStore.ts` | Neuer State + Actions |
| `frontend/src/pages/PlayerPage.tsx` | A/B-Buttons entfernen, Loop-Button + Marker-Klick |
| `frontend/src/components/ui/Waveform.tsx` | A/B-Labels entfernen |
| `frontend/src/styles/index.css` | Neue Styles, alte entfernen |

## 1. playerStore.ts

### Neuer State
```typescript
loopMode: 'off' | 'set' | 'play'   // Default: 'off'
selectedMarkerIds: string[]          // Max 2 IDs, Default: []
```

### Neue/geaenderte Actions

**`cycleLoopMode()`** — ersetzt den alten Loop-Button:
- `off` → `set`: Selection-Modus, loopEnabled=false, selectedMarkerIds=[], loopStart/End=null, activeSection=null
- `set` → `play`: Nur wenn 2 Marker selektiert → loopEnabled=true
- `set` → `off`: Wenn <2 Marker → abbrechen, alles zuruecksetzen
- `play` → `off`: Loop deaktivieren, alles zuruecksetzen

**`selectMarkerForLoop(markerId)`** — Marker-Klick im Set-Modus:
- 0 selektiert → Marker wird 1. Selektion
- 1 selektiert → gleicher Marker = deselektieren, anderer = 2. Selektion
- 2 selektiert, Klick auf bereits selektierten → deselektieren (zurueck auf 1)
- 2 selektiert, Klick auf neuen:
  - Neuer Marker spaeter als Endpunkt → ersetzt Endpunkt
  - Neuer Marker frueher als Anfangspunkt → ersetzt Anfangspunkt
  - Neuer Marker dazwischen → ersetzt den zeitlich naeheren
- Bei 2 selektierten: loopStart = min(zeit), loopEnd = max(zeit) berechnen

**Bestehende Actions anpassen:**
- `clearLoop()` → zusaetzlich `loopMode: 'off'`, `selectedMarkerIds: []`
- `setSectionLoop()` → setzt `loopMode: 'play'`, `selectedMarkerIds: []`
- `toggleLoop()` → setzt `loopMode: 'play'`/`'off'` (fuer Gap-Loop-Kompatibilitaet)
- `removeMarker()` → filtert aus `selectedMarkerIds`, loescht Loop wenn <2 uebrig
- `clearMarkers()` → resettet auch Loop-State
- `setTrack()` → resettet `loopMode: 'off'`, `selectedMarkerIds: []`

## 2. PlayerPage.tsx

### Entfernen
- A/B-Button-Handler (`setA`, `setB`) — Zeilen 42-43
- A/B-Buttons + alte Loop-Row — Zeilen 160-174

### Aendern

**Store-Subscription** (Zeile 27-33): `loopMode`, `selectedMarkerIds` hinzufuegen

**Marker-Chips** (Zeilen 134-156): Klick-Verhalten aendern:
- Im Set-Modus: `selectMarkerForLoop(m.id)` aufrufen
- Sonst: `seek(m.time)` wie bisher
- CSS-Klassen: `marker-chip--selectable` (im Set-Modus), `marker-chip--selected` (wenn selektiert)

**Neue Loop-Row**: Ein einzelner Loop-Button (nur Repeat-Icon) mit Farbklassen:
- `off`: Standard-Farbe (kein Zusatz)
- `set`: `player-ctrl-amber` (orange)
- `play`: `player-ctrl-green` (gruen)
- Daneben X-Button zum Abbrechen (nur wenn loopMode !== 'off')

## 3. Waveform.tsx

**Entfernen:** A/B-Label-Block (Zeilen 90-104) — die "A"/"B" Textlabels auf dem Canvas.
Loop-Region-Einfaerbung (amber bars) bleibt bestehen.

## 4. index.css

**Entfernen:** `.player-ab-btn` und `.player-ab-btn.active` Styles

**Hinzufuegen:**
```css
.player-ctrl-btn.player-ctrl-green { color: #4ade80; }

.marker-chip--selectable { cursor: pointer; }
.marker-chip--selected {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
}
.marker-chip--selected .marker-dot { background: #f59e0b; }
```

## Nicht betroffen

- `useAudioPlayer.ts` — liest nur `loopStart/loopEnd/loopEnabled`, keine Aenderung
- `UnifiedTimeline.tsx` — leitet State nur durch, keine Aenderung
- Section-Loop (Klick auf Section in Timeline) — funktioniert weiter via `setSectionLoop()`
- Gap-Loop (Klick auf Luecke in Timeline) — funktioniert weiter via `setLoopStart/End` + `toggleLoop`

## Testen

1. Backend + Frontend starten
2. Track abspielen, mehrere Marker setzen
3. Loop-Button klicken → orange (Set-Modus), Marker-Chips werden klickbar
4. Zwei Marker anklicken → gelber Rahmen, Waveform zeigt amber Region
5. Loop-Button klicken → gruen (Play-Modus), Audio loopt zwischen Markern
6. Loop-Button klicken → aus, alles zurueckgesetzt
7. Section-Loop testen (Klick auf Section in Timeline) → muss weiterhin funktionieren
8. Gap-Loop testen → muss weiterhin funktionieren
9. Marker loeschen waehrend selektiert → Loop wird korrekt aufgeraeumt
10. Track wechseln → alles resettet
