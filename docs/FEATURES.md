# ChoirBox — Feature-Spezifikation

## Ueberblick

ChoirBox ist eine Smartphone-optimierte Web-App fuer Chormitglieder. Kernfunktionen: Audio-Dateien aus einer geteilten Dropbox durchsuchen, abspielen, mit Labels organisieren, und eigene Uebungs-Aufnahmen hochladen. Eine Instanz kann mehrere unabhaengige Choere verwalten.

---

## Authentifizierung & Benutzerverwaltung

### Registrierung

Chormitglieder registrieren sich ueber einen Einladungslink, der den Chor identifiziert.

- Einladungslink-Format: `/#/join/<invite_code>` — identifiziert den Chor automatisch
- Pflichtfelder: Benutzername, Anzeigename, Passwort, Stimme (dynamisch aus Stimme-Labels des Chors)
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
- Stimme wechseln (dynamisch aus Stimme-Labels des Chors)
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

| Rolle         | Level | Beschreibung                                                                  |
| ------------- | ----- | ----------------------------------------------------------------------------- |
| `guest`       | 0     | Registriert, eingeschraenkt                                                   |
| `member`      | 1     | Standard-Chormitglied (Browsen, Streamen, Upload, Favoriten)                  |
| `pro-member`  | 2     | Kann Labels und Sections verwalten                                            |
| `chorleiter`  | 3     | Erweiterte Verwaltungsrechte                                                  |
| `admin`       | 4     | Voller Zugriff (Nutzer, Einladungslink, Settings) innerhalb des eigenen Chors |
| `beta-tester` | 5     | Beta-Features (z.B. Section-Editor)                                           |
| `developer`   | 6     | Instanz-Verwaltung: Choere erstellen/wechseln, Dropbox OAuth                  |

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

| Element                       | beta-tester (5) | admin (4) | chorleiter (3) | pro-member (2) | member (1) | guest (0) |
| ----------------------------- | :-------------: | :-------: | :------------: | :------------: | :--------: | :-------: |
| **BrowsePage**                |                 |           |                |                |            |           |
| Browse, Play, Stream          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Favoriten (Herz)              |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Filter (Labels)               |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Suche                         |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Label zuweisen (Tag)          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Aufnehmen (Mic-Icon)          |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Kebab-Menue (⋮)               |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| ↳ Datei hochladen             |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| ↳ Ordner erstellen            |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Datei-Einstellungen (Info)    |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Datei loeschen                |        ✓        |     ✓     |       ✓        |       —        |     —      |     —     |
| Umbenennen (Stift)            |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Ordner loeschen               |        ✓        |     ✓     |       ✓        |       —        |     —      |     —     |
| **GlobalPlayer**              |                 |           |                |                |            |           |
| Wiedergabe + Voice Bricks     |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Viewer-Button                 |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| **ViewerPage**                |                 |           |                |                |            |           |
| Dokument anzeigen             |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| PDF hochladen/loeschen        |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Notizen/Lyrics bearbeiten     |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Section-Editor                |        ✓        |     —     |       —        |       —        |     —      |     —     |
| **Chord Sheets (.cho)**       |                 |           |                |                |            |           |
| Chord Sheets ansehen          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Transposition (auto-save)     |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Annotationen (Stift)          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Chordsheet einfuegen (Paste)  |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| .cho-Datei hochladen          |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Chord Sheet loeschen          |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| **SettingsPage**              |                 |           |                |                |            |           |
| Profil, Passwort, Theme, Zoom |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Labels verwalten              |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Sektionsvorlagen              |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Nutzer verwalten              |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Einladungslink + Copy         |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Chor-Ordner                   |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Dropbox Re-Sync               |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Dropbox-Verbindung            |        —        |     —     |       —        |       —        |     —      |     —     |
| Choere verwalten              |        —        |     —     |       —        |       —        |     —      |     —     |
| **FileSettingsPage**          |                 |           |                |                |            |           |
| Anzeigen (read-only)          |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Bearbeiten + Speichern        |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |

*Developer (6) hat alle Rechte + Dropbox-Verbindung, Choere verwalten, Chor-Wechsel.*
*Bug-Reporting (Edge Tab): Unabhaengig von der Rolle — per `can_report_bugs`-Flag vom Developer individuell vergeben.*

### Logout

- Token wird im Backend invalidiert
- `localStorage` geleert
- Redirect zur Login-Seite

---

## Dropbox-Integration

### Verbindung (nur Developer)

Ein Developer verbindet ChoirBox einmalig mit einem Dropbox-Account. Alle Choere teilen diesen Zugang, jeder Chor hat seinen eigenen Unterordner (`Choir.dropbox_root_folder`) direkt im Dropbox-App-Ordner.

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

### Ordnertyp-System

Song-Ordner tragen eine `.song`-Endung. Innerhalb von Songs gibt es reservierte Unterordner mit festem Namen:

| Typ | Erkennung | Beschreibung | Icon |
|-----|-----------|-------------|------|
| Song | `.song`-Endung | Musikstueck-Ordner (z.B. "Fragile.song") | Music-Note |
| Texte | Name `Texte` | Dokumente (PDF, Video, TXT) | FileText |
| Audio | Name `Audio` | Audio-Dateien (MP3, WebM, M4A) | Lautsprecher |
| Videos | Name `Videos` | Video-Dateien (MP4, MOV) | Video |
| Multitrack | Name `Multitrack` | Stems fuer spaeteren Multitrack-Player | Layers |
| Container | *(keine Endung)* | Normaler navigierbarer Ordner | Ordner |

**Hierarchie-Beispiel:**
```
Konzert im Juni/           (Container)
  Fragile.song/            (Song)
    Texte/                 (reserviert, ausgeblendet → synthetischer Eintrag)
    Audio/                 (reserviert, ausgeblendet → synthetischer Eintrag)
    Videos/                (reserviert, ausgeblendet)
    Multitrack/            (reserviert, ausgeblendet)
```

**Regeln:**
- `.song`-Endung wird in der Anzeige gestripped: "Fragile.song" → "Fragile"
- Reservierte Ordner (Texte, Audio, Videos, Multitrack) sind in der Browse-Ansicht ausgeblendet und werden als synthetische Eintraege mit Datei-Counts dargestellt. Leere reservierte Ordner werden komplett ausgeblendet. Dateianzahl: "X Dokument(e)" fuer Texte, "X Datei(en)" fuer Audio/Videos/Multitrack
- Innerhalb von `.song`-Ordnern: unbekannte Unterordner werden ausgeblendet
- Reservierte Namen koennen nicht als manuelle Ordnernamen verwendet werden (blockiert beim Erstellen)
- Player und DocViewer erkennen reservierte Ordner und leiten Song-Name aus `.song`-Parent ab
- Folder-Type-Registry mit `admin_only`-Flag vorbereitet (erweiterbar)

| Datei | Rolle |
|-------|-------|
| `backend/services/folder_types.py` | Folder-Type-Registry (Typen, Parsing, Sichtbarkeit) |
| `frontend/src/utils/folderTypes.ts` | Frontend-Utilities (stripFolderExtension, getFolderType) |

### Ordner-Navigation

