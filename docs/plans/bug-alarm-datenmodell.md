# Bug-Alarm: Datenmodell-Stabilisierung

**Status:** Entwurf zur Review
**Modus:** Bug-Alarm (Priorität 1, alle Features eingefroren)
**Risiko ohne Fix:** Datenverlust (Annotationen, Transponierungen, Favoriten, Notizen, Abschnitte) bei jeder Umbenennung/Verschiebung in Dropbox.

---

## 1. Was ist kaputt (Audit-Ergebnis)

### 1.1 Harter Datenverlust: Annotationen

In `backend/services/document_service.py::delete_document` werden **Annotationen explizit gelöscht**:

```python
annotations = session.exec(
    select(Annotation).where(Annotation.document_id == doc_id)
).all()
for a in annotations:
    session.delete(a)
```

Die Sync-Logik in `_sync_documents_from_dropbox` (`backend/api/documents.py` Zeile 232–236) erkennt Umbenennungen nicht und führt bei jeder Umbenennung einen `delete_document` auf der alten Datei aus. **Ergebnis: Alle PDF-Anmerkungen auf einer umbenannten Datei sind weg, obwohl die Datei inhaltlich identisch ist.**

### 1.2 Orphans (stille Datenleichen)

`delete_document` räumt nur `Annotation` und `UserHiddenDocument` auf. Nicht aufgeräumt werden:

- `UserChordPreference` (Transponierungen) → Orphan mit toter `document_id`
- `UserSelectedDocument` (aktive Tab-Auswahl pro Ordner) → Orphan

Die FK-Constraints in SQLite könnten das normalerweise fangen, aber:

### 1.3 FK-Constraints sind aus

`backend/database.py` setzt nur `journal_mode=WAL` und `busy_timeout`. **`PRAGMA foreign_keys=ON` fehlt**. SQLite ignoriert daher alle FK-Definitionen. Orphans sammeln sich still, Test-Deployments wirken "ok", bis jemand auf einen toten Verweis zugreift.

### 1.4 Path-basierte Referenzen brechen bei Rename

Diese Tabellen nutzen `dropbox_path` oder `folder_path` als String-Referenz statt stabiler FK/ID:

| Tabelle | Spalte | Bezug | Folge bei Rename |
|---|---|---|---|
| `favorites` | `dropbox_path` | Datei *oder* Ordner | Favorit "verschwindet" |
| `notes` | `dropbox_path` | Datei | Notiz verwaist |
| `user_labels` | `dropbox_path` | Datei | Label-Zuweisung weg |
| `audio_meta` | `dropbox_path` **(PK!)** | Datei | Parsed Voice/Sections weg |
| `audio_durations` | `dropbox_path` **(PK!)** | Datei | Länge muss neu gemessen werden |
| `sections` | `folder_path` | `.song`-Ordner | Abschnitte mit Lyrics weg |
| `documents` | `folder_path` + `dropbox_path` | `.tx`-Ordner + Datei | ganzer Document-Row weg |
| `user_selected_documents` | `folder_path` + `document_id` | Ordner + Doc | Orphan nach Doc-Löschung |

### 1.5 Rename-Endpoint macht fast nichts

`backend/api/dropbox.py::dropbox_rename` verschiebt nur die Dropbox-Datei und löscht dann die alte `AudioMeta`. Er aktualisiert **keine einzige** andere Tabelle. Der nächste Sync (oder Resync) findet einen Orphan am alten Pfad und löscht ihn.

### 1.6 Folder-Rename ist noch schlechter

Wird ein Ordner (z. B. `Lied.song`) umbenannt, sind sofort betroffen:

- Alle `Section`s (`folder_path`)
- Alle `Document`s in `.tx`-Unterordnern (`folder_path`, `dropbox_path`)
- Alle `Favorite`s mit `entry_type='folder'`
- Alle Dateien im Ordner einzeln: `Favorite`, `Note`, `UserLabel`, `AudioMeta`, `AudioDuration`

Keine davon wird beim Rename migriert.

### 1.7 Resync ist ein "Totenschein", keine Rettung

