# ChoirBox — Feature-Spezifikation

## Ueberblick

ChoirBox ist eine Smartphone-optimierte Web-App fuer Chormitglieder. Kernfunktionen: Audio-Dateien aus einer geteilten Dropbox durchsuchen, abspielen, mit Labels organisieren, und eigene Uebungs-Aufnahmen hochladen.

---

## Authentifizierung & Benutzerverwaltung

### Registrierung

Chormitglieder registrieren sich selbst mit einem Registrierungscode, den der Admin vorgibt.

- Pflichtfelder: Registrierungscode, Benutzername, Anzeigename, Passwort, Stimme (Sopran/Alt/Tenor/Bass)
- Passwort mindestens 4 Zeichen
- Passwort-Hashing: PBKDF2-HMAC-SHA256 (100.000 Iterationen)
- Benutzername muss eindeutig sein

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/RegisterPage.tsx` | Registrierungs-UI |
| `backend/api/auth.py` | `POST /auth/register` |
| `backend/models/user.py` | User-Modell |

### Login

- Benutzername + Passwort
- Token-basierte Session (7 Tage gueltig), persistiert in SQLite
- Sessions ueberleben Server-Neustarts (DB-backed statt In-Memory)
- Rate-Limiting: max. 5 fehlgeschlagene Versuche pro Minute pro IP
- Letzter Login-Zeitpunkt wird gespeichert
- Token in `localStorage` persistiert
- Abgelaufene Tokens werden beim Login automatisch bereinigt

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

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SettingsPage.tsx` | Profil-Sektion |
| `backend/api/auth.py` | `PUT /auth/me`, `PUT /auth/me/password` |

### Rollen-Hierarchie

5-stufiges Rollensystem mit aufsteigenden Berechtigungen. Jede hoehere Rolle erbt alle Rechte der niedrigeren.

| Rolle | Level | Beschreibung |
|-------|-------|-------------|
| `guest` | 0 | Registriert, eingeschraenkt |
| `member` | 1 | Standard-Chormitglied (Browsen, Streamen, Upload, Favoriten) |
| `pro-member` | 2 | Kann Labels und Sections verwalten |
| `chorleiter` | 3 | Erweiterte Verwaltungsrechte |
| `admin` | 4 | Voller Zugriff (Nutzer, Dropbox, Settings) |

- Neue Registrierungen erhalten automatisch die Rolle `member`
- Admin kann Rollen ueber die Nutzerverwaltung aendern (Dropdown mit allen Rollen)
- Backend: `require_role("pro-member")` als Dependency fuer rollenbasierte Endpunkte
- Frontend: `hasMinRole(userRole, "pro-member")` fuer UI-Sichtbarkeit

| Datei | Rolle |
|-------|-------|
| `backend/api/auth.py` | `ROLE_HIERARCHY`, `require_role()`, `require_admin` |
| `frontend/src/utils/roles.ts` | `hasMinRole()`, `ROLE_LABELS`, `ALL_ROLES` |

### Logout

- Token wird im Backend invalidiert
- `localStorage` geleert
- Redirect zur Login-Seite

---

## Dropbox-Integration

### Verbindung (nur Admin)

Der Admin verbindet ChoirBox einmalig mit einem Dropbox-Account. Alle User teilen diesen Zugang (nur Lesen + Upload).

- OAuth 2.0 Authorization Code Flow mit Refresh Token
- Account-E-Mail und ID werden gespeichert
- Admin kann Verbindung trennen
- Status sichtbar auf der Einstellungen-Seite

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
- Breadcrumb-Navigation mit klickbaren Pfadteilen
- Zurueck-Button (..) fuer uebergeordneten Ordner
- Zeigt Ordner und Audio-Dateien (MP3, WebM, M4A)
- Sortierung: Ordner zuerst, dann Dateien, jeweils alphabetisch
- Dateidetails: Groesse, Labels
- Voice-Icons: Farbiges Stimmkuerzel (S, A, T, B, SA, SAT, SATB...) als Datei-Icon statt generischem Noten-Symbol. Einzelstimmen in Stimmfarbe, Mehrfachstimmen in lila. Dateien ohne Stimminfo zeigen Noten-Icon.

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Browser-UI |
| `frontend/src/components/ui/VoiceIcon.tsx` | Farbiges Stimmkuerzel-Icon |
| `frontend/src/utils/voiceColors.ts` | Shared Stimmfarben-Utilities |
| `frontend/src/stores/appStore.ts` | `browsePath` State |
| `backend/api/dropbox.py` | `GET /dropbox/browse` |
| `backend/services/dropbox_service.py` | `list_folder()` mit Paginierung |

