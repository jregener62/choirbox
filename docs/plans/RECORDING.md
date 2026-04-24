# Audio-Aufnahme — Spezifikation

## Funktionsumfang

Chormitglieder nehmen sich beim Ueben direkt in der App auf. Die Aufnahme wird in den aktuell geoeffneten Dropbox-Ordner hochgeladen.

- Alle authentifizierten User koennen aufnehmen (nicht nur Admin)
- Aufnahme ueber Browser-MediaRecorder API (Mikrofon)
- Upload-Ziel: aktueller Ordner in der Datei-Ansicht (BrowsePage)

## Aufnahme-Formate

| Browser | Aufnahme-Format | Nach Konvertierung |
|---------|----------------|--------------------|
| Chrome / Firefox | WebM (Opus) | MP3 |
| Safari iOS | M4A (AAC) | MP3 |

Alle Aufnahmen werden **server-seitig zu MP3 konvertiert** (FFmpeg, 128kbps, Mono) bevor sie in die Dropbox hochgeladen werden.

## Dateinamen-Konvention

### Format

```
{Stimmen}-{Ordnername}-{Abschnitte}[-{Freitext}].mp3
```

### Bestandteile

| Teil | Beschreibung | Beispiel |
|------|-------------|----------|
| **Stimmen** | Anfangsbuchstaben der gewaehlten Stimmen, immer in SATB-Reihenfolge | `S`, `SA`, `SATB` |
| **Ordnername** | Name des aktuellen Dropbox-Ordners (letzter Pfad-Teil) | `Halleluja` |
| **Abschnitte** | Gewaehlte musikalische Abschnitte, mit `-` getrennt | `Strophe1`, `Intro-Refrain2` |
| **Freitext** | Optionale Notiz, Sonderzeichen werden zu `-` normalisiert | `langsam`, `Durchlauf3` |

### Stimmen

Mehrfachauswahl moeglich. Reihenfolge im Dateinamen ist immer SATB:

| Auswahl | Im Dateinamen |
|---------|--------------|
| Sopran | `S` |
| Alt | `A` |
| Sopran + Alt | `SA` |
| Alle vier | `SATB` |

### Abschnitte

Mehrfachauswahl moeglich:

| Abschnitt | Nummer | Beispiele |
|-----------|--------|-----------|
| Intro | - | `Intro` |
| Strophe | 1-5 | `Strophe1`, `Strophe3` |
| Refrain | 1-4 | `Refrain1`, `Refrain2` |
| Bridge | 1-4 | `Bridge1`, `Bridge4` |
| Outro | - | `Outro` |

### Beispiele

| Auswahl | Dateiname |
|---------|-----------|
| Sopran, Strophe 1 | `S-Halleluja-Strophe1.mp3` |
| Sopran + Alt, Strophe 1 + Refrain 2 | `SA-Halleluja-Strophe1-Refrain2.mp3` |
| Alle Stimmen, Intro, Notiz "langsam" | `SATB-Halleluja-Intro-langsam.mp3` |
| Nur Freitext "Durchlauf3" | `Halleluja-Durchlauf3.mp3` |
| Keine Auswahl (Fallback) | `Aufnahme_2026-03-26_14-30.mp3` |

### Fallback

Wenn weder Stimme, Abschnitt noch Freitext gewaehlt werden, wird ein Timestamp-basierter Name generiert:

```
Aufnahme_YYYY-MM-DD_HH-MM.mp3
```

## UI-Flow

1. User oeffnet Aufnahme-Modal ueber Mikrofon-Button in der BrowsePage-Topbar
2. Grosser roter Mikrofon-Button startet die Aufnahme
3. Waehrend Aufnahme: pulsierender Indikator, Timer, Stop-Button
4. Nach Stop: Benennungs-Felder erscheinen (Stimme, Abschnitt, Freitext)
5. Dateinamen-Vorschau aktualisiert sich live
6. User kann Aufnahme anhoeren, neu aufnehmen oder hochladen
7. Nach Upload: Erfolgsmeldung, Ordner wird automatisch neu geladen

### Verhalten bei offenem Modal

- MiniPlayer wird ausgeblendet
- Laufende Audio-Wiedergabe wird gestoppt

## Technische Details

### Frontend

- **Hook:** `useRecorder` (`frontend/src/hooks/useRecorder.ts`) — kapselt MediaRecorder API
- **Komponente:** `RecordingModal` (`frontend/src/components/ui/RecordingModal.tsx`)
- **Upload:** `apiUpload()` in `frontend/src/api/client.ts` (FormData, kein JSON)
- **State:** `modalOpen` Flag in `appStore` steuert MiniPlayer-Sichtbarkeit

### Backend

- **Endpoint:** `POST /api/dropbox/upload` (multipart/form-data)
- **Konvertierung:** `_convert_to_mp3()` in `backend/api/dropbox.py` (FFmpeg subprocess)
- **Upload:** `DropboxService.upload_file()` in `backend/services/dropbox_service.py`
- **Konflikt-Handling:** Dropbox `mode: "add"` + `autorename: true` (benennt bei Duplikat um)

### Server-Voraussetzungen

- **FFmpeg** muss auf dem Server installiert sein (`apt install ffmpeg`)
- **Dropbox-Scope** `files.content.write` muss in der Dropbox App Console aktiviert sein

### Fehlerbehandlung

| Fehlerfall | Behandlung |
|-----------|------------|
| Mikrofon verweigert | "Mikrofonzugriff verweigert" |
| Kein Mikrofon | "Kein Mikrofon gefunden" |
| Keine Internetverbindung | "Keine Internetverbindung" |
| Datei > 20 MB | "Datei zu gross (max. 20 MB)" |
| FFmpeg nicht installiert | "Konvertierung fehlgeschlagen" (geloggt) |
| FFmpeg Timeout (>30s) | "Konvertierung fehlgeschlagen" (geloggt) |
| Dropbox nicht verbunden | HTTP 400 |
| Dropbox Rate-Limit | Automatischer Retry (exponentieller Backoff, max 3) |
| Dropbox API-Fehler | "Dropbox-Upload fehlgeschlagen" |