`backend/api/admin.py::resync_all` vergleicht DB-Pfade mit Dropbox-Pfaden und löscht alles, was nicht mehr im Dropbox ist. Nach Rename/Move ist der alte Pfad weg → alle Referenzen gehen. Das ist die Grundursache, warum Favoriten "einfach verschwinden".

### 1.8 Kein stabiler Dropbox-Key gespeichert

Dropbox liefert in jeder API-Antwort eine stabile `id` (Format `id:<hash>`), die **über Rename und Move hinweg identisch bleibt**. Wir speichern diese ID aktuell nirgends. **Das ist der Kern des Problems.**

---

## 2. Gewünschtes Datenmodell (zur Review)

### 2.1 Leitidee

> **Jede User-Daten-Zeile zeigt auf ein stabiles Asset, nicht auf einen Pfad.**

Dafür brauchen wir zwei neue stabile Schlüssel:

- `Document.dropbox_file_id` — Dropbox-ID der `.tx`-Datei (PDF, ChordPro, Video)
- `Song.dropbox_file_id` — Dropbox-ID des `.song`-Ordners (ja, Ordner haben auch eine ID)

Die `Song`-Tabelle ist neu und ist der Anker für **alles, was "zu diesem Lied" gehört** (Sections, Ordner-Favoriten). Dokumente hängen wie bisher daran — per `folder_path`-Lookup kommen wir hin, aber zusätzlich schreiben wir `Document.song_id`.

### 2.2 Tabellen-Übersicht (neu/geändert)

