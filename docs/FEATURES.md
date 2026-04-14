# ChoirBox — Feature-Spezifikation

## Ueberblick

ChoirBox ist eine Smartphone-optimierte Web-App fuer Chormitglieder. Kernfunktionen: Audio-Dateien aus einer geteilten Dropbox durchsuchen, abspielen, mit Labels organisieren, und eigene Uebungs-Aufnahmen hochladen. Eine Instanz kann mehrere unabhaengige Choere verwalten.

---

## Authentifizierung & Benutzerverwaltung

### Registrierung

Chormitglieder registrieren sich ueber einen Einladungslink, der den Chor identifiziert.

- Einladungslink-Format: `/#/join/<invite_code>` — identifiziert den Chor automatisch
- Pflichtfelder: Benutzername, Anzeigename, Passwort, Stimme (dynamisch aus Stimme-Labels des Chors)
- Passwort mindestens 10 Zeichen, zxcvbn-Score >= 2 ("Maessig") erforderlich
- Live-Staerkemeter (rot/orange/gruen) mit deutschen Verbesserungs-Hinweisen (zxcvbn-ts)
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
- Passwort aendern (altes Passwort bestaetigen, neues min. 10 Zeichen + Staerke-Score >= 2, mit Live-Staerkemeter)
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

7-stufiges Rollensystem mit aufsteigenden Berechtigungen. Jede hoehere Rolle erbt alle Rechte der niedrigeren.

| Rolle         | Level | Beschreibung                                                                  |
| ------------- | ----- | ----------------------------------------------------------------------------- |
| `guest`       | 0     | Registriert, eingeschraenkt — nur Browsen/Play/Transposition                  |
| `member`      | 1     | Standard-Chormitglied (Browsen, Streamen, Favoriten, Annotationen)            |
| `pro-member`  | 2     | Kann Labels und Sections verwalten, Dateien hochladen/umbenennen              |
| `chorleiter`  | 3     | Erweiterte Verwaltungsrechte (Datei/Ordner loeschen)                          |
| `admin`       | 4     | Voller Zugriff (Nutzer, Einladungslink, Settings) innerhalb des eigenen Chors |
| `beta-tester` | 5     | Beta-Features (z.B. Section-Editor)                                           |
| `developer`   | 6     | Instanz-Verwaltung: Choere erstellen/wechseln, Dropbox OAuth                  |

- Neue Registrierungen erhalten automatisch die Rolle `member`
- Rollen sind pro Chor (User gehoert zu genau einem Chor)
- Admin kann Rollen ueber die Nutzerverwaltung aendern (Dropdown mit allen Rollen)
- Developer kann neue Choere erstellen, zwischen Choeren wechseln, die Dropbox-Verbindung verwalten und bypasst den Distribution-Check (fuer Testing)
- Backend: `require_permission("<permission>")` als Dependency fuer endpoint-basierte Enforcement — definiert in `backend/policy/permissions.json`
- Frontend: `hasMinRole(userRole, "pro-member")` fuer UI-Sichtbarkeit (wird in Zukunft durch Policy-basiertes Feature-Gating ergaenzt)

| Datei | Rolle |
|-------|-------|
| `backend/policy/permissions.json` | Zentrale Policy: Rollen, Features, Permissions, Route-Mapping |
| `backend/policy/engine.py` | `PolicyEngine`, `get_policy()`, Start-Check |
| `backend/policy/dependencies.py` | `require_permission()`, `require_permission_query()` |
| `backend/api/auth.py` | `ROLE_HIERARCHY` / `VALID_ROLES` (lazy-loaded aus Policy) |
| `frontend/src/utils/roles.ts` | `hasMinRole()`, `ROLE_LABELS`, `ALL_ROLES` |

### Permission-Policy (zentrale JSON)

Saemtliche Berechtigungen — welche Rolle welche Permission hat und welcher
FastAPI-Endpoint welche Permission erfordert — sind in
`backend/policy/permissions.json` zentralisiert. Aenderungen an der
Berechtigungsmatrix geschehen dort, nicht verstreut ueber die Router-Dateien.

**Struktur (vierstufig):**

```
Distribution → Features → Permissions → Routes
```

- **Distribution**: welche Feature-Sets sind in diesem Deployment aktiv?
  (konfiguriert ueber `CHOIRBOX_DISTRIBUTION` in `.env`, Default: `full`).
  Ermoeglicht spaeter verschiedene Pakete (z.B. `demo`, `basis`, `pro`).
- **Feature**: Bundle von verwandten Permissions (z.B. `favorites`,
  `labels`, `upload`). Marketing-Ebene fuer Distribution-Definition.
- **Permission**: einzelnes Recht mit Min-Rolle (z.B. `documents.delete` →
  mindestens `chorleiter`).
- **Route**: HTTP-Methode + Pfad → Permission-Mapping.

**Konsistenz-Garantien:**

- Beim App-Start wird geprueft, dass jede registrierte FastAPI-Route
  entweder als `protected` oder `public` in der Policy steht. Fehlt ein
  Eintrag → Start-Fail (konfigurierbar ueber `CHOIRBOX_POLICY_STRICT`).
- Jede Permission muss in genau einem Feature stehen (verhindert
  Doppelzuweisungen).
- Jede Route muss eine bekannte Permission referenzieren.
- `developer` umgeht den Distribution-Check (Flag `bypass_distribution`
  in der Rollen-Definition), alle anderen Rollen nicht.

**Fehler-Codes bei Ablehnung:**

- `401 Not authenticated` — kein/ungueltiger Token
- `403 permission_denied` — Rolle reicht nicht aus
- `403 feature_not_available` — Feature ist in der aktiven Distribution
  nicht aktiviert (z.B. Pro-Feature in Demo-Instanz)

| Datei | Rolle |
|-------|-------|
| `backend/policy/permissions.json` | Quelle der Wahrheit fuer Rollen/Permissions/Routes |
| `backend/policy/engine.py` | Loader + `PolicyEngine.can()` + Start-Check |
| `backend/policy/dependencies.py` | `require_permission()` als FastAPI-Dependency |
| `backend/tests/test_policy.py` | 41 Regressionstests (Engine + HTTP-Enforcement) |

### Berechtigungsmatrix

**Hinweis:** Die Matrix ist seit der Policy-Einfuehrung automatisch durch
`backend/policy/permissions.json` enforct. Bei Abweichungen zwischen dieser
Matrix und der JSON gilt die JSON (siehe `test_policy.py` fuer die
Regressionstests).

| Element                       | beta-tester (5) | admin (4) | chorleiter (3) | pro-member (2) | member (1) | guest (0) |
| ----------------------------- | :-------------: | :-------: | :------------: | :------------: | :--------: | :-------: |
| **BrowsePage**                |                 |           |                |                |            |           |
| Browse, Play, Stream          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| Favoriten (Herz)              |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Filter (Labels lesen)         |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| Suche                         |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
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
| Wiedergabe + Voice Bricks     |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| Viewer-Button                 |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| **ViewerPage**                |                 |           |                |                |            |           |
| Dokument anzeigen             |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| PDF hochladen/loeschen        |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Notizen/Lyrics bearbeiten     |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Section-Editor                |        ✓        |     —     |       —        |       —        |     —      |     —     |
| **Chord Sheets (.cho)**       |                 |           |                |                |            |           |
| Chord Sheets ansehen          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| Transposition (auto-save)     |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| Annotationen (Stift)          |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Chordsheet einfuegen (Paste)  |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| .cho-Datei hochladen          |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Chord Sheet loeschen          |        ✓        |     ✓     |       ✓        |       —        |     —      |     —     |
| **SettingsPage**              |                 |           |                |                |            |           |
| Profil lesen                  |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     ✓     |
| Profil, Passwort, Theme, Zoom |        ✓        |     ✓     |       ✓        |       ✓        |     ✓      |     —     |
| Labels verwalten              |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Sektionsvorlagen              |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Nutzer verwalten              |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Ansichts-Modus pro User setzen|        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Bulk View-Mode (alle Member)  |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Einladungslink + Copy         |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Chor-Ordner                   |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Dropbox Re-Sync               |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Gast-Zugaenge verwalten       |        ✓        |     ✓     |       —        |       —        |     —      |     —     |
| Dropbox-Verbindung            |        —        |     —     |       —        |       —        |     —      |     —     |
| Choere verwalten              |        —        |     —     |       —        |       —        |     —      |     —     |
| **FileSettingsPage**          |                 |           |                |                |            |           |
| Anzeigen (read-only)          |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |
| Bearbeiten + Speichern        |        ✓        |     ✓     |       ✓        |       ✓        |     —      |     —     |

*Developer (6) hat alle Rechte + Dropbox-Verbindung, Choere verwalten, Chor-Wechsel.*
*Bug-Reporting (Edge Tab): Unabhaengig von der Rolle — per `can_report_bugs`-Flag vom Developer individuell vergeben.*

