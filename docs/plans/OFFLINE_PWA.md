# Offline-Modus & Push-Benachrichtigungen — Spezifikation

## Ziel

CantaBox als **Progressive Web App (PWA)** erweitern, sodass:

1. Die App auf Smartphones **installierbar** ist (Homescreen, kein App-Store)
2. Ausgewaehlte `.song`-Ordner **offline** verfuegbar sind (App-Shell + MP3s + Texte)
3. Chor-Mitglieder per **Push-Benachrichtigung** informiert werden, wenn der Chorleiter Aenderungen an einem als "push-aktiv" markierten `.song` in der Dropbox macht

**Plattform-Ziele:** Android (Chrome, vollstaendiger Support) und iOS ab 16.4 (Safari, nur nach Installation auf Homescreen).

**Ausdruecklich nicht im Scope:** Native App im App-Store, Background-Sync (auf iOS nicht zuverlaessig verfuegbar), Offline-Upload/Aufnahme.

## Architektur-Entscheidungen

### Caching-Strategien

| Inhalt | Speicher | Strategie | Warum |
|---|---|---|---|
| App-Shell (JS/CSS/HTML) | Cache API via Workbox | `precacheAndRoute` | Wird bei jedem Build versioniert ersetzt |
| Icons, Fonts | Cache API | `CacheFirst` | Selten geaendert |
| `/api/dropbox/browse` | Cache API | `StaleWhileRevalidate`, 2 min TTL | Offline zeigt letzte Ansicht |
| `/api/auth/*` | — | `NetworkOnly` | Nie cachen |
| MP3-Dateien | **IndexedDB** (Blob) | Explizit, User-gesteuert | Dropbox-Temp-URLs laufen nach 4h ab, daher URL-Caching unbrauchbar; zusaetzlich groesse Dateien und bewusste User-Entscheidung noetig |
| Texte (PDF/TXT) | **IndexedDB** (Blob) | Mit Song mitgeladen | Gehoert konzeptionell zum offline-markierten Song |

### iOS-Besonderheiten (dokumentiert, nicht umgangen)

- Push-Benachrichtigungen nur nach Installation auf Homescreen (iOS 16.4+). UI weist **vor** dem Permission-Prompt explizit darauf hin.
- IndexedDB-Daten koennen nach **7+ Tagen Inaktivitaet** von Safari geloescht werden. UI erkennt Discrepancy und zeigt Banner "Offline-Dateien ggf. neu laden".
- Kein Background-Sync — Aktualisierung der Offline-Kopien passiert nur, wenn die App im Vordergrund ist.

## Phase 1 — PWA-Grundlage

**Deliverables:**

- `vite-plugin-pwa` als Dependency hinzugefuegt (`frontend/package.json`)
- `vite.config.ts` erweitert: Workbox-Konfig mit Precache fuer App-Shell, Runtime-Caching-Strategien (siehe Tabelle)
- `frontend/public/manifest.webmanifest`:
  - `name: "CantaBox"`, `short_name: "CantaBox"`
  - Icons in `192x192` und `512x512`
  - `display: "standalone"`, `theme_color`, `background_color`
- Service-Worker-Registrierung in `main.tsx`
- Install-Prompt-Komponente in der Settings-Page:
  - Android: automatischer `beforeinstallprompt`-Handler, "App installieren"-Button
  - iOS: Anleitung "Teilen-Symbol → Zum Home-Bildschirm"

**Test-Kriterium:** Flugmodus an → App oeffnet, letzte Browse-Ansicht und Einstellungen sichtbar. Audio-Wiedergabe geht noch nicht (das kommt in Phase 2).

## Phase 2 — MP3s offline verfuegbar

### Backend

Kein neuer Endpoint noetig. `/api/dropbox/stream` liefert die Temp-URL, das Frontend laedt den Blob runter und legt ihn in IndexedDB ab.

### Frontend

**Neue Dependency:** `idb` (leichter IndexedDB-Wrapper)

**Neuer Zustand-Store** `frontend/src/stores/offlineStore.ts`:

```ts
type OfflineEntry = {
  path: string;          // Dropbox-Pfad als Schluessel
  blob: Blob;
  mimeType: string;
  downloadedAt: number;
  serverModified: string; // aus Dropbox-Metadaten
  sizeBytes: number;
  songPath: string;      // Eltern-.song-Ordner
};

// Actions
downloadFile(path): Promise<void>
downloadSong(songPath): Promise<void>  // laedt alle Audio + Texte des Songs
removeFile(path): Promise<void>
removeSong(songPath): Promise<void>
getTotalSizeBytes(): number
```

**Neuer Hook** `useOfflineStatus(path)`:
- Rueckgabe: `'missing' | 'downloading' | 'available' | 'outdated'`
- `outdated` = Eintrag existiert, aber `server_modified > downloadedAt`

**Neuer Hook** `useSelectionMode<T>(items, getKey)`:
- Generischer Multi-Select-Hook, wiederverwendbar fuer spaetere Bulk-Aktionen
- Rueckgabe: `{ isActive, toggle, selectAll, clear, selected, activate, deactivate }`