```
┌───────────────────── CHOR-CONTENT-LAYER ──────────────────────┐
│                                                               │
│  songs                                   (NEU)                │
│  ├── id (int, PK)                                             │
│  ├── folder_path (str, indexed)         ← Pfad, veränderlich  │
│  ├── dropbox_file_id (str, unique, nullable)  ← STABIL        │
│  ├── name (str)                         ← abgeleitet vom Pfad │
│  ├── status ('active' | 'orphan')       ← Admin-Aufräum-Flag  │
│  └── updated_at                                               │
│                                                               │
│  documents                              (geändert)            │
│  ├── id (int, PK)                                             │
│  ├── song_id (int, FK → songs.id)       ← NEU                 │
│  ├── folder_path (str, indexed)                               │
│  ├── dropbox_path (str, nullable)                             │
│  ├── dropbox_file_id (str, unique)      ← NEU: STABIL         │
│  ├── file_type, original_name, ...                            │
│  └── content_hash                                             │
│                                                               │
│  sections                               (geändert)            │
│  ├── id (int, PK)                                             │
│  ├── song_id (int, FK → songs.id)       ← NEU, ersetzt Pfad   │
│  ├── folder_path (str)                  ← bleibt als Cache    │
│  ├── label, color, start_time, end_time, lyrics               │
│  └── ...                                                      │
│                                                               │
│  audio_meta                             (geändert)            │
│  ├── id (int, PK)                       ← NEU (war path als PK)│
│  ├── dropbox_file_id (str, unique)      ← NEU: STABIL         │
│  ├── dropbox_path (str, indexed)        ← nur noch Cache      │
│  ├── voice_keys, section_keys, song_name, free_text           │
│  └── choir_id                                                 │
│                                                               │
│  audio_durations                        (geändert)            │
│  ├── id (int, PK)                       ← NEU                 │
│  ├── dropbox_file_id (str, unique)      ← NEU: STABIL         │
│  ├── dropbox_path (str)                 ← Cache               │
│  └── duration_seconds                                         │
│                                                               │
└───────────────────────────────────────────────────────────────┘

┌───────────────────── USER-DATA-LAYER ─────────────────────────┐
│                                                               │
│  favorites                              (geändert)            │
│  ├── id (int, PK)                                             │
│  ├── user_id (str, FK → users.id)                             │
│  ├── song_id (int, FK → songs.id, nullable)  ← für entry_type='folder'│
│  ├── document_id (int, FK → documents.id, nullable)  ← für entry_type='file' mit doc│
│  ├── audio_file_id (str, nullable)      ← Dropbox file_id für mp3/wav│
│  ├── dropbox_path (str)                 ← Cache/Display       │
│  ├── file_name                                                │
│  ├── entry_type ('song' | 'document' | 'audio')               │
│  │      document = .pdf/.txt/.cho (und weitere .tx-Typen      │
│  │      später); song = nur .song-Ordner (erweiterbar später) │
│  └── created_at                                               │
│                                                               │
│  notes                                  (geändert)            │
│  ├── id (int, PK)                                             │
│  ├── user_id (FK → users.id)                                  │
│  ├── target_file_id (str, indexed)      ← Dropbox file_id     │
│  ├── dropbox_path (str)                 ← Cache               │
│  ├── section_id (FK → sections.id, nullable)                  │
│  └── text, timestamps                                         │
│                                                               │
│  user_labels                            (geändert)            │
│  ├── id (int, PK)                                             │
│  ├── user_id (FK → users.id)                                  │
│  ├── target_file_id (str, indexed)      ← Dropbox file_id     │
│  ├── dropbox_path (str)                 ← Cache               │
│  └── label_id (FK → labels.id)                                │
│                                                               │
│  annotations                            (unverändert)         │
│  ├── user_id (FK)                                             │
│  ├── document_id (FK → documents.id)    ← bleibt, aber delete_document muss weg│
│  ├── page_number, strokes_json                                │
│                                                               │
│  user_chord_preferences                 (unverändert)         │
│  ├── user_id (FK)                                             │
│  ├── document_id (FK → documents.id)    ← bleibt              │
│  └── transposition_semitones                                  │
│                                                               │
│  user_selected_documents                (unverändert)         │
│  ├── user_id (FK)                                             │
│  ├── song_id (FK → songs.id)            ← NEU statt folder_path│
│  └── document_id (FK → documents.id)                          │
│                                                               │
│  user_hidden_documents                  (unverändert)         │
│  └── (user_id, document_id) als composite PK                  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 2.3 Was nicht geändert wird

- `users`, `labels`, `app_settings`, `choirs`, `session_tokens`, `section_presets` — kein Bezug zum Dropbox-Pfad-Problem.
- `annotations.document_id`, `user_chord_preferences.document_id`, `user_hidden_documents.document_id` — FK zu `documents.id` reicht, **sobald `documents.id` stabil ist**. Wird es, sobald der Sync Dokumente anhand `dropbox_file_id` matcht statt anhand Name.

### 2.4 Invarianten nach dem Fix

1. **Kein User-Daten-Row hat nur einen String-Pfad als Anker.** Jede Zeile zeigt auf `song_id`, `document_id` oder `target_file_id` (Dropbox-ID).
2. **Pfade sind Cache, keine Wahrheit.** `dropbox_path`, `folder_path`, `file_name` bleiben für Anzeige/Breadcrumbs/Sortierung, werden aber bei jedem Sync aus der Dropbox-ID aktualisiert.
3. **`delete_document` löscht keine Annotationen und Transponierungen mehr.** Ein Document wird nur gelöscht, wenn die Dropbox-ID nicht mehr existiert (echte Löschung, nicht Rename).
4. **`PRAGMA foreign_keys=ON`** ist gesetzt. Ab dann knallt es früh, wenn wir neue Orphans produzieren würden.
5. **Rename/Move in Dropbox ist idempotent.** Der Sync erkennt sie über `dropbox_file_id`, aktualisiert Pfade, verliert nichts.

---

## 3. Implementierungsplan

**Leitprinzipien für jede Phase:**

- App bleibt **jederzeit lauffähig** auf cantabox.de.
- **Keine destruktive Migration** — alte Spalten bleiben parallel stehen, bis die neue Logik in Produktion stabil ist.
- **Jede Phase einzeln committet**, einzeln deploybar, einzeln rückrollbar.
- Nach jeder Phase: Preview-Test → Commit → optional Deploy.

### Phase 0 — Sicherheitsnetz (kein Datenmodell-Change)

**Ziel:** Nichts mehr verlieren, was heute ohne Not verloren geht.

1. `delete_document`: Entferne den expliziten `Annotation`-Löschblock. Annotationen überleben damit zukünftige Dokumenten-Renames, auch wenn wir noch keinen neuen Match-Mechanismus haben. Sie werden nach Phase 2 per Dropbox-File-ID wieder korrekt verknüpft.
2. `resync_all`: Füge eine **Dry-Run-Option** hinzu (Query-Parameter `?dry_run=true`), die nur zählt, was gelöscht würde, ohne zu löschen. Admin-UI bekommt einen Button "Resync simulieren".
3. Backup-Routine: Vor jedem Resync (nicht Dry-Run) kopiert das Backend `choirbox.db` nach `choirbox.db.bak-<timestamp>`. Nur die letzten 5 Backups bleiben.
4. DB-Migration ist nicht nötig. Nur Codeänderungen.

**Verifikation:** In der Preview umbenennen → Annotationen auf der alten Datei bleiben in der DB (wenn auch verwaist). Dry-Run Resync zeigt die Zahlen, löscht nichts.

### Phase 1 — FK-Enforcement einschalten

**Ziel:** Schluss mit stillen Orphans.

1. `backend/database.py`: Im `_set_sqlite_pragma`-Listener `PRAGMA foreign_keys=ON` hinzufügen.
2. Vorher-Check per Einmal-Skript `scripts/audit_orphans.py`: Zählt Orphans in allen User-Daten-Tabellen. Wird vor dem Deploy manuell ausgeführt.
3. Einmaliges Cleanup-Skript `scripts/clean_orphans.py`: Löscht nachweislich tote Verweise (z. B. `UserChordPreference` ohne `documents`-Row). Idempotent, mit `--dry-run`.
4. Deploy-Reihenfolge:
   - **Staging:** Skript laufen lassen → Zahlen prüfen → wenn ok, Phase 1 deployen.
   - **Prod:** DB-Backup → Skript laufen lassen → Zahlen prüfen → Phase 1 deployen.

**Verifikation:** Nach Deploy läuft die App, keine FK-Exceptions in den Logs, `scripts/audit_orphans.py` zeigt 0 in allen relevanten Tabellen.

### Phase 2 — `dropbox_file_id` in `documents` speichern

**Ziel:** Dokument-Sync wird rename-tolerant.

1. Migration: Neue Spalte `documents.dropbox_file_id` (nullable, unique-partial-index "where not null").
2. `dropbox_service`: `list_folder`-Resultate geben bereits `id` zurück (Dropbox-Standard). Die ID in allen `.tx`-Sync-Pfaden mitschleppen.
3. `_sync_documents_from_dropbox`:
   - Backfill: Beim ersten Lauf trägt der Sync für jede existierende Datei die `dropbox_file_id` ein, indem per Name-Match der richtige Row gefunden wird.
   - Danach: Match **primär über `dropbox_file_id`**, sekundär über Name (für den Übergang). Wenn ID gefunden: Name, `folder_path`, `dropbox_path`, `original_name` updaten (= Rename wird still absorbiert). Nur Inhalt (hash) neu prüfen.
   - Löschen nur noch, wenn Dropbox-ID wirklich verschwunden ist.
4. `register_pdf`/`register_document`: Nehmen jetzt `dropbox_file_id` als weiteres Argument.
5. `delete_document`: Bleibt wie in Phase 0 — keine Annotation-Löschung. Zusätzlich: räumt `UserChordPreference` und `UserSelectedDocument` für dieses `document_id` auf (sauberer Abschluss, jetzt wo FK an ist).

**Verifikation:**
- Preview: PDF annotieren, Datei in Dropbox umbenennen, App refreshen, Sync läuft → Annotation auf umbenannter Datei sichtbar, dieselbe `document_id`, Transponierung erhalten.
- Preview: PDF löschen in Dropbox → Document weg, Annotation weg (korrektes Verhalten).

### Phase 3 — `songs`-Tabelle einführen

**Ziel:** Ordner-Rename absorbieren, stabiler Anker für Sections und Ordner-Favoriten.

1. Migration: Neue Tabelle `songs` mit den Spalten aus 2.2 plus `status` (`'active' | 'orphan'`, Default `'active'`).
2. Backfill-Skript: Für jeden `folder_path` in `documents` und `sections` → Dropbox-Ordner lesen, `id` holen, `songs`-Row mit `status='active'` anlegen. Wenn der Ordner in Dropbox nicht mehr existiert, Row mit `dropbox_file_id=NULL`, `status='orphan'` anlegen — nicht wegwerfen. Begründung: Entscheidung 4 (Admin räumt auf).
3. `documents.song_id` als neue Spalte (nullable), beim Backfill befüllen.
4. `sections.song_id` als neue Spalte (nullable), beim Backfill befüllen. `folder_path` bleibt vorerst.
5. Sync (`resync_all` und `_sync_documents_from_dropbox`): Beim Erkennen eines `.song`-Ordners Dropbox-ID merken, `songs`-Tabelle pflegen, `documents.song_id`/`sections.song_id` beim Anlegen setzen.
6. Folder-Rename in Dropbox → Sync matcht über `songs.dropbox_file_id`, aktualisiert `songs.folder_path`, `documents.folder_path`, `documents.dropbox_path`, `sections.folder_path`.

**Verifikation:**
- Preview: `.song`-Ordner in Dropbox umbenennen, App refreshen → Sections bleiben, Dokumente darin bleiben, Pfade sind aktualisiert.
- Ordner löschen in Dropbox → `songs`-Row, zugehörige `sections` und `documents` gehen weg (korrekt).

### Phase 4 — User-Daten-Referenzen stabilisieren

**Ziel:** Favoriten, Notes, UserLabels verlieren nichts mehr bei Rename.

1. Migration:
   - `favorites`: `song_id` (nullable, FK), `document_id` (nullable, FK), `audio_file_id` (nullable, str), `entry_type` aus `'file'/'folder'` auf `'song'/'document'/'audio'` erweitert (alte Werte bleiben lesbar, Code mappt).
   - `notes`: `target_file_id` (nullable, str).
   - `user_labels`: `target_file_id` (nullable, str).
2. Backfill-Skript: Für jeden bestehenden Row per `dropbox_path` auf Dropbox-ID auflösen. Wenn Auflösung misslingt (Pfad existiert nicht mehr) → Row wird nicht migriert und bleibt als "legacy orphan" stehen, Admin-UI zeigt Liste zum manuellen Aufräumen.
3. `favorites`-API:
   - Beim Schreiben neuer Favoriten: `song_id`/`document_id`/`audio_file_id` setzen. `dropbox_path` bleibt als Cache.
   - Beim Lesen: primär über IDs joinen, Pfad aus `songs`/`documents` nachladen (aktuelle Anzeige).
4. `notes`/`user_labels`-APIs: analog. Alle Writes gehen über die Dropbox-ID (resolven mit `dropbox_service.get_metadata`).
5. `cleanup_service.cleanup_file` / `cleanup_folder`: Löschen nur noch, wenn die Dropbox-ID wirklich weg ist (nicht bei Rename).
6. `resync_all`: Orphan-Erkennung läuft über IDs, nicht über Pfade.

**Verifikation:**
- Preview: Audio-Datei favorisieren, umbenennen → Favorit sichtbar mit neuem Namen.
- Komplettes Verzeichnis umbenennen → alle darin enthaltenen Favoriten/Notes/Labels sichtbar.

### Phase 5 — Alte Path-Spalten entrümpeln (optional, später)

**Ziel:** Technische Schulden abbauen, nachdem die neue Welt stabil ist.

- `audio_meta.dropbox_path` und `audio_durations.dropbox_path` sind nur noch Cache, PK ist `id`.
- Migration löscht die alten Primary-Key-Constraints und setzt `id` als neuen PK.
- Erst **nach mindestens einer Woche stabilem Betrieb** der Phase 4 in Produktion.

**Nicht in diesem Bug-Alarm-Ticket.** Wird separat geplant, wenn Zeit ist.

---

## 4. Entscheidungen (im Review festgelegt)

1. **Favoriten-Aufteilung:** `entry_type` wird `'song' | 'document' | 'audio'`.
   - `document` umfasst aktuell alle Inhalte in `.tx`-Unterordnern: `.pdf`, `.txt`, `.cho`. Weitere Dokument-Typen sind vorgesehen und sollen später ohne DB-Migration ergänzt werden können (das Feld bleibt ein String, kein Enum).
   - Der Container-Typ für "ein Lied als Ganzes" bleibt vorerst **nur `.song`-Ordner**. Weitere Container-Arten (z. B. `.medley`, `.setlist`) sind perspektivisch denkbar, aber kein Thema dieses Bug-Alarms.

2. **`audio_meta` / `audio_durations` Primary Key:** Umbau auf `id`-PK erst in Phase 5 (siehe dort). In Phase 2 bleiben die Tabellen unverändert, wir pflegen nur zusätzlich `dropbox_file_id` als neue, eindeutige Nicht-PK-Spalte, damit der Sync sie bereits benutzen kann.

3. **Backfill von Dropbox-IDs online:** Akzeptiert. Jede Migration der Phasen 2–4 braucht aktive Dropbox-Verbindung des Admins. Läuft kein Dropbox, schlägt das Backfill-Skript mit klarer Fehlermeldung fehl und ändert nichts — nicht halb-migriert.

4. **Verwaiste `.song`-Rows bleiben stehen — Admin räumt auf.** Konkret so:
   - Neue `songs`-Rows haben ein Feld `status` (`'active' | 'orphan'`).
   - `status='orphan'` bedeutet: Beim Backfill oder letzten Sync war der Ordner nicht in Dropbox auffindbar, aber User-Daten (Favoriten, Sections, Notes, ...) referenzieren ihn noch.
   - Im Admin-Bereich (`/admin` → neue Seite "Datenpflege") zeigt eine Tabelle alle `orphan`-Songs: Pfad, Name, Anzahl angehängter User-Daten-Einträge pro Typ.
   - Drei Aktionen pro Orphan:
     * **Wiederfinden:** Dropbox nach Ordnern gleichen Namens durchsuchen, Treffer zur Auswahl anzeigen. Admin wählt aus → `songs.folder_path` und `dropbox_file_id` werden aktualisiert, Status wird `active`, alle angehängten User-Daten hängen wieder korrekt.
     * **Endgültig löschen:** Löscht die `songs`-Row und alle abhängigen User-Daten (Favoriten, Sections, angehängte Notes, UserLabels). Mit Bestätigungs-Dialog, der die betroffenen Zahlen nennt.
     * **Ignorieren:** Row bleibt als Orphan stehen, taucht aber in einem "Ignoriert"-Filter auf, nicht in der Haupt-Liste.
   - Zusätzlich ein Bulk-Button "Alle ohne angehängte User-Daten löschen" für die eindeutigen Fälle (= leere Orphans).
   - Analog ein zweiter Admin-Tab für `documents` mit `dropbox_file_id=NULL`, falls Phase 2 welche hinterlässt.
   - Legacy-Rows aus Phase 4 (Favoriten/Notes/UserLabels, bei denen das Backfill keine ID auflösen konnte) kommen auf einen dritten Tab "Orphan-User-Daten": Admin sieht sie pro User, Aktion "wiederfinden" oder "löschen". Ein Normal-User wird damit nicht belästigt.

5. **Annotationen nach Inhalts-Änderung:** Bleiben sichtbar. Wenn `content_hash` sich ändert, `dropbox_file_id` aber nicht, wird der Document-Row aktualisiert und alle Annotationen bleiben wie sie sind. Keine "veraltet"-Kennzeichnung in diesem Ticket. (Kann später kommen, wenn es zu falsch platzierten Strokes führt.)

6. **Reihenfolge der Phasen:** Phase 1 (FK einschalten) kommt **direkt nach Phase 0**, mit vorherigem Orphan-Cleanup-Skript auf Staging und Prod. So sehen wir sofort, ob wir irgendwo noch unsauber löschen, bevor wir tiefer graben.

---

## 5. Nicht-Ziele

- Kein Bundle-Export, keine Freemium-Architektur, keine Offline-First-Umstellung — alles eingefroren bis dieser Bug-Alarm abgeschlossen ist.
- Keine Änderung an der Admin-/User-Rolle-Logik.
- Keine Änderung an ChordPro-Rendering oder PDF-Viewer (außer den neuen Sync-Wegen).
- Keine API-Breaking-Changes am Frontend. Alle neuen FKs sind optional; Antworten bleiben schemakompatibel.
