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
