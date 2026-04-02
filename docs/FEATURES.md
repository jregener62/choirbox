# ChoirBox — Feature-Spezifikation

## Ueberblick

ChoirBox ist eine Smartphone-optimierte Web-App fuer Chormitglieder. Kernfunktionen: Audio-Dateien aus einer geteilten Dropbox durchsuchen, abspielen, mit Labels organisieren, und eigene Uebungs-Aufnahmen hochladen. Eine Instanz kann mehrere unabhaengige Choere verwalten.

---

## Authentifizierung & Benutzerverwaltung

### Registrierung

Chormitglieder registrieren sich ueber einen Einladungslink, der den Chor identifiziert.

- Einladungslink-Format: `/#/join/<invite_code>` — identifiziert den Chor automatisch
- Pflichtfelder: Benutzername, Anzeigename, Passwort, Stimme (Sopran/Alt/Tenor/Bass)
- Passwort mindestens 4 Zeichen
- Passwort-Hashing: PBKDF2-HMAC-SHA256 (100.000 Iterationen)
- Benutzername muss eindeutig sein (ueber alle Choere hinweg)
- User wird automatisch dem Chor des Einladungslinks zugewiesen
- Ohne Einladungslink: Hinweis "Du brauchst einen Einladungslink von deinem Chorleiter"

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/RegisterPage.tsx` | Registrierungs-UI mit Chor-Anzeige |
| `backend/api/auth.py` | `POST /auth/register`, `GET /auth/choir-info` |
| `backend/models/user.py` | User-Modell (mit `choir_id`) |
| `backend/models/choir.py` | Choir-Modell |

### Login

- Benutzername + Passwort — Chor wird automatisch ueber `user.choir_id` bestimmt
- Token-basierte Session (7 Tage gueltig), persistiert in SQLite
- Sessions ueberleben Server-Neustarts (DB-backed statt In-Memory)
- Rate-Limiting: max. 5 fehlgeschlagene Versuche pro Minute pro IP
- Letzter Login-Zeitpunkt wird gespeichert
- Token in `localStorage` persistiert
- Abgelaufene Tokens werden beim Login automatisch bereinigt
- Login-Response enthaelt `choir_name` und `must_change_password` Flag

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/LoginPage.tsx` | Login-UI |
| `frontend/src/stores/authStore.ts` | Token- und User-State |
| `backend/api/auth.py` | `POST /auth/login` |
| `backend/models/session_token.py` | SessionToken-Modell |

### Profil bearbeiten

- Anzeigename aendern
- Stimme wechseln (Sopran/Alt/Tenor/Bass)
- Passwort aendern (altes Passwort muss bestaetigt werden, neues min. 4 Zeichen)
- Chor-Name wird im Profil angezeigt

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SettingsPage.tsx` | Profil-Sektion |
| `backend/api/auth.py` | `PUT /auth/me`, `PUT /auth/me/password` |

### Erzwungene Passwort-Aenderung

Wenn ein Chor-Admin vom Developer angelegt wird, erhaelt er ein initiales Passwort mit `must_change_password`-Flag.

- Nach Login: Redirect zu Einstellungen, Passwort-Formular automatisch offen
- Hinweis: "Bitte aendere dein Standard-Passwort"
- Abbrechen-Button ausgeblendet, Zurueck-Button zeigt Warnmeldung
- Nach erfolgreicher Aenderung: Flag wird gecleared, App normal nutzbar

| Datei | Rolle |
|-------|-------|
| `frontend/src/App.tsx` | AuthGuard mit `must_change_password`-Redirect |
| `frontend/src/pages/SettingsPage.tsx` | Erzwungenes PW-Formular |
| `backend/api/auth.py` | Flag in `_user_response`, Clear bei PW-Aenderung |

### Rollen-Hierarchie

5-stufiges Rollensystem mit aufsteigenden Berechtigungen. Jede hoehere Rolle erbt alle Rechte der niedrigeren.

| Rolle | Level | Beschreibung |
|-------|-------|-------------|
| `guest` | 0 | Registriert, eingeschraenkt |
| `member` | 1 | Standard-Chormitglied (Browsen, Streamen, Upload, Favoriten) |
| `pro-member` | 2 | Kann Labels und Sections verwalten |
| `chorleiter` | 3 | Erweiterte Verwaltungsrechte |
| `admin` | 4 | Voller Zugriff (Nutzer, Einladungslink, Settings) innerhalb des eigenen Chors |
| `beta-tester` | 5 | Beta-Features (z.B. Section-Editor) |
| `developer` | 6 | Instanz-Verwaltung: Choere erstellen/wechseln, Dropbox OAuth |

- Neue Registrierungen erhalten automatisch die Rolle `member`
- Rollen sind pro Chor (User gehoert zu genau einem Chor)
- Admin kann Rollen ueber die Nutzerverwaltung aendern (Dropdown mit allen Rollen)
- Developer kann neue Choere erstellen, zwischen Choeren wechseln und die Dropbox-Verbindung verwalten
- Backend: `require_role("pro-member")` als Dependency fuer rollenbasierte Endpunkte
- Frontend: `hasMinRole(userRole, "pro-member")` fuer UI-Sichtbarkeit

| Datei | Rolle |
|-------|-------|
| `backend/api/auth.py` | `ROLE_HIERARCHY`, `require_role()`, `require_admin` |
| `frontend/src/utils/roles.ts` | `hasMinRole()`, `ROLE_LABELS`, `ALL_ROLES` |

### Berechtigungsmatrix

| Element | beta-tester (5) | admin (4) | chorleiter (3) | pro-member (2) | member (1) | guest (0) |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| **BrowsePage** | | | | | | |
| Browse, Play, Stream | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Favoriten (Herz) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Filter (Labels) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Suche | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Label zuweisen (Tag) | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Kebab-Menue (⋮) | ✓ | ✓ | ✓ | ✓ | — | — |
| ↳ Aufnehmen | ✓ | ✓ | ✓ | ✓ | — | — |
| ↳ Datei hochladen | ✓ | ✓ | ✓ | ✓ | — | — |
| ↳ Ordner erstellen | ✓ | ✓ | — | — | — | — |
| Datei-Einstellungen (Info) | ✓ | ✓ | ✓ | ✓ | — | — |
| Datei loeschen | ✓ | ✓ | ✓ | — | — | — |
| Umbenennen (Stift) | ✓ | ✓ | — | — | — | — |
| Ordner loeschen | ✓ | ✓ | — | — | — | — |
| **PlayerPage** | | | | | | |
| Wiedergabe + Waveform | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| PDF hochladen/loeschen | ✓ | ✓ | ✓ | ✓ | — | — |
| Datei-Einstellungen | ✓ | ✓ | ✓ | ✓ | — | — |
| Notizen/Lyrics bearbeiten | ✓ | ✓ | ✓ | ✓ | — | — |
| Section-Editor | ✓ | — | — | — | — | — |
| **SettingsPage** | | | | | | |
| Profil, Passwort, Theme | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Labels verwalten | ✓ | ✓ | ✓ | ✓ | — | — |
| Sektionsvorlagen | ✓ | ✓ | ✓ | ✓ | — | — |
| Nutzer verwalten | ✓ | ✓ | — | — | — | — |
| Einladungslink + Copy | ✓ | ✓ | — | — | — | — |
| Chor-Ordner | ✓ | ✓ | — | — | — | — |
| Dropbox-Verbindung | — | — | — | — | — | — |
| Dropbox App-Ordner | — | — | — | — | — | — |
| Choere verwalten | — | — | — | — | — | — |
| **FileSettingsPage** | | | | | | |
| Anzeigen (read-only) | ✓ | ✓ | ✓ | ✓ | — | — |
| Bearbeiten + Speichern | ✓ | ✓ | ✓ | ✓ | — | — |

*Developer (6) hat alle Rechte + Dropbox-Verbindung, App-Ordner, Choere verwalten, Chor-Wechsel.*

### Logout

- Token wird im Backend invalidiert
- `localStorage` geleert
- Redirect zur Login-Seite

---

## Dropbox-Integration

### Verbindung (nur Developer)

Ein Developer verbindet ChoirBox einmalig mit einem Dropbox-Account. Alle Choere teilen diesen Zugang, jeder Chor hat seinen eigenen Unterordner (`Choir.dropbox_root_folder`). Optional kann ein globaler App-Ordner (`AppSettings.dropbox_root_folder`) als Prefix gesetzt werden — effektiver Pfad: `{app_root}/{choir_root}`.

- OAuth 2.0 Authorization Code Flow mit Refresh Token
- Account-E-Mail und ID werden gespeichert
- Developer kann Verbindung trennen
- Status sichtbar auf der Einstellungen-Seite (nur fuer Developer)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SettingsPage.tsx` | Dropbox-Sektion |
| `backend/api/dropbox.py` | `/dropbox/authorize`, `/dropbox/callback`, `/dropbox/status`, `/dropbox/disconnect` |
| `backend/models/app_settings.py` | Refresh-Token, Account-Info |