### Gast-Zugang per URL-Code (Multi-Use)

Admins koennen temporaeren Gast-Zugang fuer Aussenstehende vergeben —
Liederabend, Probenbesuch, Interessenten — ohne fuer jeden Gast einen
regulaeren User anzulegen. Ein Link kann von beliebig vielen Personen
parallel genutzt werden; jede Einloesung erzeugt eine eigene 2h-Gast-
Session.

**Flow:**

1. Admin oeffnet *Einstellungen → Verwaltung → Gast-Zugaenge*.
2. Admin erzeugt einen Link mit optionalem Label, gewaehlter Gueltigkeit
   (Default 60 Minuten, Bereich 15 min – 24 h aus `AppSettings`) und
   **optionalem Limit fuer die Anzahl der Einloesungen** (z.B. 10 —
   danach ist der Link `exhausted`, egal ob die TTL noch laeuft).
3. Der Klartext-Code wird **einmalig** direkt nach dem Erstellen angezeigt
   (Copy-Button). Danach ist er nie wieder sichtbar — nur der SHA256-Hash
   steht in der DB.
4. Der Link hat das Format `https://cantabox.de/#/guest/<token>`
   (path-basiert, damit der Token nicht im Referer-Header leakt).
5. Der Admin teilt den Link (z.B. im Chor-Chat). Jeder Klick schickt den
   Code an den Backend. Bei Erfolg wird der Gast eingeloggt — die
   Session laeuft genau bis zum Link-Ablauf (max. 36 h). Mehrere Leute
   koennen parallel aus demselben Link eine Session ziehen.
6. Ablauf-Bedingungen (einheitlich HTTP 410 Gone):
   - `revoked`   — Admin hat den Link manuell widerrufen
   - `expired`   — TTL abgelaufen
   - `exhausted` — Nutzungs-Limit erreicht (nur bei gesetztem `max_uses`)
   - `invalid`   — Token unbekannt

**Einmal-Code-Modus (bleibt im Code verfuegbar):**

Ueber `max_uses=1` erzeugt der Service einen klassischen Wegwerf-Code.
In der aktuellen Admin-UI ist das nicht angeboten — der Modus bleibt
aber im Code-Pfad aktiv und kann spaeter z.B. von einer Demo-Variante
mit Login als Member genutzt werden.

**Sicherheit:**

- 256-bit-Token aus `secrets.token_urlsafe(32)` — keine kurzen Codes
- Nur Hash in der DB; der Klartext existiert nur in der Create-Response
- Rate-Limit auf Redeem-Endpoint: 30 Versuche pro Minute pro IP
  (erlaubt einem kompletten Chor mit Fehlversuchen das parallele
  Einloesen). Erfolgreiche Einloesungen zaehlen nicht ins Limit.
- Einheitliche 410-Antwort fuer alle Fehler-Faelle — Angreifer kann nicht
  unterscheiden, welcher Zustand vorliegt
- `max_uses` als optionales Nutzungs-Limit: bei versehentlichem Leak
  bleibt der Schaden auf maximal `max_uses` Fremdnutzer begrenzt
- Admin kann aktive Links jederzeit widerrufen (`revoked_at`) —
  bestehende Sessions laufen bis zum urspruenglichen Link-Ablauf weiter
- Guest-User (`role="guest"`) ist **shared per Chor**: ein `User`-Row pro
  Chor mit `username="_guest_<choir_id>"`, wird vom Seed automatisch
  angelegt. Passwort-Login ist fuer diese User hart blockiert.
- Die Gast-Session-TTL entspricht der verbleibenden Link-Laufzeit —
  damit steuert der Admin ueber die Link-TTL auch die Session-Dauer.
  Obergrenze: `MAX_LINK_TTL_MINUTES = 36 * 60` im Code (Schutz vor
  versehentlicher Ueberdehnung).

**UX beim Verlassen (Logout & Session-Ablauf):**

- Gaeste sehen nach dem Logout oder Session-Ablauf eine freundliche
  Goodbye-Seite (`/#/guest-goodbye`) statt der Login-Seite, die fuer
  Gaeste ohne Passwort sinnlos waere.
- Intern: Bei 401 prueft `api/client.ts` die Rolle; bei Gaesten wird
  `expireGuestSession()` aufgerufen. Beim aktiven Logout setzt `logout()`
  fuer Gaeste ebenfalls das `guest_goodbye`-Flag im sessionStorage, das
  der `AuthGuard` beim naechsten Render konsumiert.
- Der `BrowsePage`-Header zeigt fuer Gaeste neben dem Logout-Icon die
  **Uhrzeit** (nicht den Countdown), zu der die Session automatisch
  ablaeuft — z.B. "bis 21:45". Die Anzeige basiert auf `expires_in`
  aus dem Redeem-Response und wird in `authStore.sessionExpiresAt`
  persistiert (localStorage), damit sie auch nach einem Tab-Reload
  erhalten bleibt.

**Was Gaeste duerfen** (via Policy, Distribution `full`):

Browse, Suche, Audio-Stream, Dokumente lesen (PDF/TXT/CHO), Chord-Sheets
transponieren, Song-Abschnitte lesen (Cycle-Play), Labels lesen (fuer die
Filter-UI), Player-State speichern, Eigenes Profil lesen.

**Was Gaeste NICHT duerfen**: Favoriten setzen, Annotations schreiben,
Notizen schreiben, Labels verwalten, Dateien hochladen/umbenennen/loeschen,
Ordner verwalten, Profil aendern, Passwort aendern (kritisch bei geteiltem
Gast-User!), Nutzerverwaltung, Chor-Settings.

| Datei | Rolle |
|-------|-------|
| `backend/models/guest_link.py` | GuestLink-Modell (id, choir_id, token_hash, expires_at, consumed_*, revoked_at) |
| `backend/services/guest_link_service.py` | Business-Logik: create/redeem/revoke/list, get_or_create_guest_user |
| `backend/api/guest_links.py` | FastAPI-Router, Rate-Limit, Audit-IP-Extraktion, einheitliche 410-Antworten |
| `backend/api/auth.py` | `_create_token(max_age_seconds=...)` fuer kurze Gast-Sessions, Passwort-Login blockiert fuer `role=guest` |
| `backend/models/session_token.py` | `expires_at`-Spalte fuer per-Token-TTL |
| `backend/seed.py` | Legt Gast-User fuer jeden Chor beim Start automatisch an |
| `frontend/src/pages/GuestRedeemPage.tsx` | Einloese-Seite unter `/guest/:token` |
| `frontend/src/pages/admin/GuestLinksPage.tsx` | Admin-UI zum Erstellen/Listen/Widerrufen |
| `backend/tests/test_guest_links.py` | 22 Tests fuer alle Flows und Fehler-Faelle |

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
- **Song Card Header** innerhalb von `.song`-Ordnern: Zeigt Song-Name + Multi-Button-Leiste (gleiche Buttons wie in der Browse-Liste). **Texte, Audio und Videos werden immer angezeigt** — auch wenn ein Typ leer ist. Leere Typen (Count 0) werden gedimmt (Opacity 0.32, gestrichelter Rahmen) und sind nicht klickbar. Multitrack bleibt konditional und erscheint nur, wenn Dateien vorhanden sind. Aktiver Subfolder wird mit kraeftigerer Hintergrundfuellung + Glow-Schatten + Label-Text hervorgehoben.
- Zeigt Ordner und Audio-Dateien (MP3, WebM, M4A)
- Sortierung: Container-Ordner zuerst, dann typisierte Ordner (Song, Texte, Audio), dann Dateien
- **Card-Layout**: Alle Dateien und .song-Ordner werden als Cards mit Rahmen und Abstand dargestellt
- **File-Type-Badge**: Jede Datei zeigt ein gerahmtes Badge mit Kategorie-Icon (Volume2/FileText/Video/Music) und Dateiendung als Text (z.B. MP3, PDF, MP4). Farbe richtet sich nach Dateityp (Audio=Cyan, Text=Accent, Video=Pink). `.cho`-Dateien verwenden das Music-Icon, den Accent-Rahmen (wie PDF/TXT) und das Label "Chords" statt der Dateiendung — sie gehoeren visuell zum Text-Cluster. Files in Multitrack- oder Videos-Ordnern uebernehmen die jeweilige Ordner-Farbe fuer konsistente UX. Ordner-Icons werden ohne Rahmen angezeigt. Ausgewaehlte Texte werden mit einem gruenen Haken vor dem Badge markiert.
- **Einheitliches Meta-System** fuer alle Dateitypen (Audio, Video, PDF, TXT):
  - **Titel**: Songname (aus .song-Ordner abgeleitet). Voice-Prefix, Sections und Songname werden nicht im Titel wiederholt.
  - **Zeile 1:** Dauer + Stimmen/Instrumente als farbige Tags mit Dot. Quellen: Backend-Parsing + zugewiesene Stimme-Labels (gemerged)
  - **Zeile 2:** Abschnitte als Accent-Badges (aus SectionPresets dynamisch)
  - **Zeile 3:** Persoenliche Labels als Outline-Badges (farbiger Rand + Text, kein Hintergrund). Nur Nicht-Stimme-Labels. Nicht sichtbar innerhalb von `.song`-Ordnern
  - **Zeile 4:** Kommentar (kursiv) — alles aus dem Dateinamen was nicht Voice, Songname oder Section ist
