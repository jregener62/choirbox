# Future: PWA Audio-Caching & Offline-Modus

## Status

PWA-Grundlage ist implementiert (Manifest, Service Worker, Install-Guide).
Audio-Caching und Offline-Modus sind **nicht** implementiert.

## Geplant: Audio-Caching

### Konzept

Audio-Dateien automatisch cachen, wenn sie abgespielt werden. Cache-Key ist der Dropbox-Dateipfad (nicht die Temporary URL, die sich bei jedem Request aendert).

### Ablauf

1. User drueckt Play auf "Sopran/Stueck_A.mp3"
2. Cache pruefen: Existiert `/Sopran/Stueck_A.mp3` im Cache?
   - JA: Aus Cache abspielen (sofort, offline-faehig)
   - NEIN: Von Dropbox laden, abspielen, im Cache speichern

### Technische Optionen

**Cache API (einfacher):**
- `caches.open('audio-v1')` mit eigenem Key pro Dateipfad
- Stale-while-revalidate oder Cache-first Strategie
- Im Service Worker oder direkt im App-Code

**IndexedDB (mehr Kontrolle):**
- Audio als Blob speichern mit Metadaten (Pfad, Groesse, letzter Zugriff)
- Eigenes Cache-Management (LRU, manuelles Loeschen)
- Erweiterbar um Download-Liste / Offline-Bibliothek

### Cache-Invalidierung

Dropbox liefert `content_hash` pro Datei. Diesen mitspeichern und beim naechsten Browse-Request vergleichen. Bei Aenderung Cache-Eintrag erneuern.

### Speicherlimits

- Chrome Android: bis zu 60% des freien Speichers
- Safari iOS: ca. 1 GB pro Origin (installierte PWAs stabiler)
- Typische Chor-MP3: 3-8 MB, bei 50 Dateien = 150-400 MB

## Geplant: Erweiterter Offline-Modus

### Voraussetzungen

Damit die App offline voll nutzbar wird, muessten neben Audio auch Metadaten lokal gespeichert werden:

- Ordnerstruktur (welche Dateien wo)
- Favoriten-Liste des Users
- Labels und Zuweisungen
- Sektionen und Marker

Das waere ein lokaler Offline-Spiegel in IndexedDB mit Sync-Logik.

### Realistisches Offline-Szenario (ohne vollen Offline-Modus)

User oeffnet App im WLAN, navigiert zu Stuecken, spielt sie ab (werden gecacht). Spaeter ohne Netz kann er die zuletzt gespielten Stuecke nochmal abspielen — aber nicht durch neue Ordner browsen.

## Geplant: Download-Button

Optionaler "Herunterladen"-Button pro Stueck oder Ordner, damit User gezielt Stuecke fuer offline vorhalten koennen (z.B. vor der Chorprobe im Zug).