- Dropbox-Ordnerstruktur hierarchisch durchsuchbar
- Header zeigt den Chor-Namen prominent statt "Dateien"
- Breadcrumb-Navigation mit Chor-Name als Root und klickbaren Pfadteilen (Endungen gestripped). Innerhalb von `.song`-Ordnern: Zurueck-Button zum Elternordner.
- **Song Card Header** innerhalb von `.song`-Ordnern: Zeigt Song-Name + Subfolder-Badges (gleiche Badges wie in der Browse-Liste). Aktiver Subfolder wird mit Label-Text + farbigem Unterstrich hervorgehoben. Inaktive Badges zeigen nur Icon + Anzahl und sind klickbar zum Wechseln. Konsistente Darstellung bei 1 oder mehreren Subfoldern.
- Zeigt Ordner und Audio-Dateien (MP3, WebM, M4A)
- Sortierung: Container-Ordner zuerst, dann typisierte Ordner (Song, Texte, Audio), dann Dateien
- **Card-Layout**: Alle Dateien und .song-Ordner werden als Cards mit Rahmen und Abstand dargestellt
- **File-Type-Badge**: Jede Datei zeigt ein gerahmtes Badge mit Kategorie-Icon (Volume2/FileText/Video) und Dateiendung als Text (z.B. MP3, PDF, MP4). Farbe richtet sich nach Dateityp (Audio=Cyan, Text=Accent, Video=Pink). Files in Multitrack- oder Videos-Ordnern uebernehmen die jeweilige Ordner-Farbe fuer konsistente UX. Ordner-Icons werden ohne Rahmen angezeigt. Ausgewaehlte Texte werden mit einem gruenen Haken vor dem Badge markiert.
- **Einheitliches Meta-System** fuer alle Dateitypen (Audio, Video, PDF, TXT):
  - **Titel**: Songname (aus .song-Ordner abgeleitet). Voice-Prefix, Sections und Songname werden nicht im Titel wiederholt.
  - **Zeile 1:** Dauer + Stimmen/Instrumente als farbige Tags mit Dot. Quellen: Backend-Parsing + zugewiesene Stimme-Labels (gemerged)
  - **Zeile 2:** Abschnitte als Accent-Badges (aus SectionPresets dynamisch)
  - **Zeile 3:** Persoenliche Labels als Outline-Badges (farbiger Rand + Text, kein Hintergrund). Nur Nicht-Stimme-Labels. Nicht sichtbar innerhalb von `.song`-Ordnern
  - **Zeile 4:** Kommentar (kursiv) — alles aus dem Dateinamen was nicht Voice, Songname oder Section ist
- **Backend Filename-Parsing**: Metadaten (voice_keys, section_keys, song_name, free_text) werden im Backend geparst und in `audio_meta`-Tabelle gecacht. Lazy Parsing beim Browse, Batch-Parsing beim Re-Sync. Invalidierung bei Label/Preset-Aenderungen.
- **.song Ordner bekommen zusaetzlich:**
  - **Brick-Zeile:** Klickbare Bricks mit farbigem Rand fuer Schnellzugriff auf Unterordner (Audio=Cyan, Videos=Pink, Multitrack=Amber, Texte=Indigo). Bricks zeigen Icon + Dateianzahl. Gruener Text-Viewer-Button (FileText-Icon) ganz links oeffnet den ausgewaehlten Text direkt im DocViewer. Inaktiv/gedimmt wenn kein Text ausgewaehlt.
  - **Labels:** Persoenliche Labels (Schwierig, Ueben etc.) per Swipe zuweisbar
- Leere Meta-Zeilen werden nicht gerendert (adaptive Hoehe)
- Stimmen/Instrumente und Abschnitte werden dynamisch aus Labels- und SectionPresets-Store geladen
- Skeleton-Loading im Card-Stil beim Laden eines Ordners

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Browser-UI |
| `frontend/src/components/ui/SkeletonList.tsx` | Animierte Lade-Platzhalter |
| `frontend/src/hooks/useLabels.ts` | Voice-Labels (Farben, Shortcodes) |
| `frontend/src/hooks/useSectionPresets.ts` | Section-Presets (Shortcodes, max_num) |
| `frontend/src/stores/appStore.ts` | `browsePath` State |
| `backend/api/dropbox.py` | `GET /dropbox/browse` (mit folder_type, display_name) |
| `backend/services/dropbox_service.py` | `list_folder()` mit Paginierung |
| `backend/models/audio_duration.py` | Dauer-Cache (SQLModel) |
| `backend/services/audio_duration_service.py` | Dauer speichern/abfragen |

### Datei-Aktionen (Swipe & Drei-Punkte-Menue)

Dateien und Ordner haben rechts ein Drei-Punkte-Menue (EllipsisVertical). Ein Tap darauf oder Swipe nach links enthuellt die Aktions-Buttons.
**Innerhalb von `.song`-Ordnern** entfaellt der Label-Button (Tag) — Labels koennen dort nicht zugewiesen werden.

**Dateien:**
- **Favorit** (Herz): Datei als Favorit markieren/entfernen
- **Label** (Tag): Label-Picker-Overlay oeffnen, Labels zuweisen/entfernen (nicht innerhalb von `.song`-Ordnern)
- **Datei-Einstellungen** (Info): Oeffnet die Datei-Einstellungen-Seite fuer diese Datei (nur pro-member+)
- **Loeschen** (Papierkorb): Ab Chorleiter (Level 3+) sichtbar. Bestaetigungsdialog vor dem Loeschen.
- **Umbenennen** (Stift): Ab Pro-Mitglied (Level 2+). Dialog mit vorausgefuelltem Namen.

**Ordner:**
- **Favorit** (Herz): Ordner als Favorit markieren/entfernen
- **Umbenennen** (Stift): Ab Pro-Mitglied (Level 2+). Dialog mit vorausgefuelltem Namen.
- **Loeschen** (Papierkorb): Ab Chorleiter (Level 3+). `.song`-Ordner werden samt Inhalt in einen `Trash`-Ordner im Chor-Root verschoben (Papierkorb). Normale Ordner muessen leer sein fuer permanentes Loeschen.

**Aufnahme-Button (Mic-Icon im Header):**
- Ab Pro-Mitglied sichtbar. Oeffnet den Floating Recorder.
- Innerhalb von `.song`-Ordnern: Song-Modus. Auf Chor-Ebene: Root-Modus (erstellt neuen `.song`-Ordner).

**Kebab-Menue (Drei-Punkte im Header):**
- Ab Pro-Mitglied sichtbar. Enthaelt: Datei hochladen, Ordner erstellen (Admin).
- Member sehen kein Kebab-Menue (nur Favoriten, Filter, Suche, Settings im Header).

- Tippen auf ein anderes Element oder erneutes Tippen auf die drei Punkte schliesst das Menue
- Einfach-Tap auf eine Datei oeffnet direkt den Player (kein Doppelklick noetig)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Swipe-UI, Drei-Punkte-Button, Kebab-Menue, Dialoge |
| `backend/api/dropbox.py` | `DELETE /dropbox/file`, `POST/DELETE /dropbox/folder`, `POST /dropbox/rename` |
| `backend/services/dropbox_service.py` | `delete_file()`, `create_folder()`, `move_file()`, `move_to_trash()` |

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

## Caching & Sync

### Backend Dropbox-Cache

In-Memory TTL-Cache (5 Minuten) fuer Dropbox `list_folder`-Ergebnisse. Beim Browsen wird ein **rekursives Listing** (`recursive=true`) genutzt, das in einem einzigen API-Call die gesamte Unterordner-Struktur laedt und den Cache fuer alle Sub-Ordner vorwaermt. Dadurch sind Folge-Navigationen in Song-Ordner instant (Cache-Hit statt API-Call).

- Cache-Key: Dropbox-Pfad (case-insensitive)
- **Rekursives Listing** beim Browse: 1 API-Call statt N+1 (bei 50 Songs vorher ~200 Calls)
- **Negative Caching**: Nicht-existierende Ordner werden als leer gecacht (kein wiederholtes Abfragen)
- Automatische Invalidierung bei Mutations (Upload, Delete, Rename, Folder-Create) inkl. aller Sub-Pfade (`invalidate_subtree`)
- `?refresh=true` Parameter umgeht den Cache
- Max 1000 gecachte Pfade (LRU-Eviction)