### Erforderliche Dropbox-Scopes

| Scope | Funktion |
|-------|----------|
| `files.metadata.read` | Ordner durchsuchen, Dateien suchen |
| `files.content.read` | Streaming-Links fuer Audio-Wiedergabe |
| `files.content.write` | Aufnahmen hochladen, Dateien loeschen |

Scopes werden in der Dropbox App Console konfiguriert, nicht im Code.

---

## Datei-Browser

### Ordner-Navigation

- Dropbox-Ordnerstruktur hierarchisch durchsuchbar
- Header zeigt den Chor-Namen prominent statt "Dateien"
- Breadcrumb-Navigation mit Home-Icon als Root und klickbaren Pfadteilen
- Zurueck-Button (..) fuer uebergeordneten Ordner
- Zeigt Ordner und Audio-Dateien (MP3, WebM, M4A)
- Sortierung: Ordner zuerst, dann Dateien, jeweils alphabetisch
- Dateidetails: Audio-Dauer (gecacht nach erstem Abspielen), Labels
- Voice-Icons: Farbiges Stimmkuerzel (S, A, T, B, SA, SAT, SATB...) als Datei-Icon statt generischem Noten-Symbol. Einzelstimmen in Stimmfarbe, Mehrfachstimmen in lila. Dateien ohne Stimminfo zeigen Noten-Icon.

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Browser-UI |
| `frontend/src/components/ui/VoiceIcon.tsx` | Farbiges Stimmkuerzel-Icon |
| `frontend/src/utils/voiceColors.ts` | Shared Stimmfarben-Utilities |
| `frontend/src/stores/appStore.ts` | `browsePath` State |
| `backend/api/dropbox.py` | `GET /dropbox/browse` |
| `backend/services/dropbox_service.py` | `list_folder()` mit Paginierung |
| `backend/models/audio_duration.py` | Dauer-Cache (SQLModel) |
| `backend/services/audio_duration_service.py` | Dauer speichern/abfragen |

### Datei-Aktionen (Swipe & Drei-Punkte-Menue)

Dateien und Ordner haben rechts ein Drei-Punkte-Menue (EllipsisVertical). Ein Tap darauf oder Swipe nach links enthuellt die Aktions-Buttons:

**Dateien:**
- **Favorit** (Herz): Datei als Favorit markieren/entfernen
- **Label** (Tag): Label-Picker-Overlay oeffnen, Labels zuweisen/entfernen
- **Datei-Einstellungen** (Info): Oeffnet die Datei-Einstellungen-Seite fuer diese Datei (nur pro-member+)
- **Loeschen** (Papierkorb): Ab Chorleiter (Level 3+) sichtbar. Bestaetigungsdialog vor dem Loeschen.
- **Umbenennen** (Stift): Nur Admin (Level 4+). Dialog mit vorausgefuelltem Namen.

**Ordner:**
- **Favorit** (Herz): Ordner als Favorit markieren/entfernen
- **Umbenennen** (Stift): Nur Admin (Level 4+). Dialog mit vorausgefuelltem Namen.
- **Loeschen** (Papierkorb): Nur Admin (Level 4+). Nur leere Ordner koennen geloescht werden.

**Kebab-Menue (Drei-Punkte im Header):**
- Ab Pro-Mitglied sichtbar. Enthaelt: Aufnehmen, Datei hochladen, Ordner erstellen (Admin).
- Member sehen kein Kebab-Menue (nur Favoriten, Filter, Suche, Settings im Header).

- Tippen auf ein anderes Element oder erneutes Tippen auf die drei Punkte schliesst das Menue
- Einfach-Tap auf eine Datei oeffnet direkt den Player (kein Doppelklick noetig)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Swipe-UI, Drei-Punkte-Button, Kebab-Menue, Dialoge |
| `backend/api/dropbox.py` | `DELETE /dropbox/file`, `POST/DELETE /dropbox/folder`, `POST /dropbox/rename` |
| `backend/services/dropbox_service.py` | `delete_file()`, `create_folder()`, `move_file()` |

### Suche

- Volltextsuche ueber alle Dropbox-Dateien
- Debounced (300ms Verzoegerung beim Tippen)
- Mindestens 2 Zeichen erforderlich
- Ergebnisse zeigen Dateiname und vollstaendigen Pfad
- Suche schliesst: zurueck zur Ordneransicht

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Such-UI und Debounce-Logik |
| `backend/api/dropbox.py` | `GET /dropbox/search` |
| `backend/services/dropbox_service.py` | `search()` (max. 50 Ergebnisse) |

---

## Ordner-basierte Dokumente & Sektionen

Dokumente (PDF, Video, TXT) und Sektionen gehoeren zum **Ordner**, nicht zu einzelnen Audiodateien. Alle Dateien im selben Ordner teilen sich automatisch dieselben Dokumente und Sektionen.

### Prinzip

- Ein Ordner = ein Stueck (z.B. "Ave Maria/")
- Dokumente (Noten-PDFs, Texte, Probenvideos) werden fuer den Ordner hochgeladen
- Sektionen (Intro, Vers, Refrain) gelten fuer alle Audio-Stems im Ordner
- Kein manuelles Verlinken noetig — alles automatisch ueber den Ordnerpfad

### Unterstuetzte Dateitypen

| Typ | Extensions | Speicherung | Anzeige |
|-----|-----------|-------------|---------|
| PDF | `.pdf` | Dropbox + on-demand RAM-Cache | Seitenweise JPEG-Rendering (PyMuPDF) |
| Video | `.mp4`, `.webm`, `.mov` | Nur Dropbox | HTML5 Video-Player mit Streaming |
| Text | `.txt` | Nur Dropbox | Monospace-Textansicht |

