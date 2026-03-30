# Future: Mehrspur-Wiedergabe (Stem Playback)

## Idee

Stems (separate Audio-Dateien pro Stimme) gleichzeitig abspielen und individuell steuern.
Typischer Anwendungsfall: Choruebung mit Sopran/Alt/Tenor/Bass als einzelne Tracks, die synchron laufen.

## Voraussetzungen

- Stems liegen als separate MP3-Dateien in Dropbox (bereits gegeben)
- Zusammengehoerige Stems sind erkennbar (Namenskonvention oder gemeinsamer Ordner)
- Alle Stems eines Stuecks sind exakt gleich lang

## Offene Design-Fragen

- **Stem-Erkennung:** Wie sind die Dateien benannt/organisiert? Namens-Suffix (`Lied_Sopran.mp3`) oder Unterordner pro Stueck?
- **UI:** Mixer-Pult mit Lautstaerkereglern pro Stem? Oder einfaches Mute/Unmute pro Stimme?
- **voice_part-Integration:** Soll die eigene Stimme (aus User-Profil) automatisch hervorgehoben oder lauter sein?
- **Player-Modus:** Separater Mixer-Modus, oder automatisch wenn Stems erkannt werden? Ersetzt oder ergaenzt den bestehenden Single-Track-Player?
- **Waveform:** Eine gemeinsame Waveform oder pro Stem? Oder nur fuer die eigene Stimme?

## Technischer Ansatz

### Web Audio API (bevorzugt)

Ein gemeinsamer `AudioContext` als Mixer:

```
AudioContext
  ├── Stem 1: MediaElementSource -> GainNode ─┐
  ├── Stem 2: MediaElementSource -> GainNode ──┼── Destination (Speaker)
  ├── Stem 3: MediaElementSource -> GainNode ──┤
  └── Stem 4: MediaElementSource -> GainNode ─┘
```

- Pro Stem ein `Audio`-Element + `MediaElementSourceNode`
- `GainNode` pro Stem fuer individuelle Lautstaerke/Mute
- Sample-genaue Synchronisation ueber gemeinsamen `AudioContext`
- Der `AudioContext` wird bereits fuer Waveform-Berechnung genutzt

### Betroffene Bereiche

| Bereich | Aenderung |
|---|---|
| `stores/playerStore.ts` | Multi-Track-State: aktive Stems, Lautstaerken, Mute-Status |
| `hooks/useAudioPlayer.ts` | Mehrere Audio-Elemente + AudioContext-Mixer |
| `hooks/useWaveform.ts` | Ggf. Peaks pro Stem berechnen |
| `api/dropbox.py` | Ggf. Stem-Gruppierung erkennen und als Gruppe liefern |
| `pages/PlayerPage.tsx` | Mixer-UI (Lautstaerke/Mute pro Stem) |
| `components/ui/TopPlayerBar.tsx` | Anpassung fuer Multi-Track-Anzeige |
| Browse-Bereich | Stems als Gruppe anzeigen statt einzeln |

### Herausforderungen

- **Synchronisation:** Alle Stems muessen exakt gleichzeitig starten, pausieren und seeken
- **Streaming:** Mehrere Dropbox-Links gleichzeitig laden (Rate-Limiting beachten)
- **Speicher:** Mehrere Audio-Streams gleichzeitig im Browser halten
- **Mobile Performance:** Smartphones muessen mehrere Audio-Streams gleichzeitig dekodieren
- **Loop-Kompatibilitaet:** Bestehendes Loop-System muss auf alle Stems gleichzeitig wirken

---

## Phase 1: Sektionsreferenz + Datei-Einstellungen (Vorstufe)

### Kontext

Nicht alle Dateien in der Dropbox sind Stems. Die Sammlung ist historisch gewachsen:
- Meistens einzelne Dateien (Standalone) — kein Bezug zu anderen Dateien
- Manchmal mehrere Versionen desselben Stuecks (verschiedene Stimmen), aber nicht synchron
- Selten echte Stems (synchrone Dateien gleicher Laenge)

Bevor ein Mixer gebaut wird, muss das Grundproblem geloest werden:
**Sektionen, die auf einer Datei definiert wurden, sollen beim Abspielen anderer zugehoeriger Dateien sichtbar sein.**

### Loesung: Sektionsreferenz pro Datei

Jede Datei kann optional auf eine andere Datei als **Sektionsquelle** zeigen.
Es wird kein Audio von der Referenzdatei abgespielt — nur deren Sektionen werden angezeigt.

```
Datei A (Sopran)   → section_ref_path: null        (eigene Sektionen, Referenz fuer andere)
Datei B (Alt)      → section_ref_path: Datei A     (zeigt Sektionen von A)
Datei C (Tenor)    → section_ref_path: Datei A     (zeigt Sektionen von A)
Datei D (Click)    → section_ref_path: Datei A     (zeigt Sektionen von A)
Datei E (anderes Lied) → kein Eintrag              (eigene Sektionen, wie heute)
```