### Frontend Browse-Cache (Stale-While-Revalidate)

Zustand-Store cached Browse-Ergebnisse pro Pfad. Ermoeglicht sofortige Zurueck-Navigation ohne Loading-Skeleton.

- **Frischer Cache (< 5 Min):** Daten sofort anzeigen, kein API-Call
- **Staler Cache (> 5 Min):** Daten sofort anzeigen, im Hintergrund neu fetchen
- **Kein Cache:** Loading-Skeleton, API-Call
- **Request-Deduplication:** Doppelte Requests fuer denselben Pfad werden zusammengefuehrt
- Max 50 gecachte Pfade (LRU-Eviction)

### Optimistic Updates

Favorites und Labels werden sofort im lokalen State aktualisiert, der API-Call laeuft im Hintergrund. Bei Server-Fehler: automatischer Rollback via Full-Reload.

### Reload-Button

RefreshCw-Button in der BrowsePage-Toolbar. Erzwingt frischen Fetch von Dropbox (umgeht beide Caches). Vorherige Daten bleiben sichtbar waehrend des Reloads (kein Skeleton). Dreh-Animation waehrend des Ladens.

### Auto-Sync

- **Page Visibility API:** Beim Zurueckkommen in den Vordergrund werden Labels, Favorites und der aktuelle Ordner im Hintergrund neu geladen
- **Periodischer Refresh:** Alle 2 Minuten wird der aktuelle Ordner im Hintergrund aktualisiert (nur wenn Tab sichtbar)

| Datei | Rolle |
|-------|-------|
| `backend/services/dropbox_cache.py` | In-Memory TTL-Cache (Singleton) |
| `backend/services/dropbox_service.py` | `list_folder()` + `list_folder_recursive()` mit Cache-Integration |
| `frontend/src/stores/browseStore.ts` | Frontend Browse-Cache (Stale-While-Revalidate) |
| `frontend/src/hooks/useFavorites.ts` | Optimistic Toggle |
| `frontend/src/hooks/useLabels.ts` | Optimistic Toggle |
| `frontend/src/components/layout/AppShell.tsx` | Page Visibility Listener |
| `frontend/src/pages/BrowsePage.tsx` | Reload-Button, periodischer Refresh |

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
| Video (`.mp4`) | `.mp4` | Dropbox Hauptordner (beim Upload via ffmpeg komprimiert) | Video-Modal in Browse-Seite |
| Video (Dokument) | `.webm`, `.mov` | Dropbox `Videos`-Ordner | HTML5 Video-Player im Texte-Viewer |
| Text | `.txt` | Nur Dropbox | Monospace-Textansicht |

### Video-Komprimierung beim Upload

Videos werden beim Upload automatisch server-seitig per ffmpeg re-encodiert:

- **Codec**: H.264 + AAC — universelle Browser-Kompatibilitaet
- **Qualitaet**: CRF 28 (reduzierte Qualitaet, fuer Handy-Wiedergabe ausreichend)
- **Aufloesung**: Max. 720p (Hoehe), Seitenverhaeltnis bleibt erhalten
- **Streaming**: `movflags +faststart` — Moov-Atom am Dateianfang ermoeglicht sofortiges Streaming ohne vollstaendigen Download
- **Ausgabeformat**: Immer `.mp4`, unabhaengig vom Eingabeformat (.webm, .mov)
- **Groessenlimit**: Max. 150 MB Rohdatei beim Upload
- **Fallback**: Ohne ffmpeg auf dem Server wird die Datei unverarbeitet hochgeladen

### Text-Auswahl fuer den Viewer

Jeder User kann pro Song **einen** Text fuer den Viewer auswaehlen (persistent in DB).

- **Texte-Ordner** ist ein normaler, navigierbarer Ordner — alle User koennen ihn betreten
- **Text-Viewer-Button** bei `.song`-Eintraegen: Gruenes FileText-Icon in der Brick-Zeile oeffnet den ausgewaehlten Text direkt im DocViewer. Inaktiv wenn kein Text ausgewaehlt.
- **0 Texte**: Texte-Ordner und Text-Viewer-Button werden nicht angezeigt
- **1 Text**: Beim Upload automatisch ausgewaehlt (persistent). Kann per Swipe-Action abgewaehlt werden (z.B. bei nicht-musikbezogenen Texten wie Anweisungen, Aufstellung etc.)
- **2+ Texte**: Texte-Ordner als navigierbarer Ordner, Text-Viewer-Button aktiv wenn ein Text ausgewaehlt
- **Auswahl im Texte-Ordner**: Swipe-Action (Haken-Icon) auf Dokumenten als Toggle — grau = nicht ausgewaehlt, gruen = ausgewaehlt. Funktioniert auch bei nur einem Dokument
- **Visueller Indikator**: Gruenes FileText-Icon hinter dem Dateinamen des ausgewaehlten Texts im Texte-Ordner
- **Viewer**: Zeigt den ausgewaehlten Text. Ohne Auswahl: Hinweis "Kein Dokument ausgewaehlt"
- **Text-Auswahl im Player**: FileText-Icon links im Global Player oeffnet ein Popup-Menu mit allen Texten des Songs. Klick auf einen Text waehlt ihn aus (persistent) und oeffnet den Viewer. Erneuter Klick im Viewer schliesst ihn und waehlt den Text ab. Button nur sichtbar wenn Texte vorhanden, aktiv (gruen) nur wenn Viewer offen.

### Viewer-Seite

- Route: `/#/viewer` — zeigt das ausgewaehlte Dokument des aktuellen Songs
- Erreichbar ueber den Viewer-Button (FileText-Icon) im Global Player
- Leitet Song-Ordner automatisch aus dem aktuellen Track-Pfad ab (geht ueber reservierte Ordner wie Audio/ hinauf)
- Funktionalitaet: Annotationen, Fullscreen inkl. Topbar-Hide
- Fullscreen-Reset beim Verlassen der Seite
- Aufnahme-Button in der Topbar (ab Pro-Mitglied) — oeffnet Floating Recorder fuer den aktuellen Song

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/ViewerPage.tsx` | Viewer-UI (Dokument-Anzeige) |

### Standalone Dokument-Viewer

- Route: `/#/doc-viewer?folder=<path>&name=<name>`
- Erreichbar durch Klick auf ein Dokument in der Browse-Seite
- Funktionalitaet: Annotationen, Fullscreen inkl. Topbar-Hide
- Upload-Funktion fuer pro-member+
- Fullscreen-Reset beim Verlassen der Seite

### Dokumente in der Browse-Seite

- Dokumente erscheinen als eigene Eintraege innerhalb von `Texte`-Ordnern
- Typ-spezifische Icons (PDF, Video, Text)
- Swipe-Actions: Favorisieren, Fuer Player auswaehlen (im Texte-Ordner)
- Upload: Dateien hochladen ueber Kebab-Menue (akzeptiert Audio + Dokument-Formate)

### Dropbox-Sync

Beim Laden eines Ordners synchronisiert das Backend automatisch:
- **Neue Datei in Dropbox** → wird in der DB registriert (inkl. `dropbox_path`)
- **Datei geaendert** (Dropbox `content_hash` weicht ab) → DB-Eintrag wird aktualisiert, Caches invalidiert
- **Datei geloescht in Dropbox** → wird aus der DB entfernt

Der relative Dropbox-Pfad (`dropbox_path`) wird direkt im Document-Model gespeichert. Damit entfaellt die fehleranfaellige Pfad-Rekonstruktion aus `folder_path + /Texte/ + name`.

### Admin Re-Sync (Dropbox ↔ DB)

Vollstaendiger Abgleich aller DB-Records gegen den Dropbox-Inhalt des Chors. Admin-only ueber Settings → Wartung → "Dropbox Re-Sync".