- **Backend Filename-Parsing**: Metadaten (voice_keys, section_keys, song_name, free_text) werden im Backend geparst und in `audio_meta`-Tabelle gecacht. Lazy Parsing beim Browse, Batch-Parsing beim Re-Sync. Invalidierung bei Label/Preset-Aenderungen.
- **.song Ordner bekommen zusaetzlich:**
  - **Multi-Button-Leiste:** Breite, klickbare Buttons fuer Schnellzugriff auf die Unterordner (Audio=Cyan, Videos=Pink, Multitrack=Amber, Texte=Indigo). **Texte, Audio und Videos werden in jeder Song-Kachel immer angezeigt** (auch mit Count 0 und gedimmt/gestrichelt), Multitrack nur bei Vorhandensein. Buttons fuellen die Card-Breite (`flex: 1`), zeigen Icon + Dateianzahl, und navigieren direkt in den jeweiligen Unterordner. Leere Buttons (Count 0) sind `disabled` und loesen keine Navigation aus. Die Song-Kachel selbst ist nicht klickbar — Navigation erfolgt ausschliesslich ueber die Multi-Button-Leiste oder das Drei-Punkte-Menu. In der Root-Ansicht ist kein Button als aktiv markiert.
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

- **Root-Level only** (nicht-rekursiv): Suche durchsucht ausschliesslich die direkten Children des Chor-Roots, keine Subfolder
- `.song`-Ordner werden nicht durchsucht (Inhalte bleiben unsichtbar), erscheinen aber selbst als Treffer mit gestripptem Display-Name
- Folder-Treffer sind eingeschlossen (vorher nur Files): Trash und reservierte Folders (Texte/Audio/Videos/Multitrack) werden ausgeblendet
- `.song`-Treffer werden mit `sub_folders` + `selected_doc` enrichet, damit der Klick automatisch in den Audio/Texte-Subfolder springt und der Song-Header (Name + Badges) wie beim normalen Browse sichtbar wird
- **URL-getriebener Browse-/Such-State**: Browse-Pfad und Such-Query leben ausschliesslich in den URL-Search-Params (`/browse?p=<path>` oder `/browse?q=<query>`) — Single Source of Truth. Jede Navigation pusht eine echte React-Router-History-Entry, sodass Browser-Back / `navigate(-1)` / DocViewer-Back automatisch zum vorherigen Zustand (inkl. Suche) zurueckkehren. `useSearchParams` + `useLocation` ersetzen lokale useState-Flags fuer `searchOpen`/`searchQuery`.
- **Back-zur-Suche**: Klick auf ein `.song`-Brick-Suchergebnis pusht eine Navigation mit `location.state: {fromSearch: true}`. Im Song wird der Back-Breadcrumb als **"< Suche"** gelabelt (basierend auf `location.state.fromSearch`) und ruft `navigate(-1)` auf, was die Such-URL wiederherstellt. Greift strukturell auch nach Zwischenstopp im DocViewer, weil die History ueber alle Router-Navigationen konsistent bleibt.
- `closeSearchExplicit` (X-Button) unwindet den Search-Push via `navigate(-1)` wenn `state.fromPath` vorhanden, sonst Fallback `navigate('/browse', {replace})`.
- Debounced (300ms Verzoegerung beim Tippen)
- Mindestens 2 Zeichen erforderlich, case-insensitive Substring-Match auf Dateiname

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | URL-getriebene Search/Browse-State, `loadFolder` als Navigate-Wrapper, `openSearch`/`closeSearchExplicit`, `useSearchParams`/`useLocation`, konditionales "< Suche"-Breadcrumb |
| `backend/api/dropbox.py` | `GET /dropbox/search` (nicht-rekursives `list_folder` + `.song`-Enrichment) |
| `backend/services/dropbox_service.py` | `list_folder()` mit 5-Min-Cache |

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
- **Navigation in eine .song**: Erfolgt ausschliesslich ueber die Multi-Button-Leiste auf der Song-Kachel. Der Button "Texte" oeffnet den Texte-Unterordner (bei genau einem Text springt der Texte-Unterordner sofort zum DocViewer).
- **0 Texte**: Texte-Ordner wird nicht angezeigt
- **1 Text**: Beim Upload automatisch ausgewaehlt (persistent). Kann per Swipe-Action abgewaehlt werden (z.B. bei nicht-musikbezogenen Texten wie Anweisungen, Aufstellung etc.)
- **2+ Texte**: Texte-Ordner als navigierbarer Ordner, Auswahl per Swipe-Action im Texte-Ordner
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
- **Dry-Run-Modus**: Button "Resync simulieren (Dry-Run)" laesst den kompletten Vergleich laufen, schreibt aber nichts in die DB. Anzeige wird mit "Simulation: ..." prefixed. Backend-Endpoint: `POST /admin/resync?dry_run=true`.
- **DB-Backup vor Resync**: Vor jedem echten (nicht-simulierten) Resync wird `choirbox.db` automatisch nach `choirbox.db.bak-<timestamp>` kopiert. Es bleiben immer nur die letzten 5 Backups erhalten.

### Text-Content-Cache (txt, cho)

`/documents/{id}/content` cached den rohen Text im RAM (`_text_cache` in `document_service.py`, max 100 Dokumente). Cache-Key ist `doc_id`, Invalidierung ueber `content_hash`: Ein Cache-Treffer liefert nur, wenn der in der DB gespeicherte Hash mit dem Cache-Eintrag uebereinstimmt. Sobald der Folder-Sync einen neuen Hash von Dropbox uebernimmt, matcht der alte Cache-Eintrag nicht mehr und die naechste Anfrage laedt frisch. Kein TTL noetig. Rename und Delete leeren den Eintrag aktiv.

### ChordPro-Parser: Vollstaendige Standard-Direktiven

Gemaess ChordPro-Spezifikation werden unterstuetzt:

**Metadata (als Header gerendert, nicht still verschluckt):**
`{title}`/`{t}`, `{subtitle}`/`{st}`/`{su}`, `{artist}`, `{composer}`, `{lyricist}`, `{copyright}`, `{album}`, `{year}`, `{key}`, `{time}`, `{tempo}`, `{duration}`, `{capo}`, `{meta: name value}`. Der Metadata-Header zeigt Titel (gross), Untertitel, Credits (Künstler/Musik/Text), Album + Jahr, Badges fuer Tonart/Capo/Takt/Tempo/Dauer und Copyright.

**Kommentare mit eigenem Stil pro Variante:**
- `{comment}` / `{c}` — gelber Textmarker (`#fef08a`), kursiv
- `{comment_italic}` / `{ci}` — nur kursiv, kein Hintergrund
- `{comment_box}` / `{cb}` — eingerahmt
Inline-Kommentare (`{c:4x}` mitten in einer Lyric-Zeile) werden als `chord-annotation`-Pill am Zeilenende gerendert.

**Spezial: `{title:}` + `{comment:}` auf einer Quellzeile:**
Wenn `{title: X} {comment: Y}` auf derselben Zeile stehen, wird der Kommentar als kleiner Textmarker-Hinweis direkt **neben** dem Titel gerendert (z.B. `Sonnenbadewanne  [3. Bund]`).

**Sektionen:**
- `{start_of_verse}` / `{sov}`, `{start_of_chorus}` / `{soc}`, `{start_of_bridge}` / `{sob}`, `{start_of_tab}` / `{sot}`, `{start_of_grid}` / `{sog}`, `{start_of_highlight}` / `{soh}` plus generische `start_of_<label>` (ChordPro 6)
- Tab- **und** Grid-Bloecke werden monospace verbatim gerendert — eckige Klammern drin bleiben Text, keine Akkord-Erkennung
- `{chorus}` — Verweis auf den vorigen Refrain. Wird als eigener Abschnitt mit Label `[Refrain]` (oder individuellem Label) und `(Refrain)`-Platzhalter in kursiv gerendert

**Leniency beim Lesen:**
- Directive-Namen mit Leerzeichen werden toleriert (`{start of verse}` → parst wie `{start_of_verse}`)
- Mehrere Directives auf einer Quellzeile werden alle verarbeitet (`{title: X} {comment: Y}`)
- Value-Regex stoppt an der ersten `}` — kein Greedy-Runaway mehr
- `#`-Kommentarzeilen werden komplett uebersprungen
- Leere `[]` und Takt-Separatoren `[|]` / `[||]` werden still verschluckt
- Leere Direktivwerte (`{t:}`, `{c:}`) erzeugen keine leere Zeile
- Unbekannte Direktiven (font, color, define, columns, new_page, image, ...) werden spec-konform ignoriert