**Kein Mixer, kein Multi-Audio** — immer nur eine Datei wird abgespielt.
**Kein Gruppen-Modell** — ein einfacher Pointer reicht.
**Keine Migration** — bestehende Sektionen bleiben unveraendert.

### Backend: Neues Modell `FileSettings`

Datei: `backend/models/file_settings.py`

```python
class FileSettings(SQLModel, table=True):
    __tablename__ = "file_settings"
    dropbox_path: str = Field(primary_key=True, max_length=1000)
    section_ref_path: str | None = Field(default=None, max_length=1000)
    created_at: datetime
    updated_at: datetime
```

Tabelle ist erweiterbar fuer zukuenftige Metadaten pro Datei.

### Backend: API-Endpunkte

Datei: `backend/api/file_settings.py`

| Endpoint | Method | Auth | Zweck |
|----------|--------|------|-------|
| `/api/file-settings?path=` | GET | user | Settings fuer eine Datei laden (oder Default) |
| `/api/file-settings` | PUT | pro-member | Settings speichern/aktualisieren |

### Backend: Anpassung Sections-API

`GET /api/sections?path=X` — bestehender Endpunkt:
1. Prueft `file_settings` ob X eine `section_ref_path` hat
2. Wenn ja: laedt Sektionen von `section_ref_path`
3. Wenn nein: laedt Sektionen von X (wie bisher)

Die Referenz-Aufloesung passiert im Backend, das Frontend muss nichts wissen.

Beim Erstellen/Bearbeiten von Sektionen wird ebenfalls aufgeloest:
Sektionen werden immer gegen die Referenz-Datei gespeichert, nicht gegen die aktuelle.

### Frontend: Neue Seite `FileSettingsPage`

Route: `/file-settings` (mit `?path=` Query-Parameter oder Fallback auf `playerStore.currentPath`)

#### Zugang ueber 2 Stellen:

**1. Browse-Page — Swipe-Actions:**
Neuer Info-Button (`Info` Icon aus Lucide) neben Heart, Tag, (Trash):
```
[♡ Fav] [🏷 Label] [ℹ Info] [🗑 Delete]
```
Navigiert zu `/file-settings?path=<dropbox_path>`

**2. Player-Page — Kebab-Menu:**
Neuer Eintrag unter "Sektionen editieren":
```
┌──────────────────────────┐
│ ☰  Sektionen editieren   │
│ ℹ  Datei-Einstellungen   │
└──────────────────────────┘
```
Navigiert zu `/file-settings` (nimmt `currentPath` aus playerStore)

#### Page-Layout:

```
┌─────────────────────────────────┐
│  ←  Datei-Einstellungen         │
├─────────────────────────────────┤
│                                 │
│  📄 Lied_Alt.mp3                │
│  /Chormusik/Weihnachten/        │
│                                 │
├─────────────────────────────────┤
│                                 │
│  Sektionsquelle                 │
│  ┌─────────────────────────┐    │
│  │ ○ Eigene Sektionen      │    │
│  │   (Standard)            │    │
│  │                         │    │
│  │ ○ Sektionen uebernehmen │    │
│  │   von:                  │    │
│  │   ┌──────────────────┐  │    │
│  │   │ Lied_Sopran.mp3 ▼│  │    │
│  │   └──────────────────┘  │    │
│  └─────────────────────────┘    │
│                                 │
│  (Platz fuer zukuenftige        │
│   Metadaten-Felder)             │
│                                 │
├─────────────────────────────────┤
│        [ Speichern ]            │
└─────────────────────────────────┘
```

#### Sektionsquellen-Auswahl — UX:

- **Radio "Eigene Sektionen"**: section_ref_path = null (wie heute)
- **Radio "Sektionen uebernehmen von"**: Dropdown zeigt Dateien aus demselben Ordner
  - API-Call an `/api/dropbox/browse?path=<parent_folder>`
  - Filtert aktuelle Datei heraus
  - Zeigt `formatDisplayName()` zur Anzeige
  - Hinweis wenn Referenz-Datei bereits Sektionen hat: "3 Sektionen vorhanden"

### Betroffene bestehende Dateien

| Datei | Aenderung |
|-------|-----------|
| `App.tsx` | Route `/file-settings` hinzufuegen |
| `PlayerPage.tsx` | Kebab-Menu-Eintrag "Datei-Einstellungen" mit Info-Icon |
| `BrowsePage.tsx` | Info-Button in Swipe-Actions |
| `backend/app.py` | Router fuer file_settings registrieren |
| `backend/api/sections.py` | Referenz-Aufloesung beim Laden/Speichern |
| `backend/database.py` | FileSettings-Modell importieren |

### Was sich fuer bestehende Funktionalitaet aendert

**Nichts.** Ohne gesetzten `section_ref_path` verhaelt sich alles exakt wie heute.
Die Referenz-Aufloesung im Sections-Endpoint hat keinen Effekt wenn kein Eintrag in `file_settings` existiert.