### Dokumente im Player

- **Tab-Leiste**: Bei mehreren Dokumenten erscheinen Tabs mit Typ-Icon und Dateiname
- **Smart Sorting**: Dokumente deren Name zur Stimmlage des Users passt erscheinen zuerst
- **Ausblenden**: User koennen einzelne Dokumente per Tab-X ausblenden (persistent pro User)
- **Einblenden**: "+N ausgeblendet" Badge → Overlay zum Wieder-Einblenden
- Der Player ist reiner Konsument — kein Upload/Loeschen im Player

### Standalone Dokument-Viewer

- Route: `/#/doc-viewer?folder=<path>&name=<name>`
- Erreichbar durch Klick auf ein Dokument in der Browse-Seite
- Gleiche Funktionalitaet wie im Player (Tabs, Annotationen, Fullscreen inkl. Topbar-Hide)
- Upload-Funktion fuer pro-member+
- Fullscreen-Reset beim Verlassen der Seite

### Dokumente in der Browse-Seite

- Dokumente erscheinen als eigene Eintraege im Ordner (zwischen Ordnern und Audio-Dateien)
- Typ-spezifische Icons (PDF, Video, Text)
- Swipe-Actions: Favorisieren, Labels, Umbenennen, Loeschen
- Upload: Dateien hochladen ueber Kebab-Menue (akzeptiert Audio + Dokument-Formate)

### Dropbox-Sync

Beim Laden eines Ordners synchronisiert das Backend automatisch:
- **Neue Datei in Dropbox** → wird in der DB registriert
- **Datei geaendert** (Dropbox `content_hash` weicht ab) → DB-Eintrag wird aktualisiert, Caches invalidiert
- **Datei geloescht** → wird beim naechsten Loeschen via App aus der DB entfernt

### PDF-Rendering (ohne Disk-Storage)

PDFs werden **nicht** auf dem Server gespeichert. Stattdessen:
1. PDF-Bytes von Dropbox on-demand in RAM-Cache (TTL 30 Min, max 20 Dokumente)
2. Seitenweise Rendering mit PyMuPDF (200 DPI, JPEG Q85) in LRU-Cache (128 Seiten)
3. Erster Seitenabruf: Dropbox → RAM → Render → JPEG (~1-3s). Weitere: instant
| `backend/api/file_settings.py` | `GET/PUT /file-settings`, `POST /file-settings/propagate` |
| `backend/models/file_settings.py` | FileSettings-Modell (`section_ref_path`, `pdf_ref_path`) |
| `backend/api/sections.py` | Sektions-Referenz-Aufloesung |
| `backend/services/pdf_service.py` | PDF-Referenz-Aufloesung |

---

## Handschriftliche Annotationen (PDFs)

Chormitglieder koennen auf PDF-Seiten handschriftliche Markierungen machen — z.B. Atemzeichen, Dynamik, Einsaetze. Jeder User sieht nur seine eigenen Annotationen.

- **Zeichenmodus-Toggle**: Floating Action Button (Stift-Icon) unten-links auf dem PDF-Panel. Wird blau wenn aktiv
- **Zeichenwerkzeuge**: Stift, Textmarker (halbtransparent, 3x breiter), Radierer (Distanz-basierter Hit-Test)
- **6 Farben**: Rot, Blau, Gruen, Gelb, Lila, Schwarz
- **3 Strichbreiten**: Fein (2), Mittel (4), Dick (8)
- **Undo**: Letzter Strich rueckgaengig machen
- **Seite loeschen**: Alle Annotationen einer Seite entfernen
- **Technologie**: SVG-Overlay auf `<img>`-Seiten + `perfect-freehand`. Koordinaten normalisiert (ViewBox 0-1000)
- **Auto-Save**: 500ms Debounce → `PUT /api/annotations`. Flush bei Seitenwechsel und `beforeunload`
- **Speicherung**: Strokes als JSON in SQLite, pro User + Document-ID + Seitennummer (unique constraint)
- **Berechtigung**: Lesen fuer alle, Schreiben ab Rolle `member`

### Fullscreen-Modus (PDF + TXT)

- **FAB** rechts unten: Maximize/Minimize, Progress-Ring im Fullscreen
- **Auto-Fade**: Alle FABs faden nach 3s Inaktivitaet. Beruehrung stellt Sichtbarkeit her
- **Audio laeuft weiter** — nur UI-Elemente (Topbar, Tabs, PlayerBar) werden versteckt
- **Reset** bei Panel-Wechsel oder Navigation weg vom Player/DocViewer
- **TXT Schriftgroesse**: Im Fullscreen erscheinen +/- Buttons (rechts ueber Fullscreen-FAB) zum Zoomen der Schrift (7 Stufen, 12px–32px). Text bricht bei jeder Groesse sauber um

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/DocumentPanel.tsx` | Multi-Doc Tabs, Viewer-Dispatch, Hide/Unhide |
| `frontend/src/components/ui/AnnotatedPage.tsx` | `<img>` + SVG-Overlay pro Seite |
| `frontend/src/components/ui/AnnotationToolbar.tsx` | Werkzeugleiste: Stift, Textmarker, Radierer |
| `frontend/src/components/ui/VideoViewer.tsx` | HTML5 Video-Player mit Dropbox-Streaming |
| `frontend/src/components/ui/TextViewer.tsx` | Monospace-Textansicht |
| `frontend/src/hooks/useDocuments.ts` | Zustand Store (load/upload/remove/hide/unhide) |
| `frontend/src/hooks/useAnnotations.ts` | Zustand Store: drawingMode, tool, strokes, API-Calls |
| `frontend/src/pages/DocViewerPage.tsx` | Standalone Dokument-Viewer Route |
| `backend/api/documents.py` | `/api/documents` Endpoints |
| `backend/services/document_service.py` | Stream-Rendering, RAM-Cache, Sync |
| `backend/models/document.py` | Document-Modell (folder_path, file_type, content_hash) |
| `backend/models/user_hidden_document.py` | Ausblendungen pro User |
| `deploy_pdfs.sh` | PDF-Dateien + DB-Eintraege auf Prod deployen |

---

## Audio-Player

### Wiedergabe

- Play/Pause (kein Autoplay beim Oeffnen des Players)
- Seek per Waveform-Klick oder Zeitanzeige
- Aktuelle Position und Gesamtdauer
- Streaming ueber temporaere Dropbox-Links (4 Stunden gueltig, gecached)
- Globaler Audio-Singleton (ein Track gleichzeitig)
- Vor-/Zurueckspringen: einstellbar (5s/10s/15s), Doppeltipp auf Skip-Button wechselt das Intervall
- Track-Header: Farbiges Voice-Icon neben dem Dateinamen (gleiche Darstellung wie in der Dateiliste)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/PlayerPage.tsx` | Player-UI |
| `frontend/src/hooks/useAudioPlayer.ts` | Audio-Steuerung (Singleton) |
| `frontend/src/stores/playerStore.ts` | Playback-State |
| `backend/api/dropbox.py` | `GET /dropbox/stream` |

### Waveform

