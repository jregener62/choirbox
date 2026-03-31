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

### Datei-Aktionen (Swipe & Drei-Punkte-Menue)

Jede Audio-Datei hat rechts ein Drei-Punkte-Menue (EllipsisVertical). Ein Tap darauf oder Swipe nach links enthuellt die Aktions-Buttons:

- **Favorit** (Herz): Datei als Favorit markieren/entfernen
- **Label** (Tag): Label-Picker-Overlay oeffnen, Labels zuweisen/entfernen
- **Datei-Einstellungen** (Info): Oeffnet die Datei-Einstellungen-Seite fuer diese Datei
- **Loeschen** (Papierkorb): Nur fuer Chorleiter (Level 3) und Admin (Level 4) sichtbar. Bestaetigungsdialog vor dem Loeschen.
- Tippen auf ein anderes Element oder erneutes Tippen auf die drei Punkte schliesst das Menue
- Einfach-Tap auf eine Datei oeffnet direkt den Player (kein Doppelklick noetig)

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/BrowsePage.tsx` | Swipe-UI, Drei-Punkte-Button, Label-Picker-Overlay, Loeschlogik |
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

## Datei-Einstellungen

Zentrale Stelle fuer dateibezogene Einstellungen. Aktuell: Sektionsreferenz und PDF-Referenz — beide unabhaengig voneinander konfigurierbar.

### Sektionsreferenz

Dateien koennen eine andere Datei als Sektionsquelle referenzieren. Sektionen werden dann von der Referenz-Datei geladen und dort gespeichert — z.B. fuer Stems, wo Sektionen nur einmal definiert, aber bei allen Stimmen angezeigt werden. Standalone-Dateien sind davon nicht betroffen (Standardverhalten: eigene Sektionen).

Zwei Wege:
- **Uebernehmen:** Eine Datei holt sich Sektionen von einer anderen Datei im selben Ordner
- **Uebertragen:** Eine Datei setzt sich als Sektionsquelle fuer ausgewaehlte andere Dateien im selben Ordner

Die Referenz-Aufloesung passiert im Backend — das Frontend muss nicht wissen, ob Sektionen direkt oder via Referenz geladen werden. Beim Erstellen/Bearbeiten von Sektionen wird ebenfalls aufgeloest: Sektionen werden immer gegen die Referenz-Datei gespeichert.

### PDF-Referenz

Dateien koennen eine andere Datei als PDF-Quelle referenzieren. Funktioniert identisch zur Sektionsreferenz — unabhaengig davon. Z.B. koennen alle Stimmlagen auf dieselben Noten verweisen, ohne die Sektionen zu teilen.

Gleiche zwei Wege wie bei Sektionen:
- **Uebernehmen:** Eine Datei zeigt das PDF einer anderen Datei im selben Ordner
- **Uebertragen:** Eine Datei setzt sich als PDF-Quelle fuer ausgewaehlte andere Dateien im selben Ordner

Die Referenz-Aufloesung passiert im Backend via `pdf_ref_path` in FileSettings. Im Player zeigt das `is_ref`-Flag an, dass das PDF von einer referenzierten Datei stammt (Loeschen/Ersetzen dann nicht moeglich).

### Zugang

- **Browse-Page:** Info-Button in den Swipe-Actions jeder Datei
- **Player-Page:** Kebab-Menue-Eintrag "Datei-Einstellungen"
- Route: `/#/file-settings?path=<dropbox_path>`

### Berechtigungen

- Lesen: Alle eingeloggten User
- Aendern: Pro-Mitglied und hoeher

### UI-Aufbau