- Rekursives Listing des gesamten Chor-Dropbox-Ordners
- **Dokumente**: Sync aller Texte-Subordner (neu, geaendert, geloescht)
- **Verwaiste Records bereinigen**: AudioDurations, Favoriten, Labels, Notizen, Sektionen fuer Dateien/Ordner die in Dropbox nicht mehr existieren
- Ergebnis-Anzeige: Anzahl synchronisierter Ordner + Aenderungen

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

## Handschriftliche Annotationen (PDFs und Chord Sheets)

Chormitglieder koennen auf PDF-Seiten und Chord Sheets handschriftliche Markierungen machen — z.B. Atemzeichen, Dynamik, Einsaetze. Jeder User sieht nur seine eigenen Annotationen.

Auf Chord Sheets (`.cho`) wird `page=1` als virtuelle Seite verwendet (ein Chord Sheet ist eine durchgehende Scroll-Flaeche). Der SVG-Overlay passt sich per ResizeObserver an die tatsaechliche Inhaltshoehe an, sodass Strokes auch nach Aenderungen der Schriftgroesse oder Transposition korrekt ausgerichtet bleiben.

- **Zeichenmodus-Toggle**: Floating Action Button (Stift-Icon) unten-links auf dem PDF-Panel. Wird blau wenn aktiv
- **Zeichenwerkzeuge**: Stift, Textmarker (halbtransparent, 3x breiter), Radierer (Distanz-basierter Hit-Test)
- **6 Farben**: Rot, Blau, Gruen, Gelb, Lila, Schwarz
- **3 Strichbreiten**: Fein (2), Mittel (4), Dick (8)
- **Undo**: Letzter Strich rueckgaengig machen
- **Seite loeschen**: Alle Annotationen einer Seite entfernen
- **Pinch-to-Zoom im Zeichenmodus**: Zwei-Finger-Geste zoomt auch bei aktivem Zeichenmodus. Multi-Touch-Erkennung verwirft angefangene Striche und leitet Pinch an den Zoom-Handler weiter
- **Technologie**: SVG-Overlay auf `<img>`-Seiten + `perfect-freehand`. Koordinaten normalisiert (ViewBox 0-1000)
- **Auto-Save**: 500ms Debounce → `PUT /api/annotations`. Flush bei Seitenwechsel und `beforeunload`
- **Speicherung**: Strokes als JSON in SQLite, pro User + Document-ID + Seitennummer (unique constraint)
- **Berechtigung**: Lesen fuer alle, Schreiben ab Rolle `member`

### Fullscreen-Modus (PDF + TXT)

