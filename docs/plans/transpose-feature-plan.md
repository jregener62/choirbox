# Implementierungsplan: Transpose (Tonhöhe verschieben)

## Übersicht

Audiodateien beim Abspielen in Echtzeit transponieren — in Halbtonschritten hoch/runter (-6 bis +6).
Die Tonhöhe ändert sich, **die Geschwindigkeit bleibt gleich** (Pitch-Shifting, kein Playback-Rate-Trick).

## Technische Ausgangslage

### Aktueller Audio-Stack

Der Player nutzt ein **HTML5 `Audio`-Element** als Singleton (`useAudioPlayer.ts:36`):

```typescript
const audio = new Audio()
```

- Abspielen: `audio.src = dropboxTemporaryLink`
- Steuerung: `audio.play()`, `audio.pause()`, `audio.currentTime = ...`
- Events: `timeupdate`, `loadedmetadata`, `ended`

**Problem:** HTML5 Audio hat **kein Pitch-Shifting**. `audio.playbackRate` ändert Tempo UND Tonhöhe gleichzeitig. Das `preservesPitch`-Flag verhindert zwar die Tonänderung bei Tempo-Änderung — aber nicht umgekehrt. Es gibt keine native Möglichkeit, nur die Tonhöhe zu ändern.

### Was bereits Web Audio API nutzt

`useWaveform.ts` lädt die Audio-Datei bereits als `ArrayBuffer`, dekodiert sie über `AudioContext.decodeAudioData()` zu einem `AudioBuffer` und extrahiert Peaks. Dieser Dekodier-Schritt ist genau das, was auch für Pitch-Shifting gebraucht wird.

---

## Bibliothek: SoundTouchJS