**Normalisierung beim Schreiben:**
Speichert der Text-Editor ein `.cho`, werden Directive-Namen vor dem Schreiben in die Spec-Form normalisiert (Leerzeichen → `_`, lowercase). Aus `{Start Of Verse: V1}` wird auf der Festplatte `{start_of_verse: V1}`. **Values** bleiben unveraendert. Umgesetzt via `normalizeChordProDirectives()` in `frontend/src/utils/chordPro.ts`.

### Akkord-Anker-Unterstreichung

Das Zeichen im Lyric-Text, **ueber** dem ein Akkord steht, wird lila unterstrichen — sowohl im Render-Modus (`.chord-anchor`) als auch im Akkord-Editor (`.chord-input-char--has-chord`). Beide Stellen nutzen `text-decoration-skip-ink: none`, damit die Linie auch unter Unterlaengen wie `j`, `g`, `p`, `y` sichtbar bleibt.

### Akkorde ein/aus-Toggle im .cho-Viewer

Oben rechts in jedem Chord-Sheet-Dokument sitzt neben der Transpose-Pill der Button "Akkorde". Klick schaltet zwischen zwei Zustaenden um:
- **Sichtbar** (Default): voller Render-Modus mit Akkord-Zeilen, Anker-Unterstreichung und Transpose-Pill. Button lila hervorgehoben (`aria-pressed="true"`).
- **Versteckt**: Akkord-Zeilen und Unterstreichungen komplett ausgeblendet -> reiner Text, viel mehr Zeilen pro Bildschirm. Transpose-Pill ebenfalls ausgeblendet (ohne Akkorde nicht sinnvoll). Metadata (Titel, Untertitel, Badges), Section-Labels und Kommentare bleiben sichtbar.

Umgesetzt als Prop-Kette `DocumentPanel` (`chordsHidden` State) -> `ChordSheetTextViewer` -> `ChordSheetViewer` (`hideChords`). Pro Session; keine Persistierung pro Dokument.

### Akkorde verschieben im Edit-Modus

In `Akkorde bearbeiten` lassen sich bereits gesetzte Akkorde ohne Loeschen-und-neu-setzen verschieben:

- **Tastatur**: wenn der aktive Cursor auf einem Akkord steht, verschieben `←` / `→` den Akkord eine Spalte. Kollisions-Check: wenn die Zielspalte bereits einen Akkord traegt, bleibt die Position stehen. Clamp auf `[0, Zeilenlaenge-1]`. Werden in Text-Inputs (Popover-Suche) die Pfeiltasten gedrueckt, greift die Akkord-Verschiebung nicht.
- **Mobil - Lupe**: Long-Press (~450ms) auf einen Akkord-Chip aktiviert den Verschiebe-Modus (haptische Vibration, Chip wird lila hervorgehoben). Eine schwebende Lupe (`ChordLoupe`) zeigt den Akkord-Namen und einen 7-Zeichen-Ausschnitt der Lyric-Zeile mit dem aktuellen Ziel-Zeichen markiert. Finger horizontal bewegen -> Akkord folgt live, Loslassen committet die Position. Kurzer Tap auf den Chip oeffnet weiterhin das Keypad-Popover (Umbenennen / Loeschen).

Neue Zustand-Action `moveChord(line, fromCol, toCol)` in `useChordInput` - atomar, kein Overwrite fremder Akkorde.

### Nightly DB-Backup nach Dropbox (Cron)

Taeglich um 03:00 legt `backup_db.py` via SQLite-Backup-API einen konsistenten Snapshot an und laedt ihn in den Dropbox-Ordner `/backups/` hoch (letzte 7 Backups bleiben).