- **FAB** rechts unten: Maximize/Minimize, Progress-Ring im Fullscreen
- **Auto-Fade**: Alle FABs faden nach 3s Inaktivitaet. Beruehrung stellt Sichtbarkeit her
- **Echtes Fullscreen**: Panel wird `position: fixed` ueber das gesamte Display gelegt — Topbar, Toolbar, PlayerBar und Tabs verschwinden komplett. Nur FABs schweben ueber dem Inhalt. Safe-Area-Insets fuer Notch-Geraete
- **Audio laeuft weiter** — nur UI-Elemente werden versteckt
- **Reset** bei Panel-Wechsel oder Navigation weg vom Player/DocViewer
- **TXT Schriftgroesse**: Im Fullscreen erscheinen +/- Buttons (rechts ueber Fullscreen-FAB) zum Zoomen der Schrift (7 Stufen, 12px–32px). Text bricht bei jeder Groesse sauber um

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/DocumentPanel.tsx` | Einzeldokument-Viewer (Player- und DocViewer-Modus) |
| `frontend/src/components/ui/AnnotatedPage.tsx` | `<img>` + SVG-Overlay pro Seite |
| `frontend/src/components/ui/AnnotationToolbar.tsx` | Werkzeugleiste: Stift, Textmarker, Radierer |
| `frontend/src/components/ui/VideoViewer.tsx` | HTML5 Video-Player im Texte-Viewer (Dokumente) |
| `frontend/src/components/ui/VideoModal.tsx` | Video-Modal fuer .mp4 Dateien in der Browse-Seite |
| `frontend/src/components/ui/TextViewer.tsx` | Monospace-Textansicht |
| `frontend/src/hooks/useDocuments.ts` | Zustand Store (load/upload/remove) |
| `frontend/src/hooks/useSelectedDocument.ts` | Zustand Store: Text-Auswahl fuer Player (select/deselect/load) |
| `frontend/src/hooks/useAnnotations.ts` | Zustand Store: drawingMode, tool, strokes, API-Calls |
| `frontend/src/pages/DocViewerPage.tsx` | Standalone Dokument-Viewer Route |
| `backend/api/documents.py` | `/api/documents` Endpoints |
| `backend/services/document_service.py` | Stream-Rendering, RAM-Cache, Sync |
| `backend/services/video_service.py` | Video-Komprimierung via ffmpeg (Upload-Pipeline) |
| `backend/models/document.py` | Document-Modell (folder_path, file_type, content_hash) |
| `backend/models/user_selected_document.py` | Ausgewaehlter Text pro User pro Song |
| `deploy_pdfs.sh` | PDF-Dateien + DB-Eintraege auf Prod deployen |

---

## Chord Sheets (.cho)

### Übersicht

Chord Sheets sind transponierbare Akkord-Texte. Sie liegen als `.cho`-Dateien im **ChordPro-Format** im `Texte/`-Ordner — genau wie `.txt`-Songtexte. Es gibt keinen separaten Player und keinen separaten Storage-Ordner: ein `.cho` ist ein Dokument-Typ wie PDF, TXT oder Video, mit zusaetzlichen Funktionen (Transponieren, Akkord-Rendering).

### Eingabe-Wege

Drei Wege fuehren zu einer `.cho`-Datei:

1. **"Chordsheet einfuegen"** (Upload-Auswahl-Modal) — Akkord-Text aus Zwischenablage einfuegen
2. **"Datei auswaehlen"** + `.cho`-Datei — direkter Upload einer ChordPro-Datei
3. **Format-Detection** beim Paste: erkennt automatisch, ob der Input bereits ChordPro ist oder im "Akkord-Zeile ueber Lyrics"-Stil (Ultimate Guitar)

### Format-Auto-Detection

Beim Speichern wird der Input-Text analysiert:

- **ChordPro erkannt** (z.B. enthaelt `{title:}`, `{start_of_verse}` oder inline `[Chord]Lyrics`-Brackets) → 1:1 als ChordPro gespeichert
- **Plain "Akkord-Zeile ueber Lyrics"** (Ultimate Guitar Stil) → automatisch konvertiert zu ChordPro mit Direktiven (`{title:}`, `{key:}`, `{start_of_verse}`) und inline `[Chord]`-Brackets, dann gespeichert

So liegt die Datei immer im standardisierten ChordPro-Format auf der Disk und kann von externen Tools (OnSong, ChordPro Editor, Songbook-Apps) gelesen werden.

### Chord Sheet Viewer (im DocumentPanel)

- `.cho`-Dateien oeffnen sich im selben DocumentPanel wie PDFs/TXTs/Videos — kein eigener Player
- Beim Oeffnen wird der ChordPro-Text geparst und in die kanonische `ParsedChordContent`-Struktur konvertiert
- Akkorde werden ueber den Textzeilen in Monospace-Font positioniert (spaltentreu)
- Sektions-Header (`[Verse]`, `[Chorus]`, etc.) farblich abgesetzt
- Liest BEIDE Formate transparent: ChordPro UND Plain (Backwards-Compat)

### Transposition (Auto-Save)

- Stepper-Element schwebend oben rechts: `[− <wert> +]`
- Range: −12 bis +12 Halbtoene
- **Optimistic UI**: Klick wirkt sofort, ohne Server-Wartezeit
- **Debounced Save**: ~400 ms nach letztem Klick wird die Praeferenz im Backend gespeichert
- Per User pro Datei (z.B. Gitarrist in C, Keyboarder in Eb)
- Nach Reload wird die gespeicherte Tonart wieder geladen und angewendet
- Sharp/Flat-Praeferenz wird aus den Original-Akkorden abgeleitet

### Annotationen

- `.cho`-Dateien unterstuetzen handschriftliche Annotationen wie PDFs
- Stift-FAB unten links toggelt den Drawing-Mode
- AnnotationToolbar oben (Stift/Highlighter/Radierer, 6 Farben, 3 Strichbreiten, Undo, Trash)
- SVG-Overlay mit dynamischem viewBox (ResizeObserver passt sich der Content-Hoehe an)
- Strokes scrollen mit dem Inhalt
- Persistenz ueber den bestehenden Annotation-Endpoint (`page=1` fuer das ganze Sheet)

### Upload-Auswahl-Modal

Ein zentrales Modal hinter dem `+`-Button im Song-Folder bietet drei Optionen:

1. **Text einfuegen** — Songtext aus Zwischenablage → erstellt `.txt` in `/Texte`
2. **Chordsheet einfuegen** — Akkord-Text aus Zwischenablage → erstellt `.cho` in `/Texte` (mit Format-Auto-Detection)
3. **Datei auswaehlen** — Datei-Picker fuer Audio, PDF, TXT, CHO

Das Modal nutzt das bestehende `<Modal>`-Component-System.

### Speicherung & Architektur

- `.cho`-Dateien sind **gewoehnliche Documents** (`file_type="cho"`) im `Texte/`-Ordner
- Kein eigener `Chordsheets/`-Ordner mehr (alter PDF-Flow wurde entfernt)
- Kein DB-Cache fuer parsed_content — die Datei selbst ist Source of Truth, geparst wird beim Anzeigen on-the-fly (Millisekunden, da kein PDF-Parsing mehr noetig ist)
- Per-User-Transposition: `UserChordPreference` Tabelle mit FK auf `documents.id` (vorher: FK auf `chord_sheets.id`)
- Max. Dateigroesse: 2 MB (gleich wie `.txt`)

### Berechtigungen

| Aktion | Mindest-Rolle |
|--------|---------------|
| Chord Sheets ansehen | member |
| Transposition (auto-save) | member |
| Annotationen | member |
| Chordsheet einfuegen / Datei hochladen | pro-member |
| Chord Sheet loeschen | pro-member |

### Dateien

| Datei | Beschreibung |
|-------|-------------|
| `backend/models/user_chord_preference.py` | Per-User-Transposition (FK auf `documents.id`) |
| `backend/api/documents.py` | Endpoints `/documents/paste-text` und `/documents/{id}/chord-preference` |
| `backend/services/document_service.py` | `.cho` als DOCUMENT_EXTENSION registriert |
| `frontend/src/utils/chordPro.ts` | ChordPro-Parser, Plain→ChordPro-Serializer, Format-Detection, unified `parseChordSheet()` |
| `frontend/src/utils/chordParser.ts` | Plain (Ultimate Guitar) Parser — von chordPro.ts referenziert |
| `frontend/src/utils/chordTransposer.ts` | Frontend-Transpositionslogik |
| `frontend/src/components/ui/ChordSheetViewer.tsx` | Reine Renderkomponente fuer `ParsedChordContent` |
| `frontend/src/components/ui/ChordSheetTextViewer.tsx` | Laedt `.cho`, parst, rendert via ChordSheetViewer + Annotation-Layer |
| `frontend/src/components/ui/DocumentPanel.tsx` | Erweitert um `.cho`-Branch + Transpose-Stepper |
| `frontend/src/components/ui/UploadChoiceModal.tsx` | Auswahl-Modal hinter dem `+`-Button |
| `frontend/src/components/ui/PasteTextModal.tsx` | Vereinheitlichtes Paste-Modal fuer `.txt` und `.cho` |
| `frontend/src/hooks/useChordPreference.ts` | Hook mit Optimistic UI + Debounced Auto-Save |

---

## Audio-Player

### Floating Global Player

Der Audio-Player ist ein schwebendes, abgerundetes Overlay-Element (`position: fixed`), das ueber der aktuellen Seite liegt. Kein eigener `/player`-Endpoint mehr — der Player erscheint auf allen Seiten sobald ein Track geladen ist.

- **Sichtbarkeit**: Eingeblendet sobald ein Track geladen ist — auf allen Seiten (Browse, Viewer, Texte-Tab, Videos-Tab, Settings, etc.). Ausgeblendet auf Login und im PDF-Fullscreen-Modus.
- **Design**: Abgerundeter Container (`border-radius: 16px`), eigene Hintergrundfarbe (`#252D40`), dezenter Schatten. Outline-Style fuer Play/Skip-Buttons.
- **Klick auf .song-Eintrag**: Laedt alle Audio-Dateien aus dem `/Audio`-Unterordner, setzt den ersten Track (ohne Autoplay), Player erscheint mit Voice Bricks.
- **Aktiver .song**: Bekommt Indigo-Rahmen und statisches Lautsprecher-Icon vor dem Titel in der Browse-Liste.

### Voice Bricks

Klickbare Stimmen-Chips oben im Floating Player. Zeigen alle Audio-Dateien des aktuellen `.song/Audio`-Ordners.

