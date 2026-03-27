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
- Token-basierte Session (7 Tage gueltig)
- Rate-Limiting: max. 5 fehlgeschlagene Versuche pro Minute pro IP
- Letzter Login-Zeitpunkt wird gespeichert
- Token in `localStorage` persistiert

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/LoginPage.tsx` | Login-UI |
| `frontend/src/stores/authStore.ts` | Token- und User-State |
| `backend/api/auth.py` | `POST /auth/login` |

### Profil bearbeiten

- Anzeigename aendern
- Stimme wechseln (Sopran/Alt/Tenor/Bass)
- Passwort aendern (altes Passwort muss bestaetigt werden, neues min. 4 Zeichen)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/SettingsPage.tsx` | Profil-Sektion |
| `backend/api/auth.py` | `PUT /auth/me`, `PUT /auth/me/password` |

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
| `files.content.write` | Aufnahmen hochladen |

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

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Browser-UI |
| `frontend/src/stores/appStore.ts` | `browsePath` State |
| `backend/api/dropbox.py` | `GET /dropbox/browse` |
| `backend/services/dropbox_service.py` | `list_folder()` mit Paginierung |

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

Admin-definierte Labels zum Kategorisieren von Dateien.

- Admin erstellt Labels mit Name, Farbe (Hex) und optionaler Kategorie
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
- Oeffnet den nativen Datei-Picker des Geraets (`<input type="file" accept="audio/*">`)
- Nach Dateiauswahl oeffnet sich das gleiche Benennungs-Modal wie bei Aufnahmen (Stimme, Abschnitt, Notiz)
- Unterstuetzte Formate: MP3, M4A, WebM, OGG, Opus, WAV, MP4
- Nicht-MP3-Dateien werden server-seitig automatisch zu MP3 konvertiert
- Maximale Dateigroesse: 20 MB

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Upload-Button + verstecktes File-Input |
| `frontend/src/components/ui/RecordingModal.tsx` | Geteiltes Modal (Aufnahme + Import) |
| `backend/api/dropbox.py` | `POST /dropbox/upload` (Validierung + Konvertierung) |

---

## Admin-Funktionen

### Nutzerverwaltung

- Alle User auflisten (Benutzername, Anzeigename, Rolle, Stimme, letzter Login)
- Rolle umschalten (Admin/Mitglied)
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
- Navigation zu Admin-Seiten (nur Admin)
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
| `/admin/users` | Nutzerverwaltung | Admin |
| `/admin/labels` | Label-Verwaltung | Admin |

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

### Favoriten (`/api/favorites`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/` | Favoriten auflisten | User |
| POST | `/toggle` | Favorit umschalten | User |

### Labels (`/api/labels`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/` | Labels auflisten | User |
| POST | `/` | Label erstellen | Admin |
| PUT | `/{id}` | Label bearbeiten | Admin |
| DELETE | `/{id}` | Label loeschen | Admin |
| GET | `/my` | Eigene Zuweisungen | User |
| POST | `/my/toggle` | Zuweisung umschalten | User |

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
| `role` | String | `"admin"` oder `"guest"` |
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