Status-Tracking in `app_settings`: Nach jedem Lauf werden `last_backup_at`, `last_backup_size` und `last_backup_error` geschrieben (Erfolg bzw. Fehler). Developer sehen den Status unter Settings → Dropbox: Zeitpunkt + Groesse des letzten Backups, und bei Fehlern einen roten Banner mit der Fehlermeldung. Endpoint: `GET /admin/backup-status` (min_role `developer`).

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
- **Autoscroll**: Im Fullscreen zentriert am unteren Rand sitzt der Speed-Stepper (`ChevronsDown` Toggle + −/Wert/+ analog zum Transpose-Stepper). 21 feine Stufen von `-10` bis `+10` (Normal `0` = 1×): `-10` entspricht 0.10×, `+10` entspricht 2.00× — je 10 Schritte links/rechts, Schrittweite 0.09× bzw. 0.10× auf Basis von 30 px/s. Anzeige zeigt den Stufenwert (`-3`, `0`, `+5`), nicht den Multiplikator. Funktioniert fuer PDF, TXT und CHO. Pausiert automatisch wenn Audio geladen ist und nicht spielt — oder laeuft frei wenn kein Track geladen ist (DocViewer-Modus). Stoppt automatisch beim Erreichen des Dokument-Endes. Setzt sich beim Trackwechsel zurueck. Auto-Fade nach 3s Idle wie die anderen FABs.
- **Page Up/Down im Autoscroll-Stepper**: Rechts im Stepper sitzen zwei ChevronUp/ChevronDown-Buttons — springen einen Viewport (mit 40px Overlap, smooth) nach oben/unten. Funktionieren unabhaengig vom Autoscroll-Toggle und ermoeglichen manuelles Bewegen in nicht sichtbare Bereiche.

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/DocumentPanel.tsx` | Einzeldokument-Viewer (Player- und DocViewer-Modus) |
| `frontend/src/components/ui/AnnotatedPage.tsx` | `<img>` + SVG-Overlay pro Seite |
| `frontend/src/components/ui/AnnotationToolbar.tsx` | Werkzeugleiste: Stift, Textmarker, Radierer |
| `frontend/src/components/ui/VideoViewer.tsx` | HTML5 Video-Player im Texte-Viewer (Dokumente) |
| `frontend/src/components/ui/VideoModal.tsx` | Video-Modal fuer .mp4 Dateien in der Browse-Seite |
| `frontend/src/components/ui/TextViewer.tsx` | Monospace-Textansicht |
| `frontend/src/components/ui/AutoScrollStepper.tsx` | Speed-Stepper fuer Autoscroll im Vollbild |
| `frontend/src/hooks/useAutoScroll.ts` | RAF-Loop fuer pixelgenaues Autoscrolling |
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

Vier Wege fuehren zu einer `.cho`-Datei:

1. **"Chordsheet einfuegen"** (Upload-Auswahl-Modal) — Akkord-Text aus Zwischenablage einfuegen
2. **"Datei auswaehlen"** + `.cho`-Datei — direkter Upload einer ChordPro-Datei
3. **"Chordsheet erstellen"** im `.txt`-Viewer — erzeugt leeres `.cho` auf Basis des Liedtexts, oeffnet direkt den Akkord-Editor (siehe ["Akkord-Eingabe per Tap"](#akkord-eingabe-per-tap))
4. **Format-Detection** beim Paste: erkennt automatisch, ob der Input bereits ChordPro ist oder im "Akkord-Zeile ueber Lyrics"-Stil (Ultimate Guitar)

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
- **Paper-Style**: `.cho`- und `.txt`-Viewer rendern unabhaengig vom App-Theme immer mit dunklem Text auf weissem "Papier"-Hintergrund — sowohl in Hell als auch in Dunkel. So bleibt der Lese-Komfort wie bei einem echten Notenblatt erhalten.

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

### Edit-Topbar (Akkorde bearbeiten / Text bearbeiten)

Oberhalb des Text- bzw. Chord-Sheet-Viewers liegt eine feste Edit-Topbar mit zwei nebeneinanderliegenden Buttons:

- **In `.txt`**: „Chordsheet erstellen" (Plus-Icon, Chord-Gelb) + „Text bearbeiten" (Stift-Icon, Violett)
- **In `.cho`**: „Akkorde bearbeiten" (Musik-Icon, Chord-Gelb) + „Text bearbeiten" (Stift-Icon, Violett)

Sichtbar nur fuer pro-member+ und nicht im Vollbildmodus. Jeder Button wechselt in den entsprechenden Edit-Modus, der die Topbar durch eine zweireihige Edit-Toolbar (Status + Close + Vorschau + Speichern) ersetzt.

### Akkord-Eingabe per Tap

Strukturierter Editor, mit dem Akkorde ohne ChordPro-Kenntnisse an exakte Zeichen-Positionen gesetzt werden — statt Syntax zu tippen, wird auf eine Silbe getippt und der Akkord aus einem Keypad zusammengebaut.

**Einstiegspunkte (via Edit-Topbar):**

- **In `.txt`** — „Chordsheet erstellen": erzeugt eine neue `.cho`-Datei mit gleichem Inhalt im selben `Texte/`-Ordner und oeffnet direkt den Editor.
- **In `.cho`** — „Akkorde bearbeiten": laedt das bestehende Chord-Sheet, parst die `[Akkord]`-Marker zu Zeichen-Offsets und ermoeglicht Aenderungen.

**Ablauf:**

1. Tap auf eine Silbe oeffnet ein Keypad-Popover
2. Akkord-Token aus Tasten zusammenbauen: Noten `A B C D E F G`, Modifier `♯ ♭ m maj sus dim aug`, Ziffern `2 4 5 6 7 9`, Slash fuer Bass-Note
3. Live-Preview mit Regex-Validierung — "Setzen"-Button erst aktiv bei gueltigem Akkord
4. Bestehender Akkord an der Position wird ersetzt, "Entfernen"-Button loescht ihn
5. Vorschau zeigt den generierten ChordPro-Text vor dem Speichern
6. Speichern **nur auf Knopfdruck** — kein Auto-Save
   - **Neues `.cho`** (aus `.txt`): legt eine Datei im `Texte/`-Ordner an
   - **Bestehendes `.cho`**: Bestaetigungs-Dialog warnt vor Ueberschreiben, danach In-Place-Update via `PUT /api/documents/{id}/content`

**Resume:** Arbeit unterbrechen = `.cho` einfach wieder oeffnen und "Akkorde bearbeiten" klicken. Gesetzte Akkorde werden aus der Datei rekonstruiert.

| Datei | Rolle |
|-------|-------|
| `backend/services/chord_export_service.py` | Build ChordPro aus Text + Positions-Liste (Offsets von hinten nach vorn) |
| `backend/api/chord_input.py` | `POST /api/chord-input/export` |
| `backend/api/documents.py` | `PUT /api/documents/{id}/content` (`.cho` und `.txt`) |
| `frontend/src/components/ui/TextEditViewer.tsx` | Freier Text-Editor fuer `.txt` und `.cho`-Quelle |
| `frontend/src/components/ui/EditTopbar.css` | Topbar mit zwei Edit-Buttons |
| `backend/services/dropbox_service.py` | `upload_file(overwrite=True)` fuer In-Place-Update |
| `frontend/src/utils/chordValidation.ts` | Regex-Validator fuer Akkord-Token |
| `frontend/src/utils/chordPositions.ts` | `parseChordPositions(body)` — ChordPro-Marker zu Offsets |
| `frontend/src/hooks/useChordInput.ts` | Zustand-Store: Chord-Map, `loadFromChordPro`, `updateCho` |
| `frontend/src/components/ui/ChordKeypadPopover.tsx` | Token-Builder-UI |
| `frontend/src/components/ui/ChordInputViewer.tsx` | Text-Layout mit tappbaren Zeichen, Preview-Overlay, Overwrite-Dialog |
| `frontend/src/components/ui/TextViewer.tsx` | "Chordsheet erstellen"-Button |
| `frontend/src/components/ui/ChordSheetTextViewer.tsx` | "Akkorde bearbeiten"-Button |

### Berechtigungen

| Aktion | Mindest-Rolle |
|--------|---------------|
| Chord Sheets ansehen | member |
| Transposition (auto-save) | member |
| Annotationen | member |
| Chordsheet einfuegen / Datei hochladen | pro-member |
| Chord Sheet loeschen | pro-member |
| Akkord-Eingabe per Tap (neu / bearbeiten) | pro-member |
| Text bearbeiten (.txt / .cho-Quelle) | pro-member |

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
- **Navigation in eine .song**: Die Song-Kachel selbst ist kein Button — Klicks ausserhalb der Multi-Button-Leiste haben keine Wirkung. Der Sprung in einen Unterordner erfolgt ueber die Buttons (Texte/Audio/Videos/Multitrack) auf der Kachel. Beim Audio-Sprung werden alle Audio-Dateien geladen, erster Track gesetzt (ohne Autoplay), Voice Bricks erscheinen. Beim Texte-Sprung mit genau einem Text wird direkt in den DocViewer navigiert.
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
- **Lösch-Modus** ueber Trash-Button am Ende der Marker-Zeile:
  - Klick auf Trash → Lösch-Modus an (Button rot, alle Marker werden weiss mit X-Symbol)
  - Klick auf einen weissen Marker → loescht diesen Marker
  - Klick auf "Alle löschen"-Icon (erscheint links in der Leiste) → loescht alle Marker
  - Erneuter Klick auf Trash → Lösch-Modus aus, verbliebene Marker wieder gruen
- Marker als Punkte auf der Waveform sichtbar
- Marker-Chips dienen als Looppunkt-Auswahl (siehe Cycle Play oben): erster Tap = pending (orange), zweiter Tap auf anderen Marker = Loop erstellen

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/MarkerRow.tsx` | Gemeinsame Marker-Leiste (Tap-Logik, Lösch-Modus) |
| `frontend/src/components/ui/PlayerControlsBar.tsx` | Bindet `MarkerRow` in die Player-Page ein |
| `frontend/src/components/layout/GlobalPlayerBar.tsx` | Bindet `MarkerRow` in den Global Player ein |
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
- **Ansichts-Modus pro Member** (Jam-Session-Mode): pro User kann Admin zwischen "Alles" (Default) und "Nur Texte" umschalten — analog zum Guest-Link-View-Mode. Nur Texte, Chord-Sheets und Noten sichtbar, kein Audio/Video. Chorleiter/Admin/Developer haben immer vollen Zugriff (Toggle deaktiviert). Ideal fuer Jam-Sessions, die spaeter zu einem echten Chor werden.
- **Bulk-Umschaltung**: Toolbar oben schaltet mit einem Klick alle Member/Pro-Member auf "Nur Texte" oder "Alles". Chorleiter/Admin werden automatisch uebersprungen.
- **Default-Ansicht pro Chor** (`choir.default_view_mode`): Admin waehlt in den Einstellungen, welchen Ansichtsmodus neue Mitglieder beim Registrieren oder beim Anlegen durch den Admin standardmaessig bekommen. Bestehende Mitglieder bleiben unveraendert — fuer die ist die Bulk-Umschaltung in der Nutzerverwaltung gedacht.
- Frontend sperrt den UI-seitigen View-Toggle, wenn `user.view_mode === 'texts'` (ueber `viewModeStore.applyUserViewMode`).

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/admin/UsersPage.tsx` | User-Verwaltungs-UI (incl. View-Mode-Toggle + Bulk-Toolbar) |
| `frontend/src/pages/SettingsPage.tsx` | Default-Ansicht-Section (Admin) |
| `frontend/src/stores/viewModeStore.ts` | `applyUserViewMode(user)` synchronisiert Store mit `user.view_mode` |
| `backend/api/admin.py` | `/admin/users` Endpoints, `POST /admin/users/bulk-view-mode`, `default_view_mode` in `/admin/settings` |
| `backend/api/auth.py` | `register` uebernimmt `choir.default_view_mode` fuer neue Mitglieder |
| `backend/models/user.py` | Feld `view_mode` ("songs" \| "texts", Default "songs") |
| `backend/models/choir.py` | Feld `default_view_mode` ("songs" \| "texts", Default "songs") |

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
- Oeffnet Drawer mit Liste der **offenen** Issues (von GitHub geladen, 60s Cache)
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
| GET | `/issues` | Offene GitHub Issues auflisten | `can_report_bugs` |
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

### ChordPro: Multi-Directive-Zeile frisst ueber `}` hinaus

Eine Quellzeile wie `{title: Sonnenbadewanne} {comment: 3. Bund}` wurde als **ein** Directive interpretiert: die Value-Regex `.*?` expandierte lazy bis zur **letzten** `}` auf der Zeile — Titel-Wert wurde zu `"Sonnenbadewanne} {comment: 3. Bund"`. Fix: Value auf `[^}]*` begrenzt (stoppt an der ersten `}`) und Block-Directive-Erkennung akzeptiert mehrere `{...}`-Bloecke pro Zeile; jeder wird einzeln verarbeitet.

### ChordPro: Directive-Namen mit Leerzeichen

`{start of verse: Vers 1}` (Leerzeichen statt Unterstrich) fiel durch `[a-z_]+` und wurde als Literaltext gerendert. Fix: Name-Regex erlaubt `[a-z_ ]` und normalisiert via `raw.trim().toLowerCase().replace(/\s+/g, '_')` zum kanonischen Namen, bevor der Switch greift.

### ChordPro: Akkord-Anker-Unterlaengung unsichtbar bei `j`/`g`/`p`

`text-decoration: underline` wurde vom Browser unter Unterlaengen-Zeichen gesplittet (Skip-Ink-Default). Bei einem einzeln gespannten `j` am Zeilenanfang (`[F#m7]ja, ich...`) verschwand die Linie komplett. Fix: `text-decoration-skip-ink: none` in `.chord-anchor` und `.chord-input-char--has-chord`.

### ChordPro: Generische Section-Direktiven (ChordPro 6)

`{start_of_intro}`, `{start_of_solo}`, `{start_of_outro}` etc. wurden stillschweigend verschluckt, weil der Switch nur `verse`/`chorus`/`bridge` kannte. Jetzt matcht der Parser generisch `start_of_<label>` / `end_of_<label>` (ChordPro 6 "labeled environments") — der Section-Typ wird ueber `classifySectionType(label)` bestimmt, das Display-Label aus dem Direktiv-Wert oder dem kapitalisierten Label.

### ChordPro: Major-Akkorde mit grossem M (FM7, CMaj7) nicht erkannt

`CHORD_TOKEN_RE` akzeptierte nur das Moll-`m` und das lowercase `maj` — Schreibweisen mit grossem `M` (`FM7`, `CMaj7`) fielen durch und wurden als Literaltext `[FM7]` gerendert. Fix: `M(?:aj)?` als zusaetzliche Qualitaets-Variante in `chordPro.ts` und `chordParser.ts`.

### ChordPro: Reine Akkord-Zeilen stapeln sich

Instrumental-Zeilen wie `[Em] [D/F#] [G] [C]` rendern alle Akkorde uebereinander auf Spalte 0-3, weil `parseInlineChordLine` die Akkord-Breite nicht beruecksichtigte — jeder weitere Akkord hing an der aktuellen Laenge des Clean-Texts (nur Leerzeichen zwischen den Brackets). Gleicher Effekt am Zeilenende, wenn nach einem Lyric-Akkord mehrere chord-only Tokens folgen (z.B. `[Em]rainbow[D/F#] [G] [C]`).

**Fix:** Beim Platzieren eines Akkords garantiert der Parser jetzt mindestens ein Leerzeichen hinter dem vorangehenden Akkord (fuellt den Clean-Text bei Bedarf mit Spaces auf). Regression-Test deckt den Fall ab.

### Nutzer in Admin-UI nicht loeschbar (Internal Server Error)

Das Loeschen von Nutzern mit Favoriten, Labels, Notizen, Annotationen,
Session-Tokens oder anderen abhaengigen Datensaetzen warf einen 500er
(Foreign-Key-Constraint), weil `DELETE /api/admin/users/{user_id}` den
User ohne Aufraeumen der abhaengigen Tabellen loeschen wollte. Dasselbe
Problem betraf `DELETE /api/admin/choirs/{choir_id}` teilweise
(`UserChordPreference`, `UserSelectedDocument`, `GuestLink` wurden dort
nie geloescht).

**Fix:**

- `backend/api/admin.py::delete_user`: Vor dem `session.delete(target)`
  werden jetzt alle abhaengigen Zeilen in `Favorite`, `UserLabel`,
  `Annotation`, `Note`, `SessionToken`, `UserHiddenDocument`,
  `UserChordPreference`, `UserSelectedDocument` und `GuestLink`
  (als Creator) entfernt.
- `delete_choir` um die drei fehlenden Modelle erweitert, damit ein
  Chor mit aktiven Chorleitern/Gast-Links ebenfalls sauber geloescht
  werden kann.

### Gast-Session laeuft nach 2h ab, unabhaengig von der Link-TTL

Der Admin konnte zwar eine Gast-Link-TTL bis 24 h setzen, aber die
Gast-Session selbst hatte eine hardcoded Obergrenze von 2 h
(`GUEST_SESSION_TTL_SECONDS = 2 * 3600` in `guest_link_service.py`).
Folge: Gaeste wurden nach 2 h (bzw. bei kurz gesetzter Link-TTL
frueher) rausgeworfen, obwohl der Link laut UI noch viel laenger gueltig
war.

**Fix:**

- Session-TTL = verbleibende Link-Laufzeit bei der Einloesung (im
  `redeem`-Handler in `backend/api/guest_links.py`).
- Obergrenze fuer die Link-TTL von 24 h auf 36 h angehoben
  (`MAX_LINK_TTL_MINUTES = 36 * 60`), Untergrenze auf 1 h
  (`MIN_LINK_TTL_MINUTES = 60`) — die Admin-UI zeigt die Werte jetzt
  konsistent in Stunden statt Minuten an.
- Frontend-Eingabefeld in `GuestLinksPage.tsx` auf Stunden-Einheit
  umgestellt; intern weiterhin Umrechnung in Minuten fuer die API.

### Rename von Dateien/Ordnern warf 500 (NameError Favorite)

Nach dem Phase-4-Fix fuer "User-Daten an stabile Anker binden" (`0a48503`) referenzierte `backend/api/dropbox.py` das Modell `Favorite` direkt in der `select()`-Query, obwohl der lokale Funktions-Import als `Favorite as _Fav` eingebracht wurde. `Favorite` ist auf Modulebene nicht importiert — jeder `/dropbox/rename`-Aufruf warf damit nach dem erfolgreichen Dropbox-Move einen `NameError: name 'Favorite' is not defined`, die DB-Transaktion lief nie, FastAPI antwortete 500. Sichtbar wurde es zuerst beim Umbenennen von Dokumenten in `/Texte`, betraf aber alle Rename-Operationen.

**Fix:**

- `backend/api/dropbox.py`: Die drei `Favorite`-Referenzen im Favoriten-Migrations-Loop auf das vorhandene Alias `_Fav` umgestellt, konsistent mit `_Note`/`_UL`/`_Sec` direkt darunter.

### Permission-System: zentrale Policy statt verstreuter require_role-Calls

Die Rollen-Enforcement war urspruenglich auf ~12 Router-Dateien verstreut als `require_user` / `require_role("pro-member")` / `require_admin`-Dependencies. Das hatte drei Probleme:

1. Aenderungen an Berechtigungen erforderten, 80+ Endpoints manuell abzugleichen — fehleranfaellig und ohne zentrale Uebersicht.
2. `DELETE /api/documents/{id}` erlaubte `pro-member`, die FEATURES.md-Matrix forderte aber `chorleiter+` (GAP #1 — stille Diskrepanz seit langem).
3. Die zukuenftige Einfuehrung von Distributionen (Demo/Basis/Pro o.ae.) war nicht vorbereitet — haette einen erneuten Rundumschlag ueber alle Router erzwungen.

**Struktureller Fix:**

Einfuehrung einer vierstufigen Policy-Struktur (`Distribution → Feature → Permission → Route`) in `backend/policy/permissions.json` als alleinige Quelle der Wahrheit. Neue FastAPI-Dependency `require_permission("...")` ersetzt `require_user` / `require_role` in allen 80+ Endpoints. Beim App-Start prueft ein Konsistenz-Check, dass jede registrierte Route in der Policy steht — neue Endpoints ohne Policy-Eintrag scheitern am Startup statt still durchzurutschen.

- `backend/policy/permissions.json` — eine JSON mit `roles`, `features`, `permissions`, `routes`, `public_routes`
- `backend/policy/engine.py` — `PolicyEngine.can(role, perm)` + `validate_routes_against_policy(app)` Start-Check
- `backend/policy/dependencies.py` — `require_permission()` / `require_permission_query()` mit differenzierten Fehler-Codes (`permission_denied` vs. `feature_not_available`)
- `CHOIRBOX_DISTRIBUTION` in `.env` waehlt aktive Distribution (Default `full`); `developer` umgeht den Distribution-Check fuer Test-Zwecke
- 80+ Endpoints in `favorites.py`, `labels.py`, `annotations.py`, `notes.py`, `sections.py`, `section_presets.py`, `documents.py`, `dropbox.py`, `admin.py`, `feedback.py`, `auth.py` migriert
- `ROLE_HIERARCHY` / `VALID_ROLES` in `auth.py` sind jetzt Lazy-Loader, die die Werte aus der Policy ziehen — eliminiert Drift
- GAP #1 behoben: `DELETE /api/documents/{id}` und `DELETE /api/dropbox/file` brauchen jetzt `documents.delete` (Min-Rolle `chorleiter`), passt damit zur FEATURES.md-Matrix
- 41 neue Tests in `backend/tests/test_policy.py` decken Engine (25 parametrisierte Rollen × Permissions), Start-Check, Distribution-Feature-Gating, Developer-Bypass und HTTP-Enforcement am lebenden FastAPI-Client ab — inkl. Regressionstest, dass `pro-member` keine Dokumente loeschen kann und `chorleiter` schon

### Back-zur-Suche fiel auf Root zurueck nach DocViewer-Zwischenstopp

Das ursprungliche Feature in `e947691` hat `searchReturnQuery` in lokalem React-State gehalten, das erste Followup `3c6801c` hat die Meta-Brick-Handler zum State ueberfuhrt. Beides patchte das Symptom aber nicht die Ursache: `BrowsePage` hatte eine eigene interne State-Machine (`loadFolder`, `searchOpen`), die voellig am React-Router-History-Mechanismus vorbeilief. Jede Router-Navigation (zum DocViewer) unmountete die Page und verwarf den State. Folge: Back aus dem DocViewer landete auf Root, nicht in der Suche.

**Struktureller Fix:**

Browse-Pfad und Such-State leben jetzt ausschliesslich in den URL-Search-Params (`/browse?p=<path>` oder `/browse?q=<query>`). Jede Navigation pusht eine echte React-Router-History-Entry, dadurch funktioniert `navigate(-1)` / Browser-Back / DocViewer-Back automatisch und unwindet Schritt fuer Schritt bis zurueck zur Suche.

- `searchOpen`/`searchQuery`/`searchReturnQuery` (lokaler State) → `useSearchParams` + `useLocation` als Single Source of Truth
- `loadFolder(path, forceRefresh, opts)` ist jetzt ein Navigate-Wrapper; gleicher logischer Pfad → direct `storeLoadFolder`-Refresh ohne Navigate, anderer Pfad → `navigate()` push
- `openSearch()` pusht `/browse?q=` mit `state: {fromPath}`, `closeSearchExplicit()` unwindet via `navigate(-1)` (Fallback `navigate('/browse', {replace})`)
- `handleBackFromSong` entfernt, Song-Back-Breadcrumb ruft `navigate(-1)`
- Breadcrumb-Label liest `location.state.fromSearch` und rendert `"< Suche"` (sonst Song-Name)
- `handleEntryClick` und Meta-Brick-onClicks propagieren `{fromSearch: searchOpen && len>=2}` an `loadFolder`
- `isSameLogicalPath`-Check vergleicht URL-Param `p` statt `location.pathname`, damit `/` und `/browse` mit gleichen Params als identisch gelten (sonst haette der Refresh-Button am initialen `/`-Route eine neue History-Entry gepusht)
- Favoriten-Toggle navigiert zu `/browse` statt direkt `store.browsePath = ''` zu setzen (sonst divergiert URL und Store)

### Service Worker brach Audio-Streaming auf Prod

Nach dem PWA-Asset-Fix (`/sw.js` wird seitdem korrekt ausgeliefert) registrierte sich der Service Worker erstmals tatsaechlich auf Prod. Sein `fetch`-Handler fing aber **alle** Requests im Scope ab — auch cross-origin Requests an die Dropbox-CDN. HTML5-Audio braucht fuer Streaming HTTP-Range-Requests (206 Partial Content), die durch das Durchreichen via `event.respondWith(fetch(request))` brachen. Folge: `audio.play()` wurde rejected, Duration blieb 0:00, der Play-Button reagierte sichtbar nicht. Auf localhost trat der Bug nicht auf, weil der SW per `import.meta.env.PROD` nur in Production-Builds registriert wird.

**Fix:**

- `frontend/public/sw.js`: Cross-Origin-Requests werden vor `respondWith` komplett abgegeben (`new URL(request.url).origin !== self.location.origin → return`). Audio-Streams gehen damit wieder direkt vom Browser an die Dropbox-CDN, ohne SW-Umweg.
- Cache-Name auf `choirbox-v3` gebumpt, damit User-Browser den alten kaputten SW ersetzen.
- `frontend/src/hooks/useAudioPlayer.ts`: `error`-Listener auf dem Audio-Element ergaenzt, beide `play().catch(...)` loggen jetzt den Grund. Vorher schluckte der Hook jeden Lade-/Play-Fehler stillschweigend.

### Favoriten, Notizen und Labels verschwanden bei jedem Datei-Rename

Die User-Daten-Tabellen `favorites`, `notes` und `user_labels` referenzierten die jeweilige Datei nur ueber `dropbox_path` (String). Wurde eine Datei in Dropbox umbenannt, fand der Resync-Cleanup-Sweep den alten Pfad nicht mehr im Listing und loeschte den Row.

**Fix (Phase 4 Datenmodell-Stabilisierung):**

- `favorites`: neue Spalten `song_id`, `document_id`, `audio_file_id`. `entry_type` erweitert um `'song' | 'document' | 'audio'` (legacy `'file'/'folder'` bleiben lesbar).
- `notes`: neue Spalte `target_file_id` (Dropbox-File-ID).
- `user_labels`: neue Spalte `target_file_id`.
- Neuer Service `path_resolver.resolve()` uebersetzt einen choir-relativen Pfad in einen stabilen Anker (Song/Document/Audio-File-ID). Wird beim Anlegen jedes neuen Favorit/Note/UserLabel aufgerufen.
- `dropbox_rename`: hat bisher nur `AudioMeta` umgehaengt. Schreibt jetzt Pfad-Caches aller pfad-basierten User-Daten (Favoriten, Notizen, UserLabels, Sections, Documents, UserSelectedDocuments, Songs) auf den neuen Pfad um. Funktioniert sowohl fuer einzelne Dateien (Pfad-Match) als auch fuer Ordner (Praefix-Replacement).
- `resync_all` Cleanup-Sweep: Favoriten/Notes/UserLabels werden primaer ueber ihre stabile ID gegen Dropbox abgeglichen. Nur Legacy-Rows ohne ID fallen auf den Pfad-Vergleich zurueck.
- Neues Skript `python -m scripts.user_data_backfill [--dry-run]` resolved bestehende Favorite/Note/UserLabel/UserSelectedDocument-Rows einmalig auf ihre Dropbox-IDs (braucht aktive Dropbox-Verbindung pro Chor).

### Admin-Bereich "Datenpflege"

Neue Admin-Seite unter `/admin/datacare` (Settings → Wartung → Datenpflege). Drei Tabs:

1. **Songs** — listet `songs`-Rows mit `status='orphan'` (Ordner in Dropbox nicht mehr auffindbar, aber User-Daten zeigen noch hin). Pro Eintrag wird die Anzahl angehaengter Sections, Documents und Favoriten gezeigt. Aktionen: **Wiederfinden** (per Pfad-Eingabe an einen anderen Dropbox-Ordner anbinden, Status zurueck auf `active`) oder **Endgueltig loeschen** (samt aller abhaengigen Rows ueber `document_service.delete_document`).
2. **Dokumente** — Documents ohne `dropbox_file_id` (Backfill nicht aufgeloest). Aktion: **Endgueltig loeschen**.
3. **User-Daten** — Legacy-Favoriten/Notes/UserLabels ohne stabile ID. Aktion: einzeln **Loeschen**.

Backend-Endpoints unter `/admin/datacare/...`. Nur fuer Admins.

### Folder-Renames in Dropbox loeschten Sections und Document-Bezuege

Wurde ein .song-Ordner in Dropbox umbenannt (z.B. `Fragile.song` → `Fragile - Sting.song`), erkannte der Sync das nicht: alle `Section`s mit dem alten `folder_path` sowie alle `Document`s im darunter liegenden `Texte`-Ordner wurden vom Cleanup-Sweep als verwaist betrachtet und geloescht. Folge: Lyrics, Marker und Annotationen waren bei jeder Umbenennung futsch.

**Fix (Phase 3 Datenmodell-Stabilisierung):** Neue Tabelle `songs` als stabiler Anker — Spalten `id`, `folder_path`, `name`, `dropbox_file_id` (unique nullable), `status` ('active' | 'orphan'), `updated_at`. `documents`, `sections` und `user_selected_documents` haben jetzt eine optionale `song_id`-FK.

Der Resync identifiziert beim rekursiven Listing alle `.song`-Ordner per Dropbox-File-ID und upserted sie ueber `song_service.upsert_song`. Beim Folder-Rename wird der `songs`-Row gefunden (per stabiler ID) und sein `folder_path`/`name` aktualisiert — die zugehoerigen Sections und Documents bleiben ueber `song_id` verbunden, ohne neue Pfade ueberall durchpropagieren zu muessen. Songs ohne Match in Dropbox werden auf `status='orphan'` gesetzt (Phase-4-Admin-UI raeumt sie spaeter auf).

`_sync_documents_from_dropbox` haengt neue Documents direkt an die richtige `song_id`. `auto_select_if_first_doc` und der `/documents/select`-Endpoint setzen die `song_id` auf `UserSelectedDocument` mit.

### Datei-Renames in Dropbox loeschten Document-Row, Annotationen und Transponierungen

Vor Phase 2 hat `_sync_documents_from_dropbox` Documents ueber den Dateinamen gematcht. Bei einem Rename in Dropbox tauchte der alte Name nicht mehr in der Listing-Antwort auf → Sync rief `delete_document` auf der alten Datei auf → die neue Datei wurde als komplett neues Document angelegt. Folge: handschriftliche Annotationen, ChordPro-Transponierungen und alle Per-User-Settings auf der umbenannten Datei waren weg.

**Fix (Phase 2 Datenmodell-Stabilisierung):** `documents` hat eine neue Spalte `dropbox_file_id` (Dropbox-stabile ID, ueberlebt Rename und Move). Der Sync matcht jetzt primaer ueber diese ID und absorbiert Renames stillschweigend (nur `original_name`, `folder_path`, `dropbox_path` werden aktualisiert, die `documents.id` bleibt). Documents werden nur noch geloescht, wenn die Dropbox-File-ID wirklich verschwunden ist. Beim ersten Sync nach dem Update wird die `dropbox_file_id` per Name-Match befuellt (Backfill). Partial Unique Index `ux_documents_dropbox_file_id` verhindert Doubletten.

`delete_document` raeumt ab Phase 2 zusaetzlich `UserChordPreference` und `UserSelectedDocument` mit auf — bisher blieben das Orphans nach jeder Document-Loeschung. Annotationen werden ebenfalls mit geloescht, weil `delete_document` jetzt nur noch bei *echter* Loeschung in Dropbox aufgerufen wird (Renames werden vom ID-Matching abgefangen).

### FK-Constraints in SQLite bisher deaktiviert — stille Orphans

`backend/database.py` setzte beim Connect zwar `journal_mode=WAL` und `busy_timeout`, aber **nicht** `PRAGMA foreign_keys=ON`. Damit ignoriert SQLite alle Foreign-Key-Definitionen aus den SQLModels. Folge: Beim Loeschen von Documents/Users/Labels blieben Orphans in `user_chord_preferences`, `user_selected_documents`, `session_tokens` etc. zurueck — bei Production-DB lokal 79 Stueck.

**Fix (Phase 1 Datenmodell-Stabilisierung):** PRAGMA foreign_keys=ON ist jetzt im Connect-Listener aktiv. Zwei neue Skripte zur einmaligen Aufraeumung:

- `python -m scripts.audit_orphans` — zaehlt Orphans pro FK, exit 1 wenn welche gefunden werden
- `python -m scripts.clean_orphans [--dry-run]` — loescht nachweislich tote Verweise

Vor Deploy auf Staging/Prod: erst `audit_orphans`, dann `clean_orphans --dry-run`, dann echtes Cleanup, dann den Phase-1-Commit deployen.

### Annotationen verschwanden bei jedem Datei-Rename in Dropbox

Wenn eine PDF in Dropbox umbenannt wurde, hat der naechste Sync ein `delete_document` auf die alte Datei ausgefuehrt. `delete_document` hat dabei alle zugehoerigen `Annotation`-Eintraege mit geloescht — obwohl die Datei inhaltlich identisch war und auf der neuen Datei wieder angezeigt werden sollte. Folge: jede Umbenennung war datenzerstoerend.

**Fix (Phase 0 Datenmodell-Stabilisierung):** `delete_document` loescht keine Annotationen mehr. Die Annotationen bleiben als verwaiste Eintraege stehen, bis Phase 2 sie ueber die stabile `dropbox_file_id` wieder am neuen Document-Row matcht. Bis dahin: nichts mehr verlieren.

### GlobalPlayerBar nicht theme-faehig im Hellmodus

Der Floating Global Player nutzte hartkodierte dunkle Farben (`#252D40` Hintergrund, `rgba(228,232,238,...)` Buttons/Slider), waehrend die inneren Buttons mit dem theme-abhaengigen `var(--text-secondary)` arbeiteten. Folge im Hellmodus: Player blieb dunkel, Icons (Dokument, Loop, Marker, Skip-Label) wurden mit dunkelgrauem Text auf dunklem Hintergrund nahezu unsichtbar. Fix: Alle hartkodierten Werte in `.global-player`, `.seek-bar-*`, `.gpc-btn-skip` und `.gpc-btn-play` durch Theme-Tokens ersetzt (`--bg-secondary`, `--bg-tertiary`, `--accent`, `--text-primary`, `--text-secondary`, `--shadow-lg`, `--border`) — analog zum bereits korrekten `.top-player-bar`.

### Erster Text/Chordsheet per Paste-Upload nicht als ausgewaehlt markiert

Beim Hochladen eines `.txt` oder `.cho` ueber das "Text einfuegen" / "Chordsheet einfuegen" Modal wurde das Dokument zwar in der DB registriert, aber nie als `UserSelectedDocument` markiert. Folge: `selected_doc` blieb `null`, der Klick auf den Song oeffnete nicht den DocViewer, sondern lief in die Subfolder-Fallback-Kette. Der `/upload`-Endpoint hatte die Auto-Select-Logik inline, der `/paste-text`-Endpoint jedoch nicht.

**Fix:** Die Auto-Select-Logik wurde in `document_service.auto_select_if_first_doc()` ausgelagert und wird jetzt von beiden Upload-Endpoints (`/upload`, `/paste-text`) aufgerufen. Damit wird der erste Text in einem Song-Ordner konsistent als ausgewaehlt gesetzt, unabhaengig vom Upload-Weg.

### Bugreporter zeigte auch geschlossene Issues (#63)

Der Edge-Bug-Drawer listete sowohl offene als auch geschlossene Issues mit `geschlossen`-Label und Statszeile `X offen · Y geschlossen`. Fix: Backend fragt GitHub nur noch mit `state=open` ab, Frontend zeigt nur die Anzahl offener Issues; Closed-Label und zugehoeriges CSS entfernt.

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

### Topbar scrollt auf Settings & Admin-Seiten mit dem Inhalt weg

Der Topheader (`.topbar`) der Settings-Seite war `position: static` und scrollte beim Scrollen der Seite mit nach oben aus dem Viewport. Gleiches galt fuer alle Admin-Unterseiten (Nutzer, Labels, Sektionsvorlagen, Choere), die das gleiche Layout-Pattern (plain `<div>` Wrapper im `.main-content`-Scroll-Container) nutzen. Fix: `.topbar` ist jetzt global `position: sticky; top: 0; z-index: 10` — bleibt am oberen Rand kleben, waehrend der Inhalt darunter scrollt. `.topbar--hidden` ueberschreibt das weiterhin mit `position: absolute` fuer den Fullscreen-Modus im PDF-Viewer.

## Sicherheit

### Security Headers Middleware

Jede HTTP-Response setzt jetzt baseline Security-Header: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=()` und eine `Content-Security-Policy`, die nur Self-Origin sowie die Dropbox- und GitHub-API-Domains erlaubt. `microphone=(self)` ist erlaubt, weil der `useRecorder`-Hook MediaRecorder fuer Aufnahmen nutzt. HSTS wird bewusst nicht in der App gesetzt, sondern muss vom Reverse-Proxy (Caddy/nginx) konfiguriert werden.

### Query-String-Token entfernt

`get_current_user` akzeptiert nur noch Tokens via `Authorization: Bearer`-Header. Der frueher unterstuetzte `?token=...`-Fallback landete in Server-Logs, Browser-History und Referer-Headern. Fuer die wenigen Endpoints, die wegen `<img src>` (PDF-Page-Rendering) bzw. `<a href download>` (Download-Link) keine Custom Header senden koennen, gibt es eine separate `require_user_query`-Dependency. Sie wird nur von `/api/documents/{id}/page/{page}` und `/api/documents/{id}/download` verwendet.

### SECRET_KEY ohne vorhersagbaren Default

Der hartcodierte Dev-Default `"dev-secret-change-in-production"` wurde entfernt. Bei fehlendem `SECRET_KEY` in der `.env` wird zur Laufzeit ein zufaelliger 32-Byte-Hex-Key erzeugt und eine Warning ausgegeben. So kann auch eine versehentlich nicht gesetzte Production-Konfiguration nicht mehr mit einem bekannten Default-Schluessel laufen.

### Dropbox Refresh Token in der DB verschluesselt

Der Dropbox Refresh Token wird vor dem Speichern symmetrisch verschluesselt (Fernet, Key per SHA256 aus `SECRET_KEY` abgeleitet). Beim Lesen entschluesselt der `dropbox_service` automatisch. Eine einmalige Migration in `on_startup` verschluesselt vorhandene Klartext-Tokens beim ersten Start. Backward-Compat: alte Klartext-Tokens funktionieren weiter, bis sie beim naechsten Reconnect (oder durch die Migration) verschluesselt sind.

### CORS Whitelist

`CORSMiddleware` mit expliziter Origin-Whitelist (`https://cantabox.de`, `http://localhost:5174`, `http://localhost:8001`). Andere Origins werden vom Browser-CORS-Mechanismus blockiert.

### OAuth Callback Redirect dynamisch

Der Dropbox-OAuth-Callback nutzt jetzt `request.base_url`, um das Redirect-Ziel dynamisch zu bestimmen. In Production landet der Nutzer wieder auf `https://cantabox.de`, in Development auf Vite (`http://localhost:5174`). Der frueher hartcodierte `localhost:5174`-Redirect wurde entfernt.

### Impressum und Datenschutzerklaerung

Statische Seiten unter `/impressum` und `/datenschutz` mit Platzhalter-Inhalten gemaess TMG/DSGVO. Werden vom Backend ausgeliefert; im Dev-Mode leitet der Vite-Proxy beide Pfade ans Backend weiter. Links sind im Footer der Login-Seite und am Ende der Settings-Seite verlinkt (jeweils in neuem Tab).