- Jeder Brick zeigt Voice-Label (Sopran, Alt, etc.) in der Stimmen-Farbe + optionale Dauer
- Aktiver Brick: Hervorgehoben mit Rahmen + statischem Lautsprecher-Icon
- Klick auf Brick: Wechselt den Track und startet Wiedergabe
- Dot-Indikatoren unterhalb zeigen Anzahl und aktive Position
- Horizontal scrollbar bei vielen Bricks
- Fuer Dateien ohne Voice-Tag: Display-Name mit neutraler Farbe

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/VoiceBricks.tsx` | Voice-Brick-Row Komponente |
| `frontend/src/hooks/useSiblingTracks.ts` | Hook: Audio-Dateien im Song-Ordner laden |

### Wiedergabe

- Play/Pause (kein Autoplay beim Oeffnen des Players)
- Seek per Fortschrittsbalken-Klick
- Aktuelle Position und Gesamtdauer
- Streaming ueber temporaere Dropbox-Links (4 Stunden gueltig, gecached)
- Globaler Audio-Singleton (ein Track gleichzeitig)
- Vor-/Zurueckspringen: Rewind/FastForward-Icons, Skip-Zeit als klickbares Label rechts neben Forward (1s/5s/10s/15s waehlbar)
- Text-Auswahl-Button (FileText-Icon) links im Player oeffnet Popup-Menu mit allen Texten des Songs. Auswahl oeffnet Viewer, erneuter Klick schliesst Viewer. Versteckt wenn keine Texte vorhanden.

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/layout/GlobalPlayerBar.tsx` | Floating Player UI |
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
- **Sektionsvorlagen** (Route `/admin/section-presets`, ab Pro-Mitglied): Wiederverwendbare Name/Farbe-Kombinationen (z.B. Intro, Strophe, Refrain), die im Section-Editor als Auswahl-Bricks und in Rename/Recording-Modals als Abschnitt-Auswahl erscheinen. Verwaltung unter Einstellungen > Sektionsvorlagen.
- Jede Vorlage hat `shortcode` (Kuerzel im Dateinamen, z.B. "Str", "Ref") und `max_num` (maximale Nummerierung, z.B. 5 fuer Strophe1-5)
- Default-Vorlagen beim Seeding: Intro, Strophe (1-5), Refrain (1-4), Bridge (1-4), Solo, Outro

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
- Mini-Variante: Kompakte Darstellung
- Full-Variante: Auf Sektionen-Seite

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/TopPlayerBar.tsx` | Player-Bar-UI (mini/full) |

---

## Favoriten

Persoenliche Sammlung von Lieblings-Songs als Filter in der Browse-Ansicht.

- Nur `.song`-Ordner koennen als Favorit markiert werden (Herz-Icon im Swipe-Menue)
- Herz-Button im Browse-Header toggelt den Favoriten-Filter:
  - Zeigt nur favorisierte .song-Ordner in der Root-Ansicht
  - Gleiche Card-Darstellung wie Root-Browse (mit allen Metadaten, Bricks etc.)
  - Breadcrumb zeigt "Dateien > Favoriten" wenn Filter aktiv
  - Herz-Icon gefuellt + Accent-Farbe wenn Filter aktiv
- Tap auf favorisierten Ordner navigiert in den Song (Filter wird deaktiviert)
- Pro User unabhaengig (jeder User hat eigene Favoriten)
- Empty-State mit Hinweis wenn keine Favoriten vorhanden

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Favoriten-Filter + Toggle (Swipe/Herz-Button) |
| `frontend/src/hooks/useFavorites.ts` | Zustand Store + API-Logik |
| `backend/api/favorites.py` | `GET /favorites`, `POST /favorites/toggle` |
| `backend/models/favorite.py` | Favoriten-Modell (user_id + dropbox_path + entry_type) |

---

## Labels & Filter

### Label-System

Labels zum Kategorisieren von Dateien, verwaltbar ab Rolle `pro-member`.

- Pro-Mitglieder+ erstellen Labels mit Name, Farbe (Hex), optionaler Kategorie, Shortcode und Aliases
- **Stimme-Labels** (Kategorie "Stimme"): Definieren Stimmen/Instrumente des Chors. Haben `shortcode` (Kuerzel fuer Dateinamen, z.B. "S", "A", "Git") und `aliases` (komma-getrennt fuer Erkennung)
- Default-Labels beim Seeding: Sopran (S), Alt (A), Tenor (T), Bass (B) als Stimme-Labels; Schwierig, Geubt als Status-Labels
- Stimmen werden durchgaengig dynamisch geladen: Registrierung, Profil, Rename-Modal, Recording-Modal, Dateiliste
- User weisen Labels per Datei zu (Mehrfachzuweisung moeglich)
- Labels als Outline-Badges auf Dateien sichtbar (farbiger Rand, kein Hintergrund)
- Pro User unabhaengig (jeder User hat eigene Zuweisungen)

| Datei | Rolle |
|-------|-------|
| `frontend/src/hooks/useLabels.ts` | Zustand Store + API-Logik |
| `frontend/src/pages/admin/LabelsPage.tsx` | Admin Label-Verwaltung |
| `backend/api/labels.py` | CRUD Labels + Zuweisungen |
| `backend/models/label.py` | Label-Modell (name, color, category, sort_order, shortcode, aliases) |
| `backend/models/user_label.py` | Zuweisungs-Modell (user_id + dropbox_path + label_id) |

### Label-Filter

- Filter-Leiste auf Browse-Seite
- Labels als klickbare Chips mit Farbpunkt
- Mehrfachauswahl moeglich
- Filter zeigt **alle** Dateien mit dem Label (ordneruebergreifend)
- "Alle"-Button setzt Filter zurueck
- Breadcrumb ausgeblendet wenn Filter aktiv

---

## Audio-Aufnahme & Datei-Upload

Detaillierte Spezifikation zur Aufnahme: **[RECORDING.md](RECORDING.md)**

### Aufnahme (Floating Recorder)

- **Schwebender Mini-Recorder** am oberen Bildschirmrand — erlaubt gleichzeitiges Lesen von Texten/Noten waehrend der Aufnahme
- Erreichbar von **mehreren Views**: Browse (Mic-Icon in Topbar), Viewer (Topbar-Button)
- **Zwei Modi**:
  - **Song-Modus**: Aufnahme innerhalb eines `.song`-Ordners — Auto-Benennung `{SongName}-Aufnahme {n}`
  - **Root-Modus**: Aufnahme auf Chor-Ebene (ausserhalb `.song`) — erstellt automatisch neuen `.song`-Ordner mit Zeitstempel-Namen (z.B. `Aufnahme 2026-04-05 14-30.song`)
- Browser-Mikrofon-Aufnahme (MediaRecorder API, ohne Voice-Processing fuer bessere Audioqualitaet)
- Server-seitige Konvertierung zu MP3 (FFmpeg)
- Aufnahmen landen automatisch im `/Audio`-Unterordner des `.song`-Ordners (wird bei Bedarf erstellt)
- Berechtigung: ab Pro-Mitglied
- Der Recorder bleibt beim Seitenwechsel aktiv (globaler State via Zustand Store, Modul-Level-Singleton fuer MediaRecorder, `useSyncExternalStore` fuer zuverlaessige Re-Renders)
- States: Idle → Recording → Stopped (Anhoeren/Neu/Hochladen) → Uploading → Done

### Datei-Upload

Bestehende Audio-Dateien vom Geraet hochladen (z.B. aus Sprachmemos, WhatsApp, Dateien-App).

- Upload-Button im Kebab-Menu des Datei-Browsers
- Funktioniert auch auf **Chor-Ebene** (Root-Modus): erstellt automatisch `.song`-Ordner mit Zeitstempel-Namen, Audio in `/Audio`, Dokumente in `/Texte`
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
| `frontend/src/components/layout/FloatingRecorder.tsx` | Schwebender Mini-Recorder (alle States) |
| `frontend/src/stores/recordingStore.ts` | Globaler Recording-Session-State |
| `frontend/src/pages/BrowsePage.tsx` | Aufnahme-Trigger (Kebab-Menu) + Upload-Button |
| `frontend/src/pages/ViewerPage.tsx` | Aufnahme-Trigger (Topbar-Button) |
| `frontend/src/utils/filename.ts` | `buildAutoRecordingName()` fuer fortlaufende Nummerierung |
| `frontend/src/utils/folderTypes.ts` | `deriveSongFolderPath()` zum Erkennen des .song-Ordners |
| `backend/api/dropbox.py` | `POST /dropbox/upload` (Validierung + Konvertierung + Auto-Routing nach /Audio) |

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
- Chor loeschen: Entfernt Chor samt aller Nutzer, Labels, Sektionsvorlagen und nutzerbezogener Daten (Favoriten, Annotations, Notes, Sessions). Eigener aktiver Chor kann nicht geloescht werden. Dropbox-Ordner muessen manuell entfernt werden.

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/admin/ChoirsPage.tsx` | Chor-Verwaltungs-UI |
| `backend/api/admin.py` | `GET/POST/PUT/DELETE /admin/choirs` |

### Bug-Reporting (Edge Drawer)