**Empfehlung:** [`soundtouchjs`](https://www.npmjs.com/package/soundtouchjs) (npm)

```bash
cd frontend && npm install soundtouchjs
```

**Warum SoundTouchJS?**

| Kriterium | SoundTouchJS | Tone.js | Web Audio `detune` |
|---|---|---|---|
| Bundle-Größe | ~20 KB | ~150 KB | 0 KB |
| Pitch ohne Tempo-Änderung | Ja | Ja | Nein |
| Komplexität | Niedrig | Hoch | — |
| Abhängigkeiten | Keine | Viele | — |
| API | `pitchSemitones = 2` | `new PitchShift()` | `detune = 200` |
| Für diesen Use-Case | Perfekt | Überdimensioniert | Ungeeignet |

SoundTouchJS ist ein JavaScript-Port der bewährten SoundTouch C++ Library. Es nutzt einen Phase-Vocoder-Algorithmus für Time-Stretching und Pitch-Shifting.

**Kern-API:**

```typescript
import { SoundTouch, SimpleFilter, PipeUtils } from 'soundtouchjs'

const soundtouch = new SoundTouch()
soundtouch.pitchSemitones = 2    // +2 Halbtöne hoch
soundtouch.pitchSemitones = -1   // 1 Halbton runter
soundtouch.pitchSemitones = 0    // Original
```

---

## Architektur-Entscheidung: Playback-Umbau

Der Wechsel von HTML5 Audio zu Web Audio API ist der größte Teil dieser Implementierung. Zwei Ansätze:

### Option A: HTML5 Audio beibehalten + SoundTouch nur bei Transpose ≠ 0

- Bei `pitchShift === 0`: Weiter über `audio.src` (kein Qualitätsverlust, kein Overhead)
- Bei `pitchShift !== 0`: Audio als `AudioBuffer` laden → SoundTouch → `ScriptProcessorNode` → Lautsprecher
- **Pro:** Minimaler Umbau, kein Risiko für bestehende Funktionalität
- **Contra:** Zwei Playback-Pfade, Switch-Logik, doppelter Code

### Option B: Komplett auf Web Audio API umstellen (empfohlen)

- Audio immer als `AudioBuffer` laden (passiert in `useWaveform.ts` bereits!)
- SoundTouch-Pipeline immer aktiv, bei `pitchSemitones = 0` ist sie ein Passthrough
- Ein einheitlicher Playback-Pfad
- **Pro:** Sauberer, wartbar, Grundlage für weitere Audio-Features
- **Contra:** Größerer initialer Umbau

**Empfehlung: Option B** — der `AudioBuffer` wird ohnehin schon geladen. Ein einheitlicher Pfad ist langfristig besser.

---

## Implementierung

### Schritt 1: Dependency installieren

```bash
cd frontend && npm install soundtouchjs
```

### Commit

```
feat: add soundtouchjs dependency for pitch shifting
```

---

### Schritt 2: playerStore erweitern

#### `frontend/src/stores/playerStore.ts`

Neues State-Property und Action hinzufügen:

```typescript
interface PlayerState {
  // ... bestehende Properties ...

  // Pitch shifting (Halbtöne)
  pitchShift: number

  // ... bestehende Actions ...
  setPitchShift: (semitones: number) => void
}
```

Default-Wert: `pitchShift: 0`

In `setTrack()` (Zeile 63-74) wird `pitchShift` **NICHT** zurückgesetzt — der User will die Tonhöhe vermutlich trackübergreifend beibehalten (z.B. wenn alle Stücke für eine bestimmte Stimmlage transponiert werden sollen).

Action:

```typescript
setPitchShift: (semitones) => set({ pitchShift: Math.max(-6, Math.min(6, semitones)) }),
```

### Commit

```
feat: add pitchShift state to playerStore
```

---

### Schritt 3: Shared AudioBuffer-Cache

Aktuell laden `useAudioPlayer.ts` und `useWaveform.ts` die Audio-Datei **unabhängig voneinander** — der Player streamt über eine URL, die Waveform dekodiert den gesamten Buffer. Für SoundTouch brauchen wir den dekodierten `AudioBuffer` auch im Player.

#### Neues Modul: `frontend/src/audio/audioBufferCache.ts`

Zentraler Cache für dekodierte AudioBuffers + Stream-Links:

```typescript
// Shared link cache (bisher dupliziert in useAudioPlayer + useWaveform)
const linkCache = new Map<string, PreviewLink>()

// Decoded AudioBuffer cache
const bufferCache = new Map<string, AudioBuffer>()

export async function getStreamLink(path: string): Promise<string> { ... }
export async function getAudioBuffer(path: string, signal?: AbortSignal): Promise<AudioBuffer> { ... }
export function getCachedBuffer(path: string): AudioBuffer | undefined { ... }
```

Der `linkCache` wird aus beiden Hooks hierher verschoben (aktuell dupliziert in `useAudioPlayer.ts:11` und `useWaveform.ts:12`).

`getAudioBuffer()` prüft den Cache, fetcht bei Cache-Miss die Audio-Datei, dekodiert sie über `AudioContext.decodeAudioData()` und cached das Ergebnis.

#### `useWaveform.ts` anpassen

Statt eigenes Fetching/Decoding → `getAudioBuffer()` aus dem Cache-Modul nutzen. Peaks-Berechnung bleibt gleich, nur die Buffer-Beschaffung wird delegiert.

### Commit

```
refactor: extract shared audioBufferCache from useWaveform + useAudioPlayer
```

---

### Schritt 4: SoundTouch-Playback-Engine

#### Neues Modul: `frontend/src/audio/pitchEngine.ts`

Kapselt die SoundTouch-Pipeline und die Web Audio API-Playback:

```typescript
import { SoundTouch, SimpleFilter } from 'soundtouchjs'

class PitchEngine {
  private audioCtx: AudioContext
  private soundtouch: SoundTouch
  private filter: SimpleFilter | null = null
  private scriptNode: ScriptProcessorNode | null = null
  private currentBuffer: AudioBuffer | null = null
  private _isPlaying = false
  private _currentTime = 0

  // Pitch (Halbtöne)
  setPitchSemitones(semitones: number): void {
    this.soundtouch.pitchSemitones = semitones
  }

  // Track laden
  loadBuffer(buffer: AudioBuffer): void { ... }

  // Playback
  play(): void { ... }
  pause(): void { ... }
  seekTo(time: number): void { ... }

  // State
  get currentTime(): number { ... }
  get duration(): number { ... }
  get isPlaying(): boolean { ... }

  // Callbacks
  onTimeUpdate: ((time: number) => void) | null = null
  onEnded: (() => void) | null = null

  dispose(): void { ... }
}

export const pitchEngine = new PitchEngine()
```

**SoundTouch-Pipeline:**

```
AudioBuffer (Float32Array)
  → SoundTouch Source (Samples lesen)
  → SoundTouch Processor (Pitch shiften)
  → SimpleFilter (Output-Samples)
  → ScriptProcessorNode (Web Audio Graph)
  → AudioContext.destination (Lautsprecher)
```

Der `ScriptProcessorNode` (oder `AudioWorkletNode` für bessere Performance) liest Samples aus dem `SimpleFilter` und schreibt sie in den Web Audio Output-Buffer.

**Seek-Implementierung:** SoundTouch arbeitet Sample-basiert. Seek berechnet die Sample-Position:

```typescript
seekTo(time: number) {
  this._currentTime = time
  const sampleOffset = Math.floor(time * this.currentBuffer.sampleRate)
  this.filter.sourcePosition = sampleOffset
}
```

**Loop-Handling:** Wird wie bisher vom `timeupdate`-Callback gesteuert — wenn `currentTime >= loopEnd`, wird `seekTo(loopStart)` aufgerufen.

### Commit

```
feat: add PitchEngine with SoundTouch playback pipeline
```

---

### Schritt 5: useAudioPlayer umbauen

#### `frontend/src/hooks/useAudioPlayer.ts`

Statt `const audio = new Audio()` → `pitchEngine` nutzen:

**Vorher:**
```typescript
const audio = new Audio()
// audio.src = link
// audio.play() / audio.pause()
// audio.currentTime = time
```

**Nachher:**
```typescript
import { pitchEngine } from '@/audio/pitchEngine'
import { getAudioBuffer } from '@/audio/audioBufferCache'

// Track laden:
const buffer = await getAudioBuffer(currentPath)
pitchEngine.loadBuffer(buffer)

// Play/Pause:
pitchEngine.play() / pitchEngine.pause()

// Seek:
pitchEngine.seekTo(time)

// Pitch Shift (reaktiv auf Store-Änderung):
pitchEngine.setPitchSemitones(pitchShift)
```

**Event-Handling bleibt strukturell gleich:**

```typescript
pitchEngine.onTimeUpdate = (time) => {
  store.setCurrentTime(time)
  // Loop-Cycling wie bisher
  if (store.loopEnabled && store.loopEnd !== null && time >= store.loopEnd) {
    pitchEngine.seekTo(store.loopStart!)
  }
}

pitchEngine.onEnded = () => {
  store.setPlaying(false)
  store.setCurrentTime(0)
}
```

**Neuer useEffect für pitchShift:**

```typescript
const pitchShift = usePlayerStore((s) => s.pitchShift)

useEffect(() => {
  pitchEngine.setPitchSemitones(pitchShift)
}, [pitchShift])
```

### Commit

```
refactor: migrate useAudioPlayer from HTML5 Audio to PitchEngine
```

---

### Schritt 6: UI — Transpose-Control

Basierend auf den Mockups (einer der drei Vorschläge, nach Wahl):

- `docs/mockups/transpose-a-toolbar-row.html` — Eigene Toolbar-Zeile
- `docs/mockups/transpose-b-pill.html` — Kompakte Pill im Footer
- `docs/mockups/transpose-c-segmented.html` — Segmented Control

#### Neue Komponente: `frontend/src/components/ui/TransposeControl.tsx`

```typescript
export function TransposeControl() {
  const pitchShift = usePlayerStore((s) => s.pitchShift)
  const setPitchShift = usePlayerStore((s) => s.setPitchShift)

  return (
    // UI je nach gewähltem Mockup
    // -/+ Buttons, Wert-Anzeige, Reset
  )
}
```

#### Integration in PlayerControlsBar oder PlayerPage

Je nach Mockup-Variante:
- **Variante A:** Eigene Zeile in `PlayerControlsBar.tsx` unterhalb der Marker-Row
- **Variante B:** In `PlayerFooter` (in `PlayerPage.tsx:244`) neben "Setze Marker"
- **Variante C:** Eigene Zeile in `PlayerControlsBar.tsx`

#### CSS in `frontend/src/styles/player.css`

Neue Styles mit `--transpose: #38bdf8` als Akzentfarbe (Cyan-Blau, unterscheidbar von Accent-Indigo und Amber-Loop).

### Commit

```
feat: add TransposeControl UI component to player
```

---

### Schritt 7: MiniPlayer-Indikator

Wenn ein Track transponiert abgespielt wird, sollte das im MiniPlayer sichtbar sein — z.B. ein kleines Badge "+2" neben dem Track-Namen.

#### `frontend/src/components/layout/MiniPlayer.tsx`

```typescript
const pitchShift = usePlayerStore((s) => s.pitchShift)

// Im Render:
{pitchShift !== 0 && (
  <span className="miniplayer-pitch-badge">
    {pitchShift > 0 ? '+' : ''}{pitchShift}
  </span>
)}
```

### Commit

```
feat: show pitch shift badge in MiniPlayer
```

---

## Risiken und Fallstricke

### 1. Latenz beim Track-Laden

**Problem:** Der gesamte AudioBuffer muss heruntergeladen und dekodiert werden, bevor die Wiedergabe starten kann. Bei langen Tracks (5+ Minuten) kann das 2-5 Sekunden dauern.

**Mitigation:**
- `useWaveform` lädt den Buffer bereits im Hintergrund. Wenn der User den Track öffnet und die Waveform sieht, ist der Buffer oft schon im Cache.
- Loading-State anzeigen während Buffer geladen wird.
- Fallback auf HTML5 Audio wenn Buffer noch nicht bereit? (Kompromiss-Lösung)

### 2. ScriptProcessorNode ist deprecated

`ScriptProcessorNode` ist offiziell deprecated zugunsten von `AudioWorkletNode`. Funktioniert aber in allen aktuellen Browsern zuverlässig.

**Mitigation:** SoundTouchJS nutzt intern `ScriptProcessorNode`. Ein Wechsel auf AudioWorklet wäre ein separates Refactoring und ist aktuell nicht nötig.

### 3. Speicherverbrauch

Dekodierte AudioBuffers sind deutlich größer als komprimierte MP3s (~10x). Bei 5-Minuten-Tracks sind das ~50 MB pro Buffer.

**Mitigation:** Buffer-Cache auf z.B. 3-5 Tracks begrenzen (LRU-Eviction).

### 4. Mobile Safari

Safari hat historisch Einschränkungen bei Web Audio API (AudioContext muss nach User-Geste erstellt werden).

**Mitigation:** AudioContext beim ersten User-Tap erstellen (`click`/`touchstart` Event).

---

## Datei-Übersicht (neue/geänderte Dateien)

```
Neu:
  frontend/src/audio/audioBufferCache.ts     # Shared AudioBuffer + Link Cache
  frontend/src/audio/pitchEngine.ts          # SoundTouch Playback Engine
  frontend/src/components/ui/TransposeControl.tsx  # UI-Komponente

Geändert:
  frontend/package.json                      # + soundtouchjs
  frontend/src/stores/playerStore.ts         # + pitchShift State
  frontend/src/hooks/useAudioPlayer.ts       # HTML5 Audio → PitchEngine
  frontend/src/hooks/useWaveform.ts          # Eigenes Fetching → audioBufferCache
  frontend/src/components/ui/PlayerControlsBar.tsx  # + TransposeControl (je nach Variante)
  frontend/src/components/layout/MiniPlayer.tsx     # + Pitch-Badge
  frontend/src/styles/player.css             # + Transpose-Styles
```

## Mockup-Referenzen

- `docs/mockups/transpose-a-toolbar-row.html` — Toolbar-Zeile mit Stepper
- `docs/mockups/transpose-b-pill.html` — Kompakte Pill im Footer
- `docs/mockups/transpose-c-segmented.html` — Segmented Control (-4 bis +4)

## Offene Entscheidung

**Welche Mockup-Variante?** → Vor Schritt 6 klären.