- Visuelle Darstellung des Audio-Signals (200 Balken)
- Peaks werden per Web Audio API berechnet und gecached
- Klickbar fuer Seek
- Zeigt Loop-Region (A-B) orange hervorgehoben, Rest grau
- Ohne aktiven Loop: Fortschrittsanzeige (gespielt = indigo, ungespielt = grau)
- Zeigt Session-Marker als Punkte
- Zwei Varianten: `Waveform` (UnifiedTimeline, dimmed-Modus) und `MiniWaveform` (TopPlayerBar) — beide mit Loop-Visualisierung

| Datei | Rolle |
|-------|-------|
| `frontend/src/hooks/useWaveform.ts` | Peak-Berechnung und Cache |
| `frontend/src/components/ui/Waveform.tsx` | Canvas-Rendering (UnifiedTimeline) |
| `frontend/src/components/ui/MiniWaveform.tsx` | Canvas-Rendering (TopPlayerBar) |

### Cycle Play (A-B Loop)

Einen Abschnitt des Tracks in Endlosschleife wiederholen. Zwei Wege, einen Loop zu definieren: Marker-Paare oder Section-Tap.

**Loop-Button (in der Play Bar):**
- Repeat-Icon links der Zeitanzeige in der TopPlayerBar (mini + full Variante)
- Einfach-Tap: Loop ein/ausschalten (nur moeglich wenn Loop-Bereich definiert)
- Doppel-Tap: Loop-Punkte zuruecksetzen
- Drei Zustaende: gedimmt (kein Loop-Bereich), hell (Bereich definiert, Loop aus), orange (Loop aktiv)

**Loop via Marker-Paare:**
- Tap auf einen Marker-Chip: Marker wird als erster Looppunkt gewaehlt (orange hervorgehoben)
- Tap auf einen zweiten Marker-Chip: Loop wird erstellt — der fruehere Marker wird A, der spaetere B, Loop wird automatisch aktiviert. Beide Marker bleiben orange.
- Tap auf den gleichen Marker nochmal: Auswahl zuruecksetzen (Marker wird wieder gruen)
- Tap auf einen beliebigen Marker bei aktivem Marker-Loop: Alter Loop wird sofort deaktiviert (beide Marker werden gruen), der getappte Marker wird neuer erster Looppunkt (orange). User muss dann zweiten Marker waehlen.

**Loop via Section-Tap:**
- Tap auf Section-Card setzt A/B automatisch auf Start/Ende der Sektion und aktiviert Loop
- Nochmal Tap auf gleiche Section deaktiviert den Loop
- Section-Loop und Marker-Loop sind gegenseitig exklusiv (Section-Tap loescht Marker-Loop und umgekehrt)

**Sonstiges:**
- Loop-Region in der Waveform visuell orange hervorgehoben
- Play- und Skip-Buttons monochrom (nicht farbig)

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/TopPlayerBar.tsx` | Loop-Button in der Play Bar |
| `frontend/src/components/ui/PlayerControlsBar.tsx` | Marker-Tap-Logik |
| `frontend/src/stores/playerStore.ts` | `loopStart`, `loopEnd`, `loopEnabled`, `loopMarkerIds`, `pendingLoopMarkerId` |
| `frontend/src/hooks/useLoopControls.ts` | `handleLoopTap()` (Single/Double-Tap) |
| `frontend/src/hooks/useAudioPlayer.ts` | Loop-Sprung-Logik |

### Session-Marker

Wichtige Stellen im Track markieren fuer schnelle Navigation und Loop-Definition.

- Marker an aktueller Position setzen (automatisch M1, M2, M3...)
- Maximal 5 Marker gleichzeitig — "Setze Marker"-Button wird bei 5 Markern deaktiviert, bei Loeschung wieder aktiv
- Alle Marker mit Zeitstempel als Chips anzeigen (horizontal scrollbar)
- Per Klick zum Marker springen
- Kebab-Menue (⋮) in der Marker-Zeile mit zwei Optionen:
  - **Marker loeschen**: Aktiviert Loesch-Modus — Marker wechseln auf weissen Rahmen, Tap loescht einzelnen Marker. Modus endet automatisch nach 3 Sekunden.
  - **Alle Marker loeschen**: Entfernt alle Marker auf einmal
- Marker als Punkte auf der Waveform sichtbar
- Marker-Chips dienen als Looppunkt-Auswahl (siehe Cycle Play oben): erster Tap = pending (orange), zweiter Tap auf anderen Marker = Loop erstellen

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/PlayerControlsBar.tsx` | Marker-Chip-UI + Tap-Logik |
| `frontend/src/stores/playerStore.ts` | `markers[]`, `addMarker()`, `removeMarker()`, `clearMarkers()`, `pendingLoopMarkerId`, `loopMarkerIds` |

### Sektionen & Section-Loop

Benannte Zeitbereiche (Intro, Strophe, Refrain...) pro Track. Alle User sehen die Sektionen, ab Pro-Mitglied verwaltbar.

- Unified View: Section-Lane (oben, Tap=Loop) + dimmed Waveform (unten, Tap=Seek) in einer Ansicht
- Waveform dimmed wenn Sections vorhanden, undimmed wenn keine Sections definiert
- Playhead-Linie durchlaeuft beide Bereiche (Section-Lane + Waveform)
- Zwei Zoom-Stufen (Fit: gesamter Track sichtbar, Detail: scrollbar, dynamisch berechnet damit kleinste Section-Label voll lesbar ist)
- Auto-Scroll im Detail-Modus (pausiert 3s bei manuellem Scroll)
- Luecken (Gaps) zwischen definierten Sektionen werden automatisch client-seitig berechnet (nicht in DB) und als gestrichelte Bloecke angezeigt. Gaps sind ebenfalls loopbar.
- Tap auf Section-Block aktiviert Loop (setzt A/B automatisch auf Start/Ende der Sektion)
- Nochmal Tap deaktiviert den Loop
- Section-Loop und Marker-Loop sind gegenseitig exklusiv
- Section Editor (Route `/sections`, ab Pro-Mitglied): Marker-basierter 3-Schritte-Workflow:
  1. Track durchhoeren und Marker setzen ("Setze Marker"-Button unterhalb der Waveform) an jeder Sektionsgrenze
  2. Sektionen generieren ("Erstelle Sektion(en)"-Button, aktiv ab 2+ Markern) — erstellt automatisch Sektionen aus Marker-Paaren (M1→M2 = Sektion 1, M2→M3 = Sektion 2, ...), nutzt dabei zyklisch die Sektionsvorlagen (Name + Farbe), loescht Marker danach
  3. Einzelne Sektionen bearbeiten: Tap auf Section-Brick in der SectionLane selektiert und oeffnet den Edit-Bereich. Im Edit-Modus stehen grosse farbige Preset-Bricks zur Auswahl (kein Freitext, keine Farbpalette). Start/Ende per Playhead anpassbar. Loeschen-Button (Papierkorb) neben Start/Ende. "Sektion aktualisieren" und "Abbrechen" nebeneinander.