- Amber-Tab am rechten Bildschirmrand, von jeder Seite aus erreichbar
- Oeffnet Drawer mit Issue-Liste (von GitHub geladen, 60s Cache)
- Quick-Add: Titel eingeben + Typ (Bug/Wunsch) waehlen → GitHub Issue wird erstellt
- Issue-Body enthaelt automatisch User-Kontext (Name, Stimme, Chor)
- Berechtigung `can_report_bugs` wird pro User individuell vergeben (nicht rollenbasiert)
- Nur Developer kann die Berechtigung in der Nutzerverwaltung setzen/entziehen (Bug-Icon)
- GitHub-Token und Repo-Name werden ueber `.env` konfiguriert (`GITHUB_TOKEN`, `GITHUB_REPO`)

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/layout/EdgeBugTab.tsx` | Edge Tab + Issue Drawer UI |
| `frontend/src/components/layout/AppShell.tsx` | Integration (nur bei `can_report_bugs`) |
| `backend/api/feedback.py` | `GET /feedback/issues`, `POST /feedback` |
| `backend/services/github_service.py` | GitHub API Wrapper |

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

### Zoom-Stufen (Schriftgroesse)

- Drei Stufen: Normal (100%), Groß (115%), Sehr groß (130%)
- Skaliert die gesamte UI proportional (Text, Icons, Abstände, Buttons) via CSS `zoom`
- Einstellung wird in `localStorage` gespeichert und beim App-Start angewendet
- Funktioniert auch in der PWA
- Umschalten unter Einstellungen > Darstellung > Schriftgroesse

### Einstellungen-Seite

Zentrale Seite fuer alle User- und Admin-Konfigurationen:
- Profil (Anzeigename, Stimme, Chor-Name)
- Passwort aendern
- Theme-Toggle
- Zoom-Stufen (Schriftgroesse)
- Dropbox-Verbindung (nur Developer)
- Einladungslink mit Copy-Button und klickbarer URL (nur Admin)
- Chor-Ordner in der Dropbox (nur Admin)
- Wartung: Dropbox Re-Sync — vollstaendiger DB-Abgleich (nur Admin, nur bei verbundener Dropbox)
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

### Web Share Target

Die installierte PWA erscheint im nativen Teilen-Dialog des Smartphones. Nutzer koennen PDFs, Audio-Dateien und Texte direkt aus anderen Apps (WhatsApp, E-Mail, Datei-Manager) an Cantabox teilen.

- **Unterstuetzte Formate**: PDF, MP3, M4A, OGG, WAV, WebM, MIDI, TXT
- **Zielordner**: Der zuletzt besuchte Song-Ordner bestimmt das Upload-Ziel. Dateien werden automatisch in den richtigen Unterordner geroutet (PDF→Texte, Audio→Audio)
- **Root-Upload**: War der Nutzer im Root-Verzeichnis, wird pro geteilter Datei ein neuer Song-Ordner angelegt
- **Flow**: Service Worker faengt den Share-Request ab → Dateien werden in der Cache API zwischengespeichert → App oeffnet sich mit ImportModal
- **Login-Redirect**: Geteilte Dateien ueberleben einen Login-Redirect (Cache API persistiert)
- **Fallback**: Ohne aktiven Service Worker (erster Besuch) wird auf die Startseite weitergeleitet
- **Plattform-Einschraenkung**: Nur Android (Chrome, Samsung Internet, Edge). iOS/Safari unterstuetzt die Web Share Target API nicht — Apple erlaubt Share Extensions nur fuer native Apps. Auf iOS bleibt der manuelle Upload ueber den Datei-Picker in der App

| Datei | Rolle |
|-------|-------|
| `frontend/public/manifest.json` | `share_target`-Deklaration |
| `frontend/public/sw.js` | POST-Intercept, Cache-Speicherung |
| `frontend/src/hooks/useShareTarget.ts` | Hook: liest geteilte Dateien aus Cache |
| `frontend/src/pages/BrowsePage.tsx` | Integration: oeffnet ImportModal |
| `backend/app.py` | POST `/share-target` Fallback-Route |

### Geplant (nicht implementiert)

Audio-Caching und Offline-Modus sind als Future Feature dokumentiert. Siehe `docs/future/pwa-audio-caching.md`.

---

## Navigation

### Seitenstruktur

Jede Seite hat einen eigenen Header mit Seitentitel. Alle Seiten ausser der Hauptseite (Dateien) haben links einen Zurueck-Button (`<`).

- **Dateien** (Hauptseite): Header mit Chor-Name + Aktions-Icons (Favoriten, Filter, Suche, Einstellungen). Breadcrumb mit Home-Icon. Footer mit Aufnahme- und Upload-Buttons.
- **Player, Sektionen**: Header mit Zurueck-Button + Titel, darunter Player-Controls und Toolbar.
- **Einstellungen**: Header mit Zurueck-Button + Titel.
- **Admin-Seiten**: Header mit Zurueck-Button + Titel + optionale Aktions-Buttons.

### Routing

| Pfad | Seite | Zugang |
|------|-------|--------|
| `/login` | Login | Oeffentlich |
| `/register` | Registrierung (Hinweis ohne Einladungslink) | Oeffentlich |
| `/join/:inviteCode` | Registrierung mit Chor-Kontext | Oeffentlich |
| `/browse` | Datei-Browser | Authentifiziert |
| `/viewer` | Dokument-Viewer | Authentifiziert |
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
| GET | `/list?folder=<path>` | Alle Dokumente eines Ordners (Auto-Sync mit Dropbox) | User |
| POST | `/upload` | Dokument hochladen (FormData: `file` + `folder_path`) | Pro-Mitglied+ |
| GET | `/{id}/page/{page}` | PDF-Seite als JPEG rendern (on-demand von Dropbox) | User |
| GET | `/{id}/download` | Redirect auf Dropbox Temp-Link | User |
| GET | `/{id}/stream` | Dropbox Temp-Link fuer Video-Streaming | User |
| GET | `/{id}/content` | TXT-Inhalt als Text | User |
| DELETE | `/{id}` | Dokument loeschen (DB + Dropbox) | Pro-Mitglied+ |
| POST | `/select` | Text fuer Player auswaehlen (`folder_path`, `document_id`) | User |
| DELETE | `/select?folder=<path>` | Text-Auswahl entfernen | User |
| GET | `/selected?folder=<path>` | Ausgewaehlten Text abfragen (auto-select bei 1 Dokument) | User |

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
| POST | `/resync` | Vollstaendiger Dropbox ↔ DB Abgleich des Chors | Admin |

### Feedback (`/api/feedback`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/issues` | Offene/geschlossene GitHub Issues auflisten | `can_report_bugs` |
| POST | `/` | Neues GitHub Issue erstellen (title, description, type) | `can_report_bugs` |

### Chord Sheets (`/api/chord-sheets`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| POST | `/import/parse` | PDF hochladen + parsen (Vorschau) | pro-member+ |
| POST | `/import` | Geparsten Inhalt speichern | pro-member+ |
| GET | `/list?folder=...` | Chord Sheets eines Song-Ordners | member+ |
| GET | `/{id}` | Einzelnes Chord Sheet laden | member+ |
| PUT | `/{id}` | Chord Sheet bearbeiten | pro-member+ |
| DELETE | `/{id}` | Chord Sheet loeschen | pro-member+ |
| PUT | `/{id}/preference` | User-Transposition speichern | member+ |

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
| `can_report_bugs` | Boolean | Bug-Reporting-Berechtigung (vom Developer vergeben) |

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
| `category` | String (max 50) | Kategorie: "Stimme" (Zeile 1), "Status" oder null (Zeile 3) |
| `sort_order` | Integer | Sortierung |
| `shortcode` | String (max 10) | Kuerzel im Dateinamen (z.B. "S", "A", "Piano") |
| `aliases` | String (max 200) | Komma-getrennte Aliase (z.B. "soprano,sop") |

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
| `shortcode` | String (max 20) | Kuerzel im Dateinamen (z.B. "Str", "Ref") |
| `max_num` | Integer | Maximale Nummerierung (0 = keine) |

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
| `dropbox_path` | String (optional) | Relativer Dropbox-Pfad (z.B. "Chormappe/Lied1/Texte/sheet.pdf") |
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
| ~~`dropbox_root_folder`~~ | — | Entfernt — Dropbox App-Ordner wird automatisch von der Dropbox-App gesetzt |
| `updated_at` | DateTime | Letzte Aenderung |