### Datei loeschen (Swipe-to-Delete)

Chorleiter und Admins koennen Audio-Dateien direkt aus der Dropbox loeschen.

- Swipe-Geste: Auf einer Datei nach links wischen enthuellt einen roten "Loeschen"-Button
- Bestaetigungsdialog vor dem Loeschen ("Wird unwiderruflich aus der Dropbox geloescht")
- Nach dem Loeschen wird die Dateiliste automatisch aktualisiert
- Falls die geloeschte Datei gerade abgespielt wird, wird der Player zurueckgesetzt
- Nur sichtbar fuer Chorleiter (Level 3) und Admin (Level 4)
- Tippen auf ein anderes Element schliesst das geoeffnete Swipe-Menue

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Swipe-UI, Bestaetigungsdialog, Loeschlogik |
| `backend/api/dropbox.py` | `DELETE /dropbox/file` |
| `backend/services/dropbox_service.py` | `delete_file()` |

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

## Audio-Player

### Wiedergabe

- Play/Pause
- Seek per Waveform-Klick oder Zeitanzeige
- Aktuelle Position und Gesamtdauer
- Streaming ueber temporaere Dropbox-Links (4 Stunden gueltig, gecached)
- Globaler Audio-Singleton (ein Track gleichzeitig)
- Vor-/Zurueckspringen: 15 Sekunden
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
- Zeigt Loop-Region (A-B) farblich hervorgehoben
- Zeigt Session-Marker als Punkte

| Datei | Rolle |
|-------|-------|
| `frontend/src/hooks/useWaveform.ts` | Peak-Berechnung und Cache |
| `frontend/src/components/ui/Waveform.tsx` | Canvas-Rendering |

### Cycle Play (A-B Loop)

Einen Abschnitt des Tracks in Endlosschleife wiederholen.

- A-Punkt setzen (Loop-Start) an aktueller Position
- B-Punkt setzen (Loop-End) an aktueller Position
- Loop ein/ausschalten (nur moeglich wenn A und B gesetzt)
- Loop loeschen
- Loop-Region in der Waveform visuell hervorgehoben

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/PlayerPage.tsx` | A/B-Buttons |
| `frontend/src/stores/playerStore.ts` | `loopStart`, `loopEnd`, `loopEnabled` |
| `frontend/src/hooks/useAudioPlayer.ts` | Loop-Sprung-Logik |

### Session-Marker

Wichtige Stellen im Track markieren fuer schnelle Navigation.

- Marker an aktueller Position setzen (automatisch M1, M2, M3...)
- Alle Marker mit Zeitstempel anzeigen
- Per Klick zum Marker springen
- Einzelnen Marker entfernen
- Alle Marker auf einmal loeschen (Muelleimer-Icon)
- Marker als Punkte auf der Waveform sichtbar

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/PlayerPage.tsx` | Marker-UI |
| `frontend/src/stores/playerStore.ts` | `markers[]`, `addMarker()`, `removeMarker()`, `clearMarkers()` |

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
- Manuelles A/B-Setzen ueberschreibt den Section-Loop (beide Systeme koexistieren, gegenseitig exklusiv)
- Section Editor (Route `/sections`, ab Pro-Mitglied): Waveform mit Play/Pause, Start/Ende per Playhead setzen, Name (Freitext + Presets), Farbwahl, Sektionsliste mit Bearbeiten/Loeschen

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SectionEditorPage.tsx` | Section-Editor-UI |
| `frontend/src/components/ui/UnifiedTimeline.tsx` | Unified View: Section-Lane + Waveform + Playhead + Zoom |
| `frontend/src/components/ui/Waveform.tsx` | Canvas-Waveform (dimmed/undimmed) |
| `frontend/src/utils/buildTimeline.ts` | Gap-Berechnung (lueckenlose Timeline aus Sections + Dauer) |
| `frontend/src/hooks/useSections.ts` | Zustand Store + API-Logik |
| `frontend/src/stores/playerStore.ts` | `activeSection`, `setSectionLoop()` |
| `backend/api/sections.py` | CRUD Endpoints (Pro-Mitglied+ fuer Schreibzugriff) |
| `backend/models/section.py` | Section-Modell (dropbox_path, label, color, start/end_time, lyrics) |

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

### Mini-Player

Kompakte Wiedergabe-Steuerung auf allen Seiten sichtbar.

- Zeigt aktuellen Track-Namen und Zeit
- Play/Pause-Button
- Fortschrittsbalken
- Antippen oeffnet den vollen Player
- Ausgeblendet auf der Player-Seite
- Ausgeblendet wenn Aufnahme-Modal offen

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/layout/AppShell.tsx` | Mini-Player-UI |
| `frontend/src/stores/appStore.ts` | `modalOpen` Flag |