- Hinweis "Waehle eine Sektion, um sie zu editieren" wenn Sektionen vorhanden aber keine selektiert
- **Sektionsvorlagen** (Route `/admin/section-presets`, ab Pro-Mitglied): Wiederverwendbare Name/Farbe-Kombinationen (z.B. Intro, Strophe, Refrain), die im Section-Editor als Auswahl-Bricks erscheinen. Verwaltung unter Einstellungen > Sektionsvorlagen.
- Default-Vorlagen beim Seeding: Intro, Strophe, Refrain, Bridge, Solo, Outro

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SectionEditorPage.tsx` | Section-Editor-UI |
| `frontend/src/components/ui/UnifiedTimeline.tsx` | Unified View: Section-Lane + Waveform + Playhead + Zoom |
| `frontend/src/components/ui/Waveform.tsx` | Canvas-Waveform (dimmed/undimmed) |
| `frontend/src/utils/buildTimeline.ts` | Gap-Berechnung (lueckenlose Timeline aus Sections + Dauer) |
| `frontend/src/hooks/useSections.ts` | Zustand Store + API-Logik |
| `frontend/src/hooks/useSectionPresets.ts` | Zustand Store fuer Sektionsvorlagen |
| `frontend/src/pages/admin/SectionPresetsPage.tsx` | Verwaltung der Sektionsvorlagen |
| `frontend/src/stores/playerStore.ts` | `activeSection`, `setSectionLoop()` |
| `backend/api/sections.py` | CRUD Endpoints (Pro-Mitglied+ fuer Schreibzugriff) |
| `backend/api/section_presets.py` | CRUD Sektionsvorlagen (Pro-Mitglied+) |
| `backend/models/section.py` | Section-Modell (dropbox_path, label, color, start/end_time, lyrics) |
| `backend/models/section_preset.py` | SectionPreset-Modell (name, color, sort_order) |

### Lyrics & Notizen

Pro Section koennen Lyrics und persoenliche Notizen hinterlegt werden. Waehrend der Wiedergabe werden die Lyrics der aktuellen Section automatisch angezeigt (einige Sekunden vorher, Karaoke-Prinzip). Zusaetzlich gibt es Track-weite Notizen.

- **Lyrics pro Section** (shared): Jede Section kann einen Liedtext enthalten. Lyrics werden beim Abspielen automatisch angezeigt, ca. 3 Sekunden bevor die Section beginnt.
- **Notizen pro Section** (persoenlich): Jeder User kann pro Section und pro Track eigene Notizen hinterlegen.
- **Karaoke-Ansicht**: Im Player wird die aktuelle Section prominent mit Lyrics angezeigt, darunter eine Vorschau der naechsten Section.
- **Bearbeiten**: Pro-Mitglied+ koennen Lyrics und Notizen bearbeiten. Gaeste und Members sehen nur die Leseansicht.
- **Leere Sections**: Sections ohne Lyrics zeigen "Keine Lyrics" an.

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/PlayerLyrics.tsx` | Lyrics/Notizen-Anzeige im Player (Lese-/Bearbeitungsmodus) |
| `frontend/src/hooks/useSectionsNotes.ts` | Zustand Store fuer Notes + Lyrics-Helpers |
| `backend/api/notes.py` | CRUD Notizen (GET fuer alle, PUT fuer Pro-Mitglied+) |
| `backend/api/sections.py` | `PUT /sections/lyrics` Bulk-Lyrics-Update (Pro-Mitglied+) |
| `backend/models/note.py` | Note-Modell (user_id, dropbox_path, section_id, text) |

### Top-Player-Bar

Kompakte Wiedergabe-Steuerung unterhalb des Seiten-Headers auf Browse-Seiten.

- Zeigt aktuelle Position und Gesamtdauer
- Play/Pause und Skip-Buttons
- Fortschrittsbalken
- Mini-Variante: Antippen oeffnet den vollen Player
- Full-Variante: Auf Player- und Sektionen-Seite

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/TopPlayerBar.tsx` | Player-Bar-UI (mini/full) |

---

## Favoriten

Persoenliche Sammlung von Lieblings-Dateien und -Ordnern pro User.

- Datei oder Ordner als Favorit markieren/entfernen (Herz-Icon) ueber Drei-Punkte-Menue/Swipe im Browser
- Eigene Favoriten-Seite mit gruppierter Darstellung:
  - Favorisierte Ordner als blaue Divider-Zeilen mit Datei-Anzahl
  - Zugehoerige favorisierte Dateien eingerueckt darunter
  - Einzelne Dateien ohne Folder-Favorit unter "Einzelne Dateien"
- Tap auf Folder-Divider navigiert zum Ordner im Browser, Zurueck-Pfeil fuehrt zu Favorites
- Tap auf Datei oeffnet direkt den Player, Zurueck-Pfeil fuehrt zu Favorites
- Pro User unabhaengig (jeder User hat eigene Favoriten)
- Label-Filter auch auf Favoriten-Seite verfuegbar

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/FavoritesPage.tsx` | Favoriten-Seite (gruppiert nach Ordnern) |
| `frontend/src/pages/BrowsePage.tsx` | Favorit-Toggle fuer Dateien und Ordner (Swipe/Kebab) |
| `frontend/src/hooks/useFavorites.ts` | Zustand Store + API-Logik |
| `backend/api/favorites.py` | `GET /favorites`, `POST /favorites/toggle` |
| `backend/models/favorite.py` | Favoriten-Modell (user_id + dropbox_path + entry_type) |

---

## Labels & Filter

### Label-System

Labels zum Kategorisieren von Dateien, verwaltbar ab Rolle `pro-member`.

- Pro-Mitglieder+ erstellen Labels mit Name, Farbe (Hex) und optionaler Kategorie
- Default-Labels beim Seeding: Sopran, Alt, Tenor, Bass (Kategorie "Stimme"), Schwierig, Geubt (Kategorie "Status")
- User weisen Labels per Datei zu (Mehrfachzuweisung moeglich)
- Labels als farbige Chips auf Dateien sichtbar
- Pro User unabhaengig (jeder User hat eigene Zuweisungen)

| Datei | Rolle |
|-------|-------|
| `frontend/src/hooks/useLabels.ts` | Zustand Store + API-Logik |
| `frontend/src/pages/admin/LabelsPage.tsx` | Admin Label-Verwaltung |
| `backend/api/labels.py` | CRUD Labels + Zuweisungen |
| `backend/models/label.py` | Label-Modell (name, color, category, sort_order) |
| `backend/models/user_label.py` | Zuweisungs-Modell (user_id + dropbox_path + label_id) |

### Label-Filter

- Filter-Leiste auf Browse- und Favoriten-Seite
- Labels als klickbare Chips mit Farbpunkt
- Mehrfachauswahl moeglich
- Filter zeigt **alle** Dateien mit dem Label (ordneruebergreifend)
- "Alle"-Button setzt Filter zurueck
- Breadcrumb ausgeblendet wenn Filter aktiv

---

## Audio-Aufnahme & Datei-Upload

Detaillierte Spezifikation zur Aufnahme: **[RECORDING.md](RECORDING.md)**

### Aufnahme

- Browser-Mikrofon-Aufnahme (MediaRecorder API)
- Server-seitige Konvertierung zu MP3 (FFmpeg)
- Strukturierte Dateibenennung: Stimme-Ordner-Abschnitt-Freitext
- Upload in aktuellen Dropbox-Ordner
- Alle authentifizierten User koennen aufnehmen

### Datei-Upload

Bestehende Audio-Dateien vom Geraet hochladen (z.B. aus Sprachmemos, WhatsApp, Dateien-App).