### ChordSheet

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer (PK) | |
| `song_folder_path` | String | Pfad zum .song-Ordner |
| `title` | String | Songtitel |
| `original_key` | String? | Erkannte Original-Tonart |
| `parsed_content` | Text (JSON) | Geparste Sektionen mit Akkord-Positionen |
| `source_filename` | String? | Original-PDF-Dateiname |
| `choir_id` | String? | Chor-Zuordnung |
| `created_by` | FK→User | Ersteller |
| `created_at` | DateTime | Erstellungszeitpunkt |
| `updated_at` | DateTime | Letzte Aenderung |

### UserChordPreference

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer (PK) | |
| `user_id` | FK→User | |
| `chord_sheet_id` | FK→ChordSheet | |
| `transposition_semitones` | Integer | Halbtonschritte (-12 bis +12) |
| `updated_at` | DateTime | Letzte Aenderung |

Unique: `(user_id, chord_sheet_id)`

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
- `RenameModal` — Datei umbenennen mit Stimme/Abschnitt/Notiz-Auswahl. Felder werden aus dem aktuellen Dateinamen vorbelegt (Filename-Parsing).
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

---

## Behobene Bugs

### GlobalPlayerBar verschwand beim Tab-Wechsel

Der Player wurde nur in Audio/Multitrack/Videos-Ordnern und auf /viewer bzw. /sections angezeigt. Beim Wechsel zum Texte-Tab, zur Songliste oder anderen Seiten verschwand er, obwohl Audio weiterlief. Fix: Player wird jetzt immer angezeigt sobald ein Track geladen ist, unabhaengig von der aktuellen Seite.

### Dokumente im Texte-Ordner konnten nicht geloescht werden

Das Frontend berechnete den `folder_path` fuer den DB-Lookup falsch: es entfernte nur den Dateinamen (`Chormappe/Lied1/Texte`), aber die DB speichert ohne `/Texte`-Suffix (`Chormappe/Lied1`). Dadurch fand der Lookup kein Dokument und das Loeschen schlug still fehl.

**Fix:** Browse-Response liefert jetzt `doc_id` direkt mit, Frontend loescht per `DELETE /documents/{id}` ohne Pfad-Berechnung. Zusaetzlich: `dropbox_path` im Document-Model speichert den echten relativen Pfad.

### Cleanup-Service matchte Dokumente falsch

`cleanup_file()` extrahierte den `folder_path` als direkten Parent (`Chormappe/Lied1/Texte` statt `Chormappe/Lied1`). Fix: Primaerer Match per `dropbox_path`, Fallback mit korrektem `/Texte/`-Stripping.

### Swipe-Actions bei aktiver Datei sichtbar aber nicht bedienbar

Die aktuell spielende Datei hatte `background: rgba(129,140,248,0.08)` — 92% transparent. Die Swipe-Action-Buttons (z-index 1) hinter dem swipe-content (z-index 2) schimmerten durch, waren aber nicht klickbar. Tippen oeffnete stattdessen den Player. Fix: Opake Hintergrundfarbe via `color-mix(in srgb, ...)` statt transparentem rgba.

### doc_id im Texte-Ordner nicht angereichert

Im Texte-Ordner fehlte die `doc_id` fuer Dokument-Eintraege, wodurch der Select-Button (Haken) nicht angezeigt wurde. Ursache: Die DB speichert `folder_path` ohne fuehrenden Slash (`Bring Me Little Water.song/Texte`), die Browse-API suchte mit Slash (`/Bring Me Little Water.song/Texte`). Fix: Query matcht jetzt beide Varianten (mit und ohne fuehrenden Slash).

### Placeholder-Text nicht als solcher erkennbar

Placeholder-Texte in Input-Feldern sahen aus wie eingegebener Text (gleiche Farbe, nicht kursiv). Betroffen: Login, Settings, Admin-Seiten, Modals, Suche, Lyrics-Editor. Fix: Globale `::placeholder`-Regel mit `color: var(--text-muted)` + `font-style: italic`. Zwei redundante klassenspezifische Regeln entfernt.

### Audio-Aufnahme auf iOS blockiert (iPhone)

Auf iOS Safari blieb der Floating Recorder nach dem Mikrofon-Berechtigungsdialog im "Aufnahme starten"-Zustand haengen, obwohl die Aufnahme tatsaechlich lief (Dynamic Island zeigte aktive Aufnahme). Ursache: `useRecorder` Hook nutzte ein Singleton-Callback-Pattern (`_onStateChange`) mit genau einem Listener-Slot. Der native getUserMedia-Berechtigungsdialog auf iOS konnte den React-Lifecycle unterbrechen, wodurch der Callback `null` wurde und State-Updates verloren gingen. Fix: Umstellung auf `useSyncExternalStore` mit `Set<listener>` — unterstuetzt mehrere Subscriber, ueberlebt Mount/Unmount-Zyklen zuverlaessig. Zusaetzlich verzoegertes Re-Notify (100ms) als Safety-Net nach getUserMedia.

### Browse-View aktualisiert sich nicht nach Mutationen

Nach Rename, Delete, Ordner erstellen/loeschen wurde `loadFolder(browsePath)` ohne `forceRefresh` aufgerufen. Der 5-Minuten-Cache im browseStore lieferte daraufhin die alten Daten zurueck — die Aenderung war erst nach manuellem Sync sichtbar. Fix: Alle Mutations-Handler rufen jetzt `loadFolder(browsePath, true)` auf, um den Cache zu umgehen.

### Playback stoppt nicht beim Verlassen der Song-Ansicht

Beim Navigieren von einem .song-Ordner zu Einstellungen oder Admin-Seiten lief die Wiedergabe weiter. Das bestehende Cleanup in BrowsePage griff nur beim Ordnerwechsel innerhalb der Browse-Ansicht, nicht beim Seitenwechsel. Fix: AppShell ueberwacht Routen-Wechsel und stoppt die Wiedergabe beim Verlassen der Song-Kontext-Routen (Browse, Viewer, Sections).

### Pinch-to-Zoom im Viewer funktioniert erst beim zweiten Oeffnen

Der Pinch-to-Zoom useEffect in DocumentPanel hatte leere Dependencies (`[]`) und lief nur einmal beim Mount. Wenn zu dem Zeitpunkt die PDF-Area noch nicht gerendert war (Dokumente laden noch), war `pagesRef.current` null und die Touch-Listener wurden nie angehaengt. Fix: `activeDoc?.id` als Dependency hinzugefuegt — der Effect laeuft neu sobald das Dokument verfuegbar ist. Zoom-Scale wird bei Dokumentwechsel zurueckgesetzt.

### Pinch-to-Zoom im Annotations-Modus nicht moeglich

Im Zeichenmodus wurde die Pinch-Geste als Zeichnung erkannt statt zu zoomen. Ursache: DocumentPanel uebersprang die Pinch-Handler komplett wenn `drawingMode` aktiv war (`if (drawingMode) return`), und AnnotatedPage fing jeden Finger einzeln als Strich ab ohne Multi-Touch-Pruefung. Fix: Early Returns in DocumentPanel entfernt — Pinch-Erkennung laeuft jetzt immer. AnnotatedPage trackt aktive Pointer-IDs und verwirft angefangene Striche bei 2+ Fingern. `wasPinchRef` verhindert versehentliches Zeichnen wenn nach einem Pinch ein Finger liegen bleibt.

### TXT-Viewer zeigt keine Zeilenumbrueche bei Unicode Line Separators

Textdateien mit U+2028 (Line Separator) wurden im Viewer ohne Zeilenumbrueche dargestellt — alle Zeilen liefen in einem Block zusammen. Ursache: Browser rendern U+2028/U+2029 in `<pre>`-Tags nicht als sichtbaren Umbruch. Fix: Backend normalisiert beim Abrufen aus der Dropbox alle Zeilenumbruch-Varianten (`\r\n`, `\r`, U+2028, U+2029) zu `\n`.