Generischer `RefEditor` wird fuer beide Felder (Sektionen, PDF) wiederverwendet:
- Radio-Auswahl: "Eigene" (Standard) / "Uebernehmen von: [Datei-Dropdown]"
- Info-Text zeigt Vorschau (Sektionsanzahl bzw. PDF-Name)
- Propagieren: Checkboxen fuer Geschwister-Dateien + "Uebertragen"-Button

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/FileSettingsPage.tsx` | Einstellungen-UI mit generischem RefEditor |
| `backend/api/file_settings.py` | `GET/PUT /file-settings`, `POST /file-settings/propagate` |
| `backend/models/file_settings.py` | FileSettings-Modell (`section_ref_path`, `pdf_ref_path`) |
| `backend/api/sections.py` | Sektions-Referenz-Aufloesung |
| `backend/services/pdf_service.py` | PDF-Referenz-Aufloesung |

---

## PDF-Dokumente im Player

PDF-Dateien (Noten, Texte, Anweisungen) koennen pro Audio-Datei hochgeladen und direkt im Player angezeigt werden. PDFs werden lokal auf dem Server und als Backup in Dropbox gespeichert. Sie erscheinen nicht im Datei-Browser (Browse-API filtert auf Audio-Dateien).

### Ansicht

- **Dot-Indikatoren** zwischen Player-Controls und Content-Bereich: zwei Punkte (aktiver Punkt als Pille)
- **Panel-Wechsel** per Tippen auf Dots oder horizontalem Swipe ueber die DotBar
- Dots nur sichtbar wenn PDF vorhanden oder User pro-member+ ist
- Ohne PDF und ohne pro-member-Rolle: klassische Sektionsliste ohne Dots
- **PDF-Rendering**: Server rendert PDF-Seiten on-the-fly als JPEG (PyMuPDF, 200 DPI). Frontend zeigt `<img>`-Tags — natives Pinch-to-Zoom auf iOS und allen Plattformen
- **Pinch-to-Zoom**: JS-basierter Touch-Handler (1x–5x), aendert Bildbreite dynamisch. Container scrollt nativ bei Zoom. Double-Tap togglet 1x/2.5x
- **PDF-Toolbar**: Dateiname + Seitenzahl, Upload/Ersetzen/Loeschen-Buttons (pro-member+), Download
- **Loeschen**: Sicherheitsabfrage (Confirm-Dialog) vor dem Loeschen, identisch zu Audio-Dateien
- Swipe-Zone nur auf DotBar — kein Konflikt mit Scroll oder Pinch im Content

### PDF Fullscreen-Modus

- **Floating Action Button (FAB)** rechts unten auf dem PDF-Panel: Maximize-Icon zum Aktivieren, Minimize-Icon zum Deaktivieren
- **Aktivierung**: Tap auf FAB blendet TopBar, DotBar und GlobalPlayerBar mit Slide-Animation (300ms ease) aus — das PDF nutzt den gesamten Bildschirm
- **Progress-Ring**: Im Fullscreen zeigt ein SVG-Ring um den FAB die aktuelle Abspielposition
- **Auto-Fade**: FAB fadet nach 3 Sekunden Inaktivitaet auf 30% Opazitaet. Jede Beruehrung der PDF-Flaeche stellt volle Sichtbarkeit wieder her
- **Audio laeuft weiter** — nur die UI-Elemente werden versteckt
- **Reset-Logik**: Fullscreen wird automatisch aufgehoben bei Panel-Wechsel (zurueck zu Sektionen) oder Navigation weg vom Player

### Handschriftliche Annotationen

Chormitglieder koennen auf den angezeigten PDF-Seiten handschriftliche Markierungen machen — z.B. Atemzeichen, Dynamik, Einsaetze. Jeder User sieht nur seine eigenen Annotationen.

- **Zeichenmodus-Toggle**: Floating Action Button (Stift-Icon) unten-links auf dem PDF-Panel. Wird blau wenn aktiv
- **Zeichenwerkzeuge**: Stift, Textmarker (halbtransparent, 3x breiter), Radierer (ueber Striche streichen loescht sie, Distanz-basierter Hit-Test)
- **6 Farben**: Rot, Blau, Gruen, Gelb, Lila, Schwarz
- **3 Strichbreiten**: Fein (2), Mittel (4), Dick (8)
- **Undo**: Letzter Strich rueckgaengig machen
- **Seite loeschen**: Alle Annotationen einer Seite entfernen
- **Technologie**: SVG-Overlay auf jeder `<img>`-Seite + `perfect-freehand` (druckempfindliche Striche). Koordinaten normalisiert (ViewBox 0-1000), skalieren bei jedem Zoom korrekt
- **Touch-Konflikt**: Im Zeichenmodus sind Scroll, Pinch-to-Zoom und Double-Tap deaktiviert. SVG faengt alle Pointer-Events
- **Auto-Save**: 500ms Debounce nach jedem Strich → `PUT /api/annotations`. Sofortiger Flush bei Seitenwechsel und `beforeunload`
- **Speicherung**: Strokes als JSON-Blob in SQLite, pro User + PDF-Pfad + Seitennummer (unique constraint). Leere Strokes loeschen den DB-Eintrag
- **Berechtigung**: Lesen fuer alle authentifizierten User, Schreiben ab Rolle `member`

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/AnnotatedPage.tsx` | `<img>` + SVG-Overlay pro Seite, Pointer-Event-Handling |
| `frontend/src/components/ui/AnnotationToolbar.tsx` | Floating Toolbar: Stift, Textmarker, Radierer, Farben, Breiten, Undo, Loeschen |
| `frontend/src/hooks/useAnnotations.ts` | Zustand Store: drawingMode, tool, color, strokes, undo, API-Calls |
| `frontend/src/utils/strokeUtils.ts` | Koordinaten-Normalisierung, SVG-Path-Generierung via perfect-freehand |
| `backend/api/annotations.py` | `GET/PUT/DELETE /api/annotations` |
| `backend/models/annotation.py` | Annotation-Modell (user_id, dropbox_path, page_number, strokes_json) |