- Upload-Button im Footer des Datei-Browsers (neben Aufnahme-Button)
- Oeffnet den nativen Datei-Picker des Geraets
- iOS: nur Dateiendungen im `accept`-Attribut, damit direkt die Dateien-App oeffnet (statt Kamera/Fotomediathek)
- Android/Desktop: `audio/*` MIME-Type fuer nativen Audio-Filter im Picker
- Nach Dateiauswahl oeffnet sich das gleiche Benennungs-Modal wie bei Aufnahmen (Stimme, Abschnitt, Notiz)
- Unterstuetzte Formate: MP3, M4A, WebM, OGG, Opus, WAV, MP4, MIDI (.mid/.midi)
- Nicht-MP3-Dateien werden server-seitig automatisch zu MP3 konvertiert
- MIDI-Dateien werden ueber FluidSynth (SoundFont FluidR3_GM) zu WAV gerendert, dann via FFmpeg zu MP3 konvertiert
- Maximale Dateigroesse: 20 MB

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Upload-Button + verstecktes File-Input |
| `frontend/src/components/ui/RecordingModal.tsx` | Geteiltes Modal (Aufnahme + Import) |
| `frontend/src/utils/platform.ts` | OS-Erkennung (isIOS, isAndroid, isMobile) |
| `backend/api/dropbox.py` | `POST /dropbox/upload` (Validierung + Konvertierung) |

---

## Admin-Funktionen

### Nutzerverwaltung

- Alle User des eigenen Chors auflisten (Benutzername, Anzeigename, Rolle, Stimme, letzter Login)
- Rolle aendern per Dropdown (Gast, Mitglied, Pro-Mitglied, Chorleiter, Admin, Beta-Tester, Developer)
- User loeschen (eigenen Account nicht loeschbar, nur innerhalb des eigenen Chors)
- Neue User manuell anlegen (werden dem eigenen Chor zugewiesen)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/admin/UsersPage.tsx` | User-Verwaltungs-UI |
| `backend/api/admin.py` | `/admin/users` Endpoints |

### Einladungslink

- Jeder Chor hat einen eindeutigen Einladungscode (`invite_code`)
- Einladungslink: `/#/join/<invite_code>` — fuehrt zur Registrierung mit Chor-Kontext
- Admin kann den Einladungscode aendern
- Copy-Button zum einfachen Teilen des kompletten Links
- Aenderbar ueber Einstellungen-Seite

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SettingsPage.tsx` | Einladungslink-Sektion |
| `backend/api/admin.py` | `GET/PUT /admin/settings` |

### Chor-Verwaltung (nur Developer)

- Alle Choere auflisten mit Einladungslinks (klickbar + Copy-Button)
- Neuen Chor erstellen (Name, Einladungscode, Dropbox-Ordner, Admin-User + Passwort)
- Beim Erstellen wird automatisch ein Admin-Account fuer den Chor angelegt (`must_change_password`)
- Bestehende Choere bearbeiten (Name, Einladungscode, Ordner) per Stift-Button
- Chor-Wechsel: Developer kann per Login-Button in jeden Chor wechseln, aktiver Chor wird mit "Aktiv"-Badge markiert
- Einladungscodes muessen eindeutig sein
- Globaler Dropbox App-Ordner konfigurierbar (Prefix fuer alle Choere)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/admin/ChoirsPage.tsx` | Chor-Verwaltungs-UI |
| `backend/api/admin.py` | `GET/POST/PUT /admin/choirs` |

### Label-Verwaltung