**UI-Aenderungen:**

1. **Song-Card** bekommt Download-Icon + Status-Badge
   - `missing`: Download-Symbol
   - `downloading`: Spinner mit Prozent
   - `available`: gruener Haken
   - `outdated`: Orange "Neu verfuegbar" + Aktualisieren-Button

2. **Top-Bar** in BrowsePage, FavoritesPage, LabelDetailPage:
   - Neuer Button **"Auswaehlen"** aktiviert Select-Mode
   - Im Select-Mode: Checkboxen an jeder Song-Card, **"Alle"**-Checkbox in Top-Bar, **"Abbrechen"**
   - "Alle" wirkt **kontextsensitiv** auf die sichtbare Liste — auf FavoritesPage nur Favoriten, auf LabelDetailPage nur Songs mit dem Label

3. **Aktions-Leiste unten** (erscheint im Select-Mode, nur wenn Auswahl nicht leer):
   - "Offline herunterladen (N)"
   - "Offline-Kopie loeschen (N)"
   - Progress-Indikator waehrend Download: "Lade 3 von 12 Songs..." mit Cancel

4. **Settings-Page** neue Section **"Offline-Speicher"**:
   - Gesamtgroesse (z.B. "247 MB in 12 Songs")
   - Liste der offline verfuegbaren Songs, jeweils mit Einzel-Loeschen
   - "Alles loeschen"-Button mit ConfirmDialog
   - Warn-Schwelle bei 500 MB: Banner "Du nutzt viel Speicher"

5. **Player** verwendet bei offline verfuegbaren Files `URL.createObjectURL(blob)` statt Dropbox-Stream-Call

### Test-Kriterium Phase 2

- User markiert 3 Favoriten als offline → Blobs in IndexedDB → Flugmodus → Wiedergabe funktioniert
- User geht auf LabelDetail "Ueben", klickt "Auswaehlen" → "Alle" → "Offline herunterladen" → nur die Songs dieser Ansicht werden geladen

## Phase 3 — Chorleiter-gesteuerte Push-Benachrichtigungen

### Backend

**Neue Dependency:** `pywebpush` in `requirements.txt`

**VAPID-Keys** generieren, in `.env` ablegen:
```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=...
```

**Model-Aenderungen:**

1. `backend/models/song.py` erweitern:
   ```python
   push_enabled: bool = Field(default=False)
   ```
   Plus Alembic-/SQLModel-Migration.

2. Neues Model `backend/models/push_subscription.py`:
   ```python
   class PushSubscription(SQLModel, table=True):
       id: int | None = Field(default=None, primary_key=True)
       user_id: int = Field(foreign_key="user.id", index=True)
       endpoint: str
       p256dh: str
       auth: str
       user_agent: str | None = None
       created_at: datetime
   ```

3. Neues Model `backend/models/choir_dropbox_cursor.py`:
   ```python
   class ChoirDropboxCursor(SQLModel, table=True):
       choir_id: int = Field(primary_key=True, foreign_key="choir.id")
       cursor: str
       last_checked_at: datetime
   ```

**Neue API-Endpoints:**

- `POST /api/push/subscribe` — Frontend uebergibt seine `PushSubscription` (endpoint, keys), Backend speichert sie
- `DELETE /api/push/subscribe` — User deaktiviert Push-Benachrichtigungen
- `GET /api/push/vapid-public-key` — Frontend holt den Public Key fuer die Subscription
- `PATCH /api/songs/{folder_path}/push` — Chorleiter+ toggelt `push_enabled` an einem Song

**Neuer Service** `backend/services/dropbox_watcher.py`:

- Beim App-Start (in `backend/app.py` als `startup_event`) wird **pro Chor** mit verbundener Dropbox ein Background-Task gestartet
- Task-Loop:
  1. Wenn kein Cursor fuer Chor existiert: `list_folder(recursive=True)` um aktuellen Cursor zu holen, speichern
  2. `list_folder/longpoll(cursor)` — blockt bis zu 480 Sekunden, kehrt zurueck bei Aenderung oder Timeout
  3. Bei Aenderung: `list_folder/continue(cursor)` holt den Diff (`entries`-Array mit neuen/geaenderten/geloeschten Files)
  4. Diff gruppieren nach `.song`-Ordner
  5. Fuer jeden betroffenen `.song` pruefen: `push_enabled == true`?
  6. Wenn ja: alle `PushSubscription`s aller User des Chors abfragen und via `pywebpush` Notification senden
  7. Neuen Cursor speichern, weiter zu Schritt 2
- Fehlerbehandlung: 410 (Subscription abgelaufen) → Subscription aus DB loeschen; andere Fehler → loggen, Retry mit Backoff

**Push-Payload-Format:**

```json
{
  "type": "song-updated",
  "song_path": "/Weihnachtslieder/O Tannenbaum.song",
  "song_name": "O Tannenbaum",
  "changes": { "added": 2, "modified": 1, "deleted": 0 }
}
```

