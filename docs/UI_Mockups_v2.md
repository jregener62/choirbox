# ChoirBox — UI Mockups v2

**Version:** 1.0
**Letzte Aenderung:** 26.03.2026
**Status:** Konzept
**Zweck:** Ueberarbeitete UI-Konzepte basierend auf Marktrecherche und Music CMD Design-Sprache

---

## Design-Entscheidungen

### Icon-Library: Lucide React
- Schlanke, tree-shakable SVG Icons (200-500 Bytes pro Icon)
- 2px Stroke, runde Ecken — gleicher Stil wie Spotify/Music CMD
- Alle benoetigten Audio-Icons vorhanden: Play, Pause, SkipBack, SkipForward, Repeat, Heart, Folder, Settings, Pin, Trash2, Music, ChevronDown, Search
- Install: `npm install lucide-react`

### Farbsystem (von Music CMD adaptiert)
```
Accent:       #e88c30 (Orange, wie Music CMD) oder #818cf8 (Indigo, aktuell)
Played:       Accent-Farbe
Unplayed:     #555555 (Dark) / #CCCCCC (Light)
Loop-Region:  #f59e0b (Amber) — bewusst andere Farbe als Played
Marker:       #fbbf24 (Gold)
Danger:       #f87171
Success:      #4ade80
```

### Typografie
- Font: Inter (wie Music CMD) oder System-Font-Stack
- Track-Titel: 16-18px, semibold
- Subtitles: 13-14px, regular, 60% opacity
- Timestamps: 12-13px, tabular-nums (Monospace-Zahlen)

---

## Konzept A: "Spotify-Style" (Waveform zentriert)

Bewaehrtes Layout von Spotify/Apple Music, aber mit Waveform statt Album-Art.
Waveform ist das Hero-Element, Transport darunter im Thumb-Zone.

```
┌─────────────────────────────┐
│  ChevronDown   Wird abgesp. │  ← Topbar: Zurueck-Pfeil (kein Emoji!)
├─────────────────────────────┤
│                             │
│   Sopran - Ave Maria.mp3    │  ← Track-Name, gross, semibold
│   /Fruehlingskonzert        │  ← Ordner-Pfad, klein, muted
│                             │
│  ┌─────────────────────────┐│
│  │▁▂▃▅▇▆▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅││  ← Waveform (80-100px hoch)
│  │████████|░░░░░░░░░░░░░░░░││     Blau = gespielt
│  │   [A]══════════[B]      ││     Amber = Loop-Region
│  └─────────────────────────┘│     Tap = Seek
│  0:42                  3:15 │  ← Timestamps links/rechts
│                             │
│                             │
│                             │
│     Repeat  SkipBack        │
│               [PLAY]        │  ← Grosser Play-Button (56px)
│             SkipForward     │
│                    Loop-AB  │
│                             │
│  [A-B]    [Marker]   [1.0x] │  ← Sekundaere Controls
│                             │
│  Markers: ● 0:45  ● 1:23   │  ← Gesetzte Marker (Chips)
│                             │
└─────────────────────────────┘
```

**Vorteile:**
- Waveform prominent sichtbar, Track-Info oben
- Transport im Thumb-Zone (unteres Drittel)
- A-B Loop visuell auf der Waveform + Button-Reihe
- Spotify-Nutzer fuehlen sich sofort zu Hause

---

## Konzept B: "SoundCloud-Style" (Waveform ganz oben)

Waveform dominiert den oberen Bereich. Track-Info und Controls darunter.
Fokus auf die Audio-Visualisierung.

```
┌─────────────────────────────┐
│  ChevronDown   Wird abgesp. │
├─────────────────────────────┤
│  ┌─────────────────────────┐│
│  │                         ││
│  │▁▂▃▅▇▆▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅││  ← Waveform GROSS (120px)
│  │████████|░░░░░░░░░░░░░░░░││     mit A/B Marker direkt drin
│  │   [A]══════════[B]      ││
│  │                         ││
│  └─────────────────────────┘│
│  0:42                  3:15 │
│                             │
│   Sopran - Ave Maria.mp3    │  ← Track-Name
│   /Fruehlingskonzert        │  ← Ordner
│                             │
│  ┌───┐  ┌───┐  ┌─────┐  ┌──┐│
│  │ A │  │ B │  │ Loop│  │ X││  ← A-B Controls als Reihe
│  └───┘  └───┘  └─────┘  └──┘│
│                             │
│                             │
│   -15  [  ▶  PLAY  ]  +15  │  ← Transport: gross, zentriert
│                             │
│  ● 0:45  ● 1:23  [+Marker] │  ← Marker-Chips + Add-Button
│                             │
└─────────────────────────────┘
```

**Vorteile:**
- Waveform als Hero-Element (groesser, beeindruckender)
- A-B Controls naeher an der Waveform (raeumlicher Zusammenhang)
- Transport ganz unten = maximale Thumb-Erreichbarkeit
- Marker-Reihe am unteren Rand leicht erreichbar

---

## Konzept C: "Practice-First" (Controls optimiert fuer Ueben)

Optimiert fuer den Uebungs-Workflow: Die haeufigsten Aktionen
(A-B setzen, Loop, Play/Pause) sind alle im Thumb-Zone.