### Upload

- **Berechtigung**: Pro-Mitglied und hoeher
- **Wege**: Upload-Button im leeren PDF-Panel, oder "PDF hochladen/ersetzen" im Kebab-Menue des Player-Footers
- **Validierung**: PDF-Header (`%PDF-`) in den ersten 1024 Bytes, max. 10 MB
- **Speicherung**: Lokal in `data/pdfs/` mit UUID-Dateinamen + Backup in Dropbox (gleicher Ordner wie Audio-Datei, Originalname)
- Ein PDF pro Datei (ersetzen ueberschreibt das bestehende)
- **Loeschen** entfernt lokale Datei und Dropbox-Kopie

### Rendering-Architektur

- **On-the-fly**: Seiten werden bei Abruf gerendert, nicht vorab gespeichert (minimaler Disk-Verbrauch)
- **LRU-Cache**: 64 Seiten im RAM (kein Re-Render bei erneutem Abruf)
- **Browser-Cache**: 24h Cache-Control Header fuer Seitenbilder
- **Lazy Loading**: Ab Seite 3 werden Bilder erst beim Scrollen geladen
- **PyMuPDF**: Rendert bei 200 DPI, JPEG-Qualitaet 85%

### Referenz-Aufloesung

PDFs nutzen `pdf_ref_path` in FileSettings (unabhaengig von `section_ref_path`):
1. Direkt zugeordnetes PDF → verwenden
2. Kein eigenes PDF, aber `pdf_ref_path` gesetzt → PDF der referenzierten Datei verwenden
3. `is_ref`-Flag im Response signalisiert dem Frontend den Referenz-Status

### Fehlerbehandlung

- Upload-Fehler werden als rote Meldung im PdfPanel angezeigt
- Upload via Footer-Menu zeigt Fehler als Alert

| Datei | Rolle |
|-------|-------|
| `frontend/src/components/ui/DotBar.tsx` | Generische Dot-Indikatoren mit Swipe-Handler |
| `frontend/src/components/ui/PdfPanel.tsx` | Panel mit 3 Zustaenden (Laden/Upload/Viewer) |
| `frontend/src/components/ui/PdfViewer.tsx` | Bild-basierter PDF-Viewer mit JS Pinch-to-Zoom und Fullscreen-FAB |
| `frontend/src/hooks/usePdf.ts` | Zustand Store (load/upload/remove) |
| `frontend/src/pages/PlayerPage.tsx` | Panel-Layout, DotBar, Footer-Menu-Erweiterung |
| `backend/api/pdf.py` | `/api/pdf` Endpoints (info/upload/page/download/delete) |
| `backend/services/pdf_service.py` | On-the-fly Rendering, LRU-Cache, Validierung, Referenz-Aufloesung |
| `backend/models/pdf_file.py` | PdfFile-Modell (inkl. page_count) |

### Bulk-Import (Script)

PDFs aus einem externen Quell-Ordner koennen per Script den passenden ChoirBox-Ordnern zugeordnet und in die App importiert werden. Das Script simuliert den manuellen Upload-Workflow fuer viele Dateien auf einmal.

- **Matching**: Fuzzy-Name-Matching (SequenceMatcher) zwischen PDF-Dateinamen und Ordnernamen. Suffixe wie `-Foto`, `_MOTW` werden vor dem Vergleich entfernt. Schwellwert: 75% Aehnlichkeit.
- **Vorschau-Tabelle**: Vor der Ausfuehrung zeigt das Script eine Zuordnungstabelle (PDF → Ordner → Haupt-Track → Anzahl Tracks) zur manuellen Pruefung.
- **Haupt-Track-Erkennung**: Pro Ordner wird automatisch der "Mix"- oder "Gesamt"-Track erkannt (Keywords: Mix, Komplett, Gesamt, SATB, Chor). Einzelstimmen-Prefixe (S, A, T, B, Sopran, Alt, Tenor, Bass) werden abgewertet.
- **DB-Import**: PDF wird in `data/pdfs/` mit UUID-Dateiname gespeichert. `PdfFile`-Eintrag fuer den Haupt-Track, `FileSettings.pdf_ref_path` fuer alle weiteren Audio-Dateien im selben Ordner.
- **Prod-Deploy**: Separates Script (`deploy_pdfs.sh`) synchronisiert `data/pdfs/` per rsync und exportiert SQL-Inserts auf den Prod-Server.

| Datei | Rolle |
|-------|-------|
| `copy_texte.py` | Matching, Kopieren, DB-Import (lokal) |
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