- Labels erstellen mit Name, Farbe, Kategorie, Sortierung
- Labels bearbeiten und loeschen
- Loeschen entfernt alle User-Zuweisungen

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/admin/LabelsPage.tsx` | Label-Admin-UI |
| `backend/api/labels.py` | CRUD Endpoints |

---

## Darstellung & Einstellungen

### Popup-Menus (zentralisiert)

Alle Popup-Menus teilen einen einheitlichen Style ueber die CSS-Klassen `.popup-menu` (Container) und `.popup-menu-item` (Eintraege). Komponentenspezifische Klassen enthalten nur noch Positionierung und Overrides.

Betrifft: Player-Header-Menu, Player-Footer-Menu, Marker-Kebab-Menu, Skip-Interval-Menus (TopPlayerBar + GlobalPlayerBar).

### Dark/Light Theme

- Umschalten zwischen dunklem und hellem Design
- Wahl wird in `localStorage` gespeichert
- Umgesetzt ueber CSS Custom Properties (`--bg-primary`, `--text-primary`, etc.)
- Toggle auf der Einstellungen-Seite

### Einstellungen-Seite

Zentrale Seite fuer alle User- und Admin-Konfigurationen:
- Profil (Anzeigename, Stimme, Chor-Name)
- Passwort aendern
- Theme-Toggle
- Dropbox-Verbindung (nur Developer)
- Dropbox App-Ordner — globaler Prefix fuer alle Choere (nur Developer)
- Einladungslink mit Copy-Button und klickbarer URL (nur Admin)
- Chor-Ordner in der Dropbox (nur Admin)
- Labels verwalten (ab Pro-Mitglied)
- Sektionsvorlagen verwalten (ab Pro-Mitglied)
- Choere verwalten (nur Developer)
- Nutzer verwalten (nur Admin)
- Logout

---

## Progressive Web App (PWA)

### Installation

ChoirBox ist als PWA installierbar — ohne App Store, direkt aus dem Browser.

- `display: standalone` — nach Installation verschwindet die Browser-UI komplett
- App-Icon auf dem Homescreen, erscheint im App-Switcher wie eine native App
- Orientierung auf Portrait fixiert

Nach dem Login wird ein Install-Guide als Overlay angezeigt mit Schritt-fuer-Schritt-Anleitungen fuer iOS (Safari) und Android (Chrome).

- Plattform-Erkennung: zeigt nur die relevante Anleitung (iOS, Android, oder beide auf Desktop)
- "Verstanden" schliesst den Guide fuer die aktuelle Session
- "Nicht mehr anzeigen" speichert die Wahl permanent in `localStorage` (`choirbox_pwa_dismissed`)
- Guide erscheint nicht, wenn die App bereits als PWA laeuft (`display-mode: standalone`)

### Service Worker

Network-first Service Worker — frische Inhalte haben Prioritaet, Cache dient nur als Offline-Fallback:

- Alle Requests: Network-first, bei Erfolg wird der Cache aktualisiert
- Offline-Fallback: gecachte Version ausliefern, fuer Navigation `index.html`
- API-Calls (`/api/*`) werden nie gecacht
- Nur in Production aktiv (`import.meta.env.PROD`)
- Alte Caches werden bei Aktivierung automatisch bereinigt (versionierter Cache-Name)

### PWA-Assets

- Manifest: `public/manifest.json`
- Icons: `public/icons/` (72px bis 512px, generiert aus `public/icon.svg`)
- Apple-Touch-Icon: 152x152px
- Theme-Color: `#1a1a2e`

| Datei | Rolle |
|-------|-------|
| `frontend/public/manifest.json` | PWA-Manifest |
| `frontend/public/sw.js` | Service Worker |
| `frontend/public/icon.svg` | Quell-Icon (SVG) |
| `frontend/public/icons/` | Generierte PNG-Icons |
| `frontend/src/components/PwaInstallGuide.tsx` | Install-Anleitung |
| `frontend/index.html` | Meta-Tags, Manifest-Link |
| `frontend/src/main.tsx` | Service Worker Registrierung |

### Geplant (nicht implementiert)

Audio-Caching und Offline-Modus sind als Future Feature dokumentiert. Siehe `docs/future/pwa-audio-caching.md`.

---

## Navigation

### Seitenstruktur

Jede Seite hat einen eigenen Header mit Seitentitel. Alle Seiten ausser der Hauptseite (Dateien) haben links einen Zurueck-Button (`<`).

- **Dateien** (Hauptseite): Header mit Chor-Name + Aktions-Icons (Favoriten, Filter, Suche, Einstellungen). Breadcrumb mit Home-Icon. Footer mit Aufnahme- und Upload-Buttons.
- **Player, Sektionen**: Header mit Zurueck-Button + Titel, darunter Player-Controls und Toolbar.
- **Favoriten, Einstellungen**: Header mit Zurueck-Button + Titel.
- **Admin-Seiten**: Header mit Zurueck-Button + Titel + optionale Aktions-Buttons.

### Routing

| Pfad | Seite | Zugang |
|------|-------|--------|
| `/login` | Login | Oeffentlich |
| `/register` | Registrierung (Hinweis ohne Einladungslink) | Oeffentlich |
| `/join/:inviteCode` | Registrierung mit Chor-Kontext | Oeffentlich |
| `/browse` | Datei-Browser | Authentifiziert |
| `/favorites` | Favoriten | Authentifiziert |
| `/player` | Audio-Player | Authentifiziert |
| `/settings` | Einstellungen | Authentifiziert |
| `/sections` | Section-Editor | Pro-Mitglied+ |
| `/admin/users` | Nutzerverwaltung | Admin |
| `/admin/labels` | Label-Verwaltung | Pro-Mitglied+ |
| `/admin/section-presets` | Sektionsvorlagen | Pro-Mitglied+ |
| `/admin/choirs` | Chor-Verwaltung | Developer |

HashRouter fuer Client-seitiges Routing (`/#/browse`, `/#/player`, etc.).

---

## API-Endpunkte

### Auth (`/api/auth`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| POST | `/login` | Login | Oeffentlich |
| GET | `/choir-info` | Chor-Info per invite_code | Oeffentlich |
| POST | `/register` | Registrierung (mit invite_code) | Oeffentlich |
| POST | `/logout` | Logout | User |
| GET | `/me` | Eigenes Profil (inkl. choir_name) | User |
| PUT | `/me` | Profil aendern | User |
| PUT | `/me/password` | Passwort aendern | User |

### Dropbox (`/api/dropbox`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/status` | Verbindungsstatus | User |
| GET | `/authorize` | OAuth-URL holen | Developer |
| GET | `/callback` | OAuth-Callback | Oeffentlich |
| POST | `/disconnect` | Verbindung trennen | Admin |
| GET | `/browse` | Ordner auflisten | User |
| GET | `/search` | Dateien suchen | User |
| GET | `/stream` | Streaming-Link holen | User |
| POST | `/upload` | Aufnahme hochladen | User |
| DELETE | `/file` | Datei loeschen | Chorleiter+ |
| POST | `/folder` | Ordner erstellen | Admin |
| DELETE | `/folder` | Leeren Ordner loeschen | Admin |
| POST | `/rename` | Datei/Ordner umbenennen | Admin |

### Favoriten (`/api/favorites`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/` | Favoriten auflisten | User |
| POST | `/toggle` | Favorit umschalten | User |

### Labels (`/api/labels`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/` | Labels auflisten | User |
| POST | `/` | Label erstellen | Pro-Mitglied+ |
| PUT | `/{id}` | Label bearbeiten | Pro-Mitglied+ |
| DELETE | `/{id}` | Label loeschen | Pro-Mitglied+ |
| GET | `/my` | Eigene Zuweisungen | User |
| POST | `/my/toggle` | Zuweisung umschalten | User |

### Sections (`/api/sections`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/?path=<dropbox_path>` | Sektionen eines Tracks auflisten (inkl. Lyrics) | User |
| POST | `/` | Einzelne Sektion erstellen | Pro-Mitglied+ |
| POST | `/bulk` | Mehrere Sektionen auf einmal erstellen (aus Markern) | Pro-Mitglied+ |
| PUT | `/{id}` | Sektion bearbeiten (inkl. Lyrics) | Pro-Mitglied+ |
| PUT | `/lyrics` | Lyrics fuer mehrere Sektionen auf einmal speichern | Pro-Mitglied+ |
| DELETE | `/{id}` | Sektion loeschen (loescht zugehoerige Notizen) | Pro-Mitglied+ |

### Dokumente (`/api/documents`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/list?folder=<path>` | Alle Dokumente eines Ordners (mit hidden-Status, Auto-Sync mit Dropbox) | User |
| POST | `/upload` | Dokument hochladen (FormData: `file` + `folder_path`) | Pro-Mitglied+ |
| GET | `/{id}/page/{page}` | PDF-Seite als JPEG rendern (on-demand von Dropbox) | User |
| GET | `/{id}/download` | Redirect auf Dropbox Temp-Link | User |
| GET | `/{id}/stream` | Dropbox Temp-Link fuer Video-Streaming | User |
| GET | `/{id}/content` | TXT-Inhalt als Text | User |
| DELETE | `/{id}` | Dokument loeschen (DB + Dropbox) | Pro-Mitglied+ |
| POST | `/{id}/hide` | Dokument fuer aktuellen User ausblenden | User |
| DELETE | `/{id}/hide` | Dokument wieder einblenden | User |

### Annotationen (`/api/annotations`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/?doc_id=<id>&page=<n>` | Strokes fuer User + Dokument + Seite laden | User |
| PUT | `/` | Upsert: Strokes speichern (`doc_id`, `page`, `strokes`) | Member+ |
| DELETE | `/?doc_id=<id>&page=<n>` | Annotationen einer Seite loeschen | Member+ |
| DELETE | `/all?doc_id=<id>` | Alle Annotationen eines Dokuments loeschen | Member+ |

### Sektionsvorlagen (`/api/section-presets`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/` | Alle Sektionsvorlagen auflisten | User |
| POST | `/` | Vorlage erstellen | Pro-Mitglied+ |
| PUT | `/{id}` | Vorlage bearbeiten | Pro-Mitglied+ |
| DELETE | `/{id}` | Vorlage loeschen | Pro-Mitglied+ |

### Notizen (`/api/notes`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/?path=<dropbox_path>` | Eigene Notizen (Track + Sections) | User |
| PUT | `/` | Einzelne Notiz speichern/loeschen | Pro-Mitglied+ |
| PUT | `/bulk` | Mehrere Notizen auf einmal speichern | Pro-Mitglied+ |

### Admin (`/api/admin`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/users` | User des eigenen Chors auflisten | Admin |
| POST | `/users` | User anlegen (im eigenen Chor) | Admin |
| PUT | `/users/{id}` | User bearbeiten (nur eigener Chor) | Admin |
| DELETE | `/users/{id}` | User loeschen (nur eigener Chor) | Admin |
| GET | `/settings` | Chor-Settings lesen (invite_code, root_folder) | Admin |
| PUT | `/settings` | Chor-Settings aendern | Admin |
| GET | `/choirs` | Alle Choere auflisten | Developer |
| POST | `/choirs` | Neuen Chor erstellen (inkl. Admin-User) | Developer |
| PUT | `/choirs/{id}` | Chor bearbeiten | Developer |
| POST | `/choirs/{id}/switch` | In Chor wechseln (setzt user.choir_id) | Developer |

---

## Datenmodelle

### User

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | UUID | Primaerschluessel |
| `username` | String (max 100) | Eindeutig (ueber alle Choere) |
| `display_name` | String (max 100) | Anzeigename |
| `role` | String | `guest`, `member`, `pro-member`, `chorleiter`, `admin`, `beta-tester`, `developer` |
| `voice_part` | String | Sopran, Alt, Tenor oder Bass |
| `choir_id` | UUID (FK) | Referenz auf Choir |
| `must_change_password` | Boolean | Erzwungene PW-Aenderung nach erstem Login |
| `password_hash` | String | PBKDF2-Hash |
| `created_at` | DateTime | Erstellungszeitpunkt |
| `updated_at` | DateTime | Letzte Aenderung |
| `last_login_at` | DateTime | Letzter Login |

### Favorite

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `user_id` | UUID (FK) | Referenz auf User |
| `dropbox_path` | String | Dropbox-Dateipfad |
| `file_name` | String | Dateiname (aus Pfad extrahiert) |
| `entry_type` | String | `'file'` oder `'folder'` (Default: `'file'`) |
| `created_at` | DateTime | Erstellungszeitpunkt |

### Label

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `name` | String (max 50) | Label-Name |
| `color` | String | Hex-Farbe (z.B. `#6366f1`) |
| `category` | String (max 50) | Optionale Kategorie (z.B. "Stimme") |
| `sort_order` | Integer | Sortierung |

### UserLabel (Zuweisung)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `user_id` | UUID (FK) | Referenz auf User |
| `dropbox_path` | String | Dropbox-Dateipfad |
| `label_id` | Integer (FK) | Referenz auf Label |

### SectionPreset

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `name` | String (max 50) | Vorlagenname (z.B. "Intro", "Refrain") |
| `color` | String (max 7) | Hex-Farbe |
| `sort_order` | Integer | Sortierung |

### Section

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `dropbox_path` | String | Dropbox-Dateipfad |
| `label` | String (max 50) | Sektionsname (z.B. "Refrain") |
| `color` | String (max 7) | Hex-Farbe |
| `start_time` | Float | Startzeit in Sekunden |
| `end_time` | Float | Endzeit in Sekunden |
| `lyrics` | String (optional) | Liedtext fuer diese Sektion |
| `sort_order` | Integer | Sortierung |
| `created_by` | UUID (FK) | Ersteller |
| `created_at` | DateTime | Erstellungszeitpunkt |
| `updated_at` | DateTime | Letzte Aenderung |

### Note

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `user_id` | UUID (FK) | Referenz auf User |
| `dropbox_path` | String | Dropbox-Dateipfad |
| `section_id` | Integer (FK, optional) | Referenz auf Section (null = Track-Notiz) |
| `text` | String | Notiztext |
| `created_at` | DateTime | Erstellungszeitpunkt |
| `updated_at` | DateTime | Letzte Aenderung |

### Document

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `folder_path` | String (indexed) | Ordnerpfad (z.B. "/Ave Maria") |
| `file_type` | String | `'pdf'`, `'video'` oder `'txt'` |
| `original_name` | String | Originaler Dateiname |
| `file_size` | Integer | Dateigroesse in Bytes |
| `page_count` | Integer | Seitenanzahl (nur PDF) |
| `content_hash` | String (optional) | Dropbox Content-Hash fuer Aenderungserkennung |
| `sort_order` | Integer | Reihenfolge im Ordner |
| `uploaded_by` | String (FK, optional) | Referenz auf User |
| `created_at` | DateTime | Erstellungszeitpunkt |

### UserHiddenDocument

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `user_id` | String (FK, PK) | Referenz auf User |
| `document_id` | Integer (FK, PK) | Referenz auf Document |

### SessionToken

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `token` | String (max 64) | Primaerschluessel, zufaellig generiert |
| `user_id` | UUID (FK) | Referenz auf User |
| `created_at` | DateTime | Erstellungszeitpunkt (Ablauf nach 7 Tagen) |

### Choir

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | UUID | Primaerschluessel |
| `name` | String (max 200) | Chor-Name |
| `invite_code` | String (max 100) | Eindeutiger Einladungscode |
| `dropbox_root_folder` | String (max 500) | Unterordner in der Dropbox |
| `created_at` | DateTime | Erstellungszeitpunkt |

### AppSettings (Singleton)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Immer 1 |
| `registration_code` | String | Legacy (nicht mehr genutzt, durch Choir.invite_code ersetzt) |
| `dropbox_refresh_token` | String | OAuth Refresh Token (global, alle Choere teilen einen Account) |
| `dropbox_account_id` | String | Dropbox Account ID |
| `dropbox_account_email` | String | Dropbox Account E-Mail |
| `dropbox_connected_at` | DateTime | Verbindungszeitpunkt |
| `dropbox_root_folder` | String | Optionaler globaler App-Ordner (Prefix fuer alle Chor-Ordner) |
| `updated_at` | DateTime | Letzte Aenderung |

---

## UI-Komponenten

### Modal-System (zentralisiert)

Alle Modals nutzen das geteilte `<Modal>` Base-Component (`components/ui/Modal.tsx`).

**Einheitliches Verhalten:**
- Overlay: fixiert, dunkler Hintergrund (rgba 0,0,0,0.6), z-index 1000
- Container: max-width 400px, bg-primary, border-radius 2xl, scrollbar bei Ueberlauf
- Header: Titel + X-Schliessen-Button (optional)
- Lifecycle: `setModalOpen(true/false)` + Playback-Stop automatisch verwaltet
- Primaer-Buttons: einheitlich `btn btn-primary` (--confirm, Blau)
- Sekundaer-Buttons: `btn btn-secondary`
- Danger-Buttons: `btn btn-danger`

**Verfuegbare Modals:**
- `ConfirmDialog` — Bestaetigung/Loeschen/Erstellen mit optionalen Children (z.B. Input-Felder)
- `ImportModal` — Batch-Upload mit Fortschrittsanzeige
- `RenameModal` — Datei umbenennen mit Stimme/Abschnitt/Notiz-Auswahl
- `RecordingModal` — Audio-Aufnahme mit Upload

**Props des Base-Components:**

| Prop | Typ | Default | Beschreibung |
|------|-----|---------|-------------|
| `title` | string | — | Titel im Header (ohne → kein Header) |
| `onClose` | () => void | — | Schliessen-Handler |
| `closeOnOverlay` | boolean | true | Overlay-Klick schliesst Modal |
| `showClose` | boolean | true | X-Button anzeigen |
| `children` | ReactNode | — | Modal-Inhalt |

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/Modal.tsx` | Geteiltes Base-Component |
| `frontend/src/styles/index.css` | `.modal-overlay`, `.modal-container`, `.modal-header`, `.modal-title`, `.modal-body` |