```
┌─────────────────────────────┐
│  ChevronDown   Wird abgesp. │
├─────────────────────────────┤
│                             │
│   Sopran - Ave Maria.mp3    │
│   /Fruehlingskonzert        │
│                             │
│  ┌─────────────────────────┐│
│  │▁▂▃▅▇▆▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅││  ← Waveform (80px)
│  │████████|░░░░░░░░░░░░░░░░││
│  │   [A]══════════[B]      ││
│  └─────────────────────────┘│
│  0:42                  3:15 │
│                             │
│  ● 0:45  ● 1:23  ● 2:01   │  ← Marker-Chips
│                             │
├─────────────────────────────┤  ← Visueller Trenner
│                             │
│  ┌─────────────────────────┐│
│  │  [A]   [ ▶ PLAY ]  [B] ││  ← KERN: A + Play + B auf EINER Zeile
│  └─────────────────────────┘│     Haeufigste Aktion = ein Tap
│                             │
│  -15s   Loop 🔁   +15s     │  ← Skip + Loop-Toggle
│                             │
│  [Marker+]  [Tempo 1.0x]   │  ← Sekundaer
│                             │
└─────────────────────────────┘
```

**Vorteile:**
- **A + Play + B auf einer Zeile** — der haeufigste Uebungs-Flow
  (A setzen → abspielen → B setzen) ist mit 3 Taps auf einer Zeile moeglich
- Loop-Toggle direkt unter Play (schnelles Umschalten)
- Alles Wichtige im unteren Drittel
- Marker und Tempo als sekundaere Aktionen

---

## Mini-Player (alle Konzepte)

Statt Emoji-Icons: Lucide Icons (Play, Pause, SkipForward)
Progress als duenne Linie am unteren Rand (wie Spotify).

```
┌─────────────────────────────────────────┐
│  [Music]  Sopran - Ave Maria    [▶] [⏭] │
│  ═══════════════●═══════════════════════ │  ← 2px Linie, Accent-Farbe
└─────────────────────────────────────────┘
```

Kein Emoji. Kein Timestamp (der ist im Full-Player).
Tap auf den MiniPlayer = Full-Screen Player oeffnen.

---

## Datei-Browser (alle Konzepte)

```
┌─────────────────────────────────────────┐
│  Dateien                     [Search]   │  ← Topbar mit Suche-Icon
├─────────────────────────────────────────┤
│  [ChevronLeft] Fruehlingskonzert        │  ← Breadcrumb
├─────────────────────────────────────────┤
│  [Folder]  Part I                    >  │
│  ─────────────────────────────────────  │
│  [Folder]  Part II                   >  │
│  ─────────────────────────────────────  │
│  [Music]   Sopran - Ave Maria    3:42   │  ← Duration rechts
│  ─────────────────────────────────────  │
│  [AudioLines] Alt - Ave Maria    3:42   │  ← Aktiver Track: AnimBars-Icon
│            ^^^^^^^^ Accent-Farbe        │     + Accent-Farbe fuer Name
│  ─────────────────────────────────────  │
│  [Music]   Tenor - Ave Maria     3:42   │
│  ─────────────────────────────────────  │
│  [Music]   Bass - Ave Maria      3:42   │
│                                         │
├─────────────────────────────────────────┤
│  Mini-Player                            │
├─────────────────────────────────────────┤
│  [Folder]  [Heart]  [Settings]          │  ← Bottom-Nav mit Lucide Icons
└─────────────────────────────────────────┘
```

**Aenderungen gegenueber aktuell:**
- Emoji → Lucide Icons (Folder, Music, Heart, Settings, Search, AudioLines)
- Aktiver Track: `AudioLines`-Icon (animierte Balken) statt Speaker-Emoji
- Duration rechts-buendig anzeigen (fehlt aktuell)
- Chevron ">" fuer Ordner (klarer Drill-Down-Hinweis)
- Search-Icon in Topbar statt separate Seite

---

## Bottom-Navigation

```
Aktuell (Emoji):         Neu (Lucide Icons):
📂 Dateien               [FolderOpen] Dateien
❤️ Favoriten             [Heart] Favoriten
⚙️ Einstellungen         [Settings] Einstellungen
```

Icons: 22-24px, 1.5px stroke, muted wenn inaktiv, Accent-Farbe wenn aktiv.
Label: 11px, unter dem Icon.

---

## Empfehlung

**Konzept C ("Practice-First")** ist die staerkste Option weil:
1. Es den Haupt-Use-Case (A setzen → Play → B setzen → Loop) in eine einzige Zeile packt
2. Alle haeufigen Controls im Thumb-Zone sind
3. Die Waveform trotzdem prominent bleibt
4. Es sich von Spotify/Apple Music abhebt und als Uebungs-Tool positioniert

**Naechste Schritte:**
1. `lucide-react` installieren
2. Alle Emoji-Icons durch Lucide ersetzen
3. Player-Layout nach Konzept C umbauen
4. CSS-Farbsystem von Music CMD uebernehmen (Orange Accent oder bei Indigo bleiben?)
5. Inter Font einbinden