---

## Favoriten

Persoenliche Sammlung von Lieblings-Dateien pro User.

- Datei als Favorit markieren/entfernen (Herz-Icon)
- Im Browser und im Player moeglich
- Eigene Favoriten-Seite mit Liste aller markierten Dateien
- Pro User unabhaengig (jeder User hat eigene Favoriten)
- Label-Filter auch auf Favoriten-Seite verfuegbar

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/FavoritesPage.tsx` | Favoriten-Seite |
| `frontend/src/pages/BrowsePage.tsx` | Herz-Icon im Browser |
| `frontend/src/hooks/useFavorites.ts` | Zustand Store + API-Logik |
| `backend/api/favorites.py` | `GET /favorites`, `POST /favorites/toggle` |
| `backend/models/favorite.py` | Favoriten-Modell (user_id + dropbox_path) |

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

- Upload-Button (Upload-Icon) neben dem Aufnahme-Button im Datei-Browser
- Oeffnet den nativen Datei-Picker des Geraets
- iOS: nur Dateiendungen im `accept`-Attribut, damit direkt die Dateien-App oeffnet (statt Kamera/Fotomediathek)
- Android/Desktop: `audio/*` MIME-Type fuer nativen Audio-Filter im Picker
- Nach Dateiauswahl oeffnet sich das gleiche Benennungs-Modal wie bei Aufnahmen (Stimme, Abschnitt, Notiz)
- Unterstuetzte Formate: MP3, M4A, WebM, OGG, Opus, WAV, MP4
- Nicht-MP3-Dateien werden server-seitig automatisch zu MP3 konvertiert
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

- Alle User auflisten (Benutzername, Anzeigename, Rolle, Stimme, letzter Login)
- Rolle aendern per Dropdown (Gast, Mitglied, Pro-Mitglied, Chorleiter, Admin)
- User loeschen (eigenen Account nicht loeschbar)
- Neue User manuell anlegen

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/admin/UsersPage.tsx` | User-Verwaltungs-UI |
| `backend/api/admin.py` | `/admin/users` Endpoints |

### Registrierungscode

- Admin legt Registrierungscode fest
- Code wird bei Registrierung geprueft
- Aenderbar ueber Einstellungen-Seite

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SettingsPage.tsx` | Code-Sektion |
| `backend/api/admin.py` | `GET/PUT /admin/settings` |

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

### Dark/Light Theme

- Umschalten zwischen dunklem und hellem Design
- Wahl wird in `localStorage` gespeichert
- Umgesetzt ueber CSS Custom Properties (`--bg-primary`, `--text-primary`, etc.)
- Toggle auf der Einstellungen-Seite

### Einstellungen-Seite

Zentrale Seite fuer alle User- und Admin-Konfigurationen:
- Profil (Anzeigename, Stimme)
- Passwort aendern
- Theme-Toggle
- Dropbox-Status (nur Admin)
- Registrierungscode (nur Admin)
- Labels verwalten (ab Pro-Mitglied)
- Nutzer verwalten (nur Admin)
- Logout

---

## Navigation

### Bottom-Navigation

Drei Tabs auf allen Seiten (ausser Player):
- **Dateien** — Datei-Browser
- **Favoriten** — Favoriten-Liste
- **Einstellungen** — Profil und Admin

### Routing

| Pfad | Seite | Zugang |
|------|-------|--------|
| `/login` | Login | Oeffentlich |
| `/register` | Registrierung | Oeffentlich |
| `/browse` | Datei-Browser | Authentifiziert |
| `/favorites` | Favoriten | Authentifiziert |
| `/player` | Audio-Player | Authentifiziert |
| `/settings` | Einstellungen | Authentifiziert |
| `/sections` | Section-Editor | Pro-Mitglied+ |
| `/admin/users` | Nutzerverwaltung | Admin |
| `/admin/labels` | Label-Verwaltung | Pro-Mitglied+ |

HashRouter fuer Client-seitiges Routing (`/#/browse`, `/#/player`, etc.).

---

## API-Endpunkte

### Auth (`/api/auth`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| POST | `/login` | Login | Oeffentlich |
| POST | `/register` | Registrierung | Oeffentlich |
| POST | `/logout` | Logout | User |
| GET | `/me` | Eigenes Profil | User |
| PUT | `/me` | Profil aendern | User |
| PUT | `/me/password` | Passwort aendern | User |

### Dropbox (`/api/dropbox`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/status` | Verbindungsstatus | User |
| GET | `/authorize` | OAuth-URL holen | Admin |
| GET | `/callback` | OAuth-Callback | Oeffentlich |
| POST | `/disconnect` | Verbindung trennen | Admin |
| GET | `/browse` | Ordner auflisten | User |
| GET | `/search` | Dateien suchen | User |
| GET | `/stream` | Streaming-Link holen | User |
| POST | `/upload` | Aufnahme hochladen | User |
| DELETE | `/file` | Datei loeschen | Chorleiter+ |

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
| POST | `/` | Sektion erstellen | Pro-Mitglied+ |
| PUT | `/{id}` | Sektion bearbeiten (inkl. Lyrics) | Pro-Mitglied+ |
| PUT | `/lyrics` | Lyrics fuer mehrere Sektionen auf einmal speichern | Pro-Mitglied+ |
| DELETE | `/{id}` | Sektion loeschen (loescht zugehoerige Notizen) | Pro-Mitglied+ |

### Notizen (`/api/notes`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/?path=<dropbox_path>` | Eigene Notizen (Track + Sections) | User |
| PUT | `/` | Einzelne Notiz speichern/loeschen | Pro-Mitglied+ |
| PUT | `/bulk` | Mehrere Notizen auf einmal speichern | Pro-Mitglied+ |

### Admin (`/api/admin`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/users` | User auflisten | Admin |
| POST | `/users` | User anlegen | Admin |
| PUT | `/users/{id}` | User bearbeiten | Admin |
| DELETE | `/users/{id}` | User loeschen | Admin |
| GET | `/settings` | App-Settings lesen | Admin |
| PUT | `/settings` | App-Settings aendern | Admin |

---

## Datenmodelle

### User

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | UUID | Primaerschluessel |
| `username` | String (max 100) | Eindeutig |
| `display_name` | String (max 100) | Anzeigename |
| `role` | String | `guest`, `member`, `pro-member`, `chorleiter`, `admin` |
| `voice_part` | String | Sopran, Alt, Tenor oder Bass |
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

### SessionToken

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `token` | String (max 64) | Primaerschluessel, zufaellig generiert |
| `user_id` | UUID (FK) | Referenz auf User |
| `created_at` | DateTime | Erstellungszeitpunkt (Ablauf nach 7 Tagen) |

### AppSettings (Singleton)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Immer 1 |
| `registration_code` | String | Registrierungscode |
| `dropbox_refresh_token` | String | OAuth Refresh Token |
| `dropbox_account_id` | String | Dropbox Account ID |
| `dropbox_account_email` | String | Dropbox Account E-Mail |
| `dropbox_connected_at` | DateTime | Verbindungszeitpunkt |
| `dropbox_root_folder` | String | Optionaler Root-Ordner |
| `updated_at` | DateTime | Letzte Aenderung |