Persoenliche Sammlung von Lieblings-Dateien pro User.

- Datei als Favorit markieren/entfernen (Herz-Icon) ueber Drei-Punkte-Menue im Browser
- Eigene Favoriten-Seite mit Liste aller markierten Dateien
- Pro User unabhaengig (jeder User hat eigene Favoriten)
- Label-Filter auch auf Favoriten-Seite verfuegbar

| Datei | Rolle |
|-------|-------|
| `frontend/src/pages/FavoritesPage.tsx` | Favoriten-Seite |
| `frontend/src/pages/BrowsePage.tsx` | Favorit-Toggle im Drei-Punkte-Menue |
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
- Sektionsvorlagen verwalten (ab Pro-Mitglied)
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

- **Dateien** (Hauptseite): Header mit Titel + Aktions-Icons (Favoriten, Filter, Suche, Einstellungen). Footer mit Aufnahme- und Upload-Buttons.
- **Player, Sektionen**: Header mit Zurueck-Button + Titel, darunter Player-Controls und Toolbar.
- **Favoriten, Einstellungen**: Header mit Zurueck-Button + Titel.
- **Admin-Seiten**: Header mit Zurueck-Button + Titel + optionale Aktions-Buttons.

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
| `/admin/section-presets` | Sektionsvorlagen | Pro-Mitglied+ |

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
| POST | `/` | Einzelne Sektion erstellen | Pro-Mitglied+ |
| POST | `/bulk` | Mehrere Sektionen auf einmal erstellen (aus Markern) | Pro-Mitglied+ |
| PUT | `/{id}` | Sektion bearbeiten (inkl. Lyrics) | Pro-Mitglied+ |
| PUT | `/lyrics` | Lyrics fuer mehrere Sektionen auf einmal speichern | Pro-Mitglied+ |
| DELETE | `/{id}` | Sektion loeschen (loescht zugehoerige Notizen) | Pro-Mitglied+ |

### Datei-Einstellungen (`/api/file-settings`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/?path=<dropbox_path>` | Einstellungen einer Datei laden (oder Default) | User |
| PUT | `/` | Einstellungen speichern (Sektions-/PDF-Referenz setzen/entfernen) | Pro-Mitglied+ |
| POST | `/propagate` | Referenz auf mehrere Dateien uebertragen (`field`: `section_ref_path` oder `pdf_ref_path`) | Pro-Mitglied+ |

### PDF-Dokumente (`/api/pdf`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/info?path=<dropbox_path>` | PDF-Info mit Referenz-Aufloesung (`has_pdf`, `original_name`, `file_size`, `is_ref`) | User |
| POST | `/upload` | PDF hochladen (FormData: `file` + `dropbox_path`, max 10 MB) | Pro-Mitglied+ |
| GET | `/download?path=<dropbox_path>` | PDF-Datei ausliefern (inline, mit Referenz-Aufloesung) | User |
| DELETE | `/?path=<dropbox_path>` | Direkt zugeordnetes PDF loeschen | Pro-Mitglied+ |

### Annotationen (`/api/annotations`)

| Methode | Pfad | Beschreibung | Zugang |
|---------|------|-------------|--------|
| GET | `/?path=<dropbox_path>&page=<n>` | Strokes fuer User + Seite laden | User |
| PUT | `/` | Upsert: alle Strokes einer Seite speichern (leere Strokes loeschen Eintrag) | Member+ |
| DELETE | `/?path=<dropbox_path>&page=<n>` | Annotationen einer Seite loeschen | Member+ |
| DELETE | `/all?path=<dropbox_path>` | Alle Annotationen eines PDFs loeschen | Member+ |

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

### FileSettings

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `dropbox_path` | String (max 1000) | Primaerschluessel — Dropbox-Dateipfad |
| `section_ref_path` | String (optional) | Sektionsquelle (null = eigene Sektionen) |
| `pdf_ref_path` | String (optional) | PDF-Quelle (null = eigenes PDF), unabhaengig von Sektionsreferenz |
| `created_at` | DateTime | Erstellungszeitpunkt |
| `updated_at` | DateTime | Letzte Aenderung |

### PdfFile

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `id` | Integer | Primaerschluessel |
| `dropbox_path` | String (unique, indexed) | Zugeordnete Audio-Datei |
| `filename` | String | UUID-Dateiname auf Disk (z.B. `a1b2c3d4.pdf`) |
| `original_name` | String | Originaler Dateiname fuer Download |
| `file_size` | Integer | Dateigroesse in Bytes |
| `uploaded_by` | Integer (FK, optional) | Referenz auf User |
| `created_at` | DateTime | Erstellungszeitpunkt |

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