### Frontend

**Service Worker** (erweitert Workbox-SW durch custom Code):

```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(`🎵 ${data.song_name}`, {
      body: `${data.changes.added} neu, ${data.changes.modified} aktualisiert`,
      data: { songPath: data.song_path },
      tag: data.song_path, // ersetzt vorherige Notification desselben Songs
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(`/#/browse?open=${encodeURIComponent(event.notification.data.songPath)}`)
  );
});
```

**Settings-Page** neue Section **"Benachrichtigungen"**:

- Toggle "Push-Benachrichtigungen aktivieren"
- Beim Aktivieren:
  1. Pruefen: ist App auf Homescreen installiert? (iOS-Check via `navigator.standalone` / `display-mode: standalone`)
  2. Falls nicht und iOS: Modal mit Anleitung, Toggle bleibt aus
  3. `Notification.requestPermission()` → bei Grant: `pushManager.subscribe()` → Subscription an Backend
- Hinweis-Text: "Der Chorleiter legt fest, welche Lieder Push-Benachrichtigungen senden."

**Chorleiter-UI** (nur sichtbar mit Rolle `chorleiter` oder `admin`):

- Auf jeder Song-Card: kleines **Glocken-Icon** neben dem Menue
  - Grau: Push inaktiv — Klick aktiviert
  - Blau gefuellt: Push aktiv — Klick deaktiviert
  - Tooltip: "Chor-Mitglieder werden bei Aenderungen benachrichtigt"
- In der Song-Detail-Ansicht: gleiche Toggle prominenter mit beschreibendem Text
- Kein initialer Push beim Aktivieren selbst — nur bei **nachfolgenden** Dropbox-Aenderungen

**Zusammenspiel mit Phase 2:**

- Wenn ein Song offline markiert ist und ein Push fuer diesen Song ankommt:
  - Offline-Eintrag bekommt Status `outdated`
  - Notification-Text zusaetzlich: "Neu verfuegbar zum Herunterladen"
  - Song-Card zeigt "Aktualisieren"-Button — kein Auto-Download (Respekt vor Mobilfunk-Volumen)

## Berechtigungsmatrix (Ergaenzung zu FEATURES.md)

| Aktion | Guest | Member | Pro-Member | Chorleiter | Admin |
|---|---|---|---|---|---|
| Song offline herunterladen | – | ✓ | ✓ | ✓ | ✓ |
| Multi-Select + Bulk-Download | – | ✓ | ✓ | ✓ | ✓ |
| Offline-Speicher verwalten | – | ✓ | ✓ | ✓ | ✓ |
| Push-Benachrichtigungen empfangen | – | ✓ (opt-in) | ✓ (opt-in) | ✓ (opt-in) | ✓ (opt-in) |
| Push pro `.song` aktivieren | – | – | – | ✓ | ✓ |

## Entschiedene Policy-Fragen

1. **Push-Toggle Default:** **aus**. Chorleiter aktiviert bewusst, vermeidet Notification-Spam beim initialen Upload.
2. **Offline-Kopie nach Push:** **nur markieren als `outdated`**, kein Auto-Download. User entscheidet (Mobilfunk-Volumen).
3. **Push deaktiviert nach Offline-Markierung:** **Offline-Kopien bleiben**, nur kuenftige Pushes entfallen.
4. **Speicher-Limit:** keine harte Grenze, aber **Warn-Banner ab 500 MB**.

## Umsetzungs-Reihenfolge

Jede Phase ist eigenstaendig deploybar und bringt erkennbaren Nutzwert:

1. **Phase 1** zuerst (1–2 Tage): App wird installierbar, App-Shell offline. Sofort sichtbarer Effekt.
2. **Phase 2** (3–4 Tage): Offline-Wiedergabe — der eigentliche User-Mehrwert.
3. **Phase 3** (3–5 Tage): Push-Benachrichtigungen — setzt auf Phase 1 (Service Worker) und Phase 2 (outdated-Status) auf.

Nach jeder Phase: FEATURES.md aktualisieren, commit, deploy (ueber `./deploy.sh`).

## Test-Matrix

| Geraet / Browser | Phase 1 (Install) | Phase 2 (Offline-MP3) | Phase 3 (Push) |
|---|---|---|---|
| Android Chrome | ✓ Install-Banner | ✓ IndexedDB | ✓ voll |
| Android Firefox | ✓ manuell | ✓ | ✓ |
| iOS Safari (ohne Install) | – | ✓ mit Einschraenkung (Safari kann loeschen) | ✗ (OS-Limit) |
| iOS Safari (als PWA) | ✓ | ✓ | ✓ ab iOS 16.4 |
| Desktop Chrome/Firefox/Safari | ✓ | ✓ | ✓ |

Fuer jede Phase: manueller E2E-Test auf **einem Android-Geraet** + **einem iOS-Geraet** vor dem Deploy nach Prod.
