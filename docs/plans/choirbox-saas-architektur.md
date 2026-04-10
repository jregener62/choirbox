# ChoirBox — Zentraler Auth-Proxy (Modell A)

**Status:** Entwurf / Diskussionsgrundlage
**Datum:** 2026-04-10
**Verwandt:** `dropbox-pkce-migration.md`

## Scope & Motivation

Dieses Dokument beschreibt eine alternative Architektur fuer ChoirBox, die die aktuelle self-hosted Per-Chor-Instanz durch einen **zentralen Multi-Tenant-Server** ersetzt. Dieser Server vermittelt Authentifizierung und Dropbox-Zugriff fuer beliebig viele Choere und wird vom Betreiber der App gehostet — nicht von jedem Chor selbst.

### Ziele

- Einfaches Onboarding fuer Chormitglieder: Mail eingeben, Link klicken, drin sein
- Keine Self-Hosting-Huerde fuer Chorleiter
- Echte serverseitige Rollen-Durchsetzung statt Honor-System
- Multi-Device pro User ohne Token-Sharing
- Minimaler personenbezogener Datenbestand (nur E-Mail, Rolle, Chor-Zugehoerigkeit)
- Medien und User-Daten bleiben in der Dropbox des jeweiligen Chorleiters

### Nicht-Ziele

- Medien aus Dropbox herausloesen — die Dropbox bleibt Datenhoheit des Chorleiters
- Eigene Datenbank pro Chor
- App-Store-Release (orthogonal, kann spaeter als Capacitor-Wrapper ergaenzt werden)
- Komplexes Permission-System (es gibt nur zwei Rollen)
- Notenblatt-Rendering oder Chat-Funktionen

## Ist-Zustand

Aktuell ist ChoirBox eine **Single-Tenant-App**: jeder Chor muss eine eigene Instanz betreiben (eigener Server, eigene SQLite, eigene `.env` mit Dropbox-Credentials). User existieren in der lokalen DB, Registrierung ueber Einladungscode plus Passwort-Login.

Probleme dieser Architektur:

- Self-Hosting-Huerde ist fuer nicht-technische Chorleiter zu hoch
- Dropbox-App-Registrierung pro Chor ist fummelig (teilweise durch PKCE-Migration gemildert)
- Passwort-Login erfordert Verwaltung pro User
- Kein Multi-Device-Sync fuer User-Daten wie Favoriten oder Transpose-Werte
- Jede Code-Aktualisierung muss pro Instanz ausgerollt werden

## Soll-Zustand

Eine **zentrale ChoirBox-Server-Instanz** (vom App-Betreiber gehostet) vermittelt zwischen allen Chor-Clients und den jeweiligen Dropboxen. Jeder Chorleiter verbindet einmalig seine eigene Dropbox, der Refresh Token wird verschluesselt zentral abgelegt, der Server ist der einzige Ort, der Dropbox-Writes ausfuehrt.

### Komponenten

**ChoirBox Server (zentral, multi-tenant)**
- FastAPI-Backend (wie bisher, aber multi-tenant umgebaut)
- Postgres statt SQLite
- Mail-Service-Integration fuer Magic Links
- JWT-Session-Management
- Dropbox-Proxy pro Chor mit Token-Cache

**ChoirBox Client (PWA, pro Chor identisch)**
- React/TypeScript wie bisher
- Redet ausschliesslich mit dem ChoirBox-Server, nie direkt mit Dropbox
- Kein Refresh Token im Client
- Rollen-Checks im Frontend nur als UI-Hilfe, nicht als Sicherheitsfeature

**Dropbox pro Chor (Scoped App Folder)**
- Chorleiter verbindet seinen eigenen Dropbox-Account via PKCE-OAuth einmalig
- ChoirBox ist als Scoped App (App Folder) registriert — Zugriff nur auf `/Apps/ChoirBox/`
- Refresh Token wird verschluesselt in der Server-DB abgelegt

### Vertrauensmodell

- **Server** ist die einzige Instanz mit Dropbox-Schreibzugriff
- **Chorleiter** hat via Server Vollzugriff auf seine Chor-Dropbox
- **Saenger** haben via Server eingeschraenkten Zugriff (nur eigene User-Daten schreiben, globale Daten lesen)
- **Client** haelt nur Session-Tokens, niemals Dropbox-Credentials
- **Kompromittierter Client** kann maximal im Namen seines Users agieren, nicht als anderer User und nicht direkt auf Dropbox

## Datenmodell

### Server-Datenbank (Postgres)

Tabelle `choirs` — pro registriertem Chor:

```
id                      UUID PK
name                    TEXT
created_at              TIMESTAMP
dropbox_account_id      TEXT
dropbox_account_email   TEXT
dropbox_refresh_token   TEXT   -- verschluesselt (Fernet mit Server-Key)
dropbox_connected_at    TIMESTAMP NULL
```

Tabelle `users` — Minimaldatensatz, nur was fuer Auth und Rollen noetig ist:

```
id                  UUID PK
choir_id            UUID FK -> choirs
email               TEXT                -- Klartext, fuer Mail-Versand unvermeidlich
role                ENUM('chorleiter', 'saenger')
voice_part          ENUM('sopran', 'alt', 'tenor', 'bass', NULL)
created_at          TIMESTAMP
last_login_at       TIMESTAMP NULL
UNIQUE(choir_id, email)
```

Tabelle `magic_links` — temporaer, single-use:

```
token        TEXT PK          -- 32 Byte random, URL-safe
user_id      UUID FK -> users
created_at   TIMESTAMP
expires_at   TIMESTAMP         -- +15 Minuten
used_at      TIMESTAMP NULL
```

Tabelle `sessions` — nach Magic-Link-Login:

```
id               UUID PK
user_id          UUID FK -> users
device_label     TEXT              -- vom Client gesetzt ("iPhone von Maria")
created_at       TIMESTAMP
last_seen_at     TIMESTAMP
expires_at       TIMESTAMP         -- 90 Tage rolling
```

**Bewusst nicht in der DB:**

- Medien-Metadaten (Dateinamen, Dauern, Groessen) — leben in der Dropbox
- Favoriten, Progress, Transpose-Werte — per User in Dropbox
- Label-Zuweisungen, Chor-Labels — in Dropbox
- Passwoerter — gibt es nicht mehr
- Profilnamen, Telefonnummern — werden nicht erhoben

### Dropbox-Struktur (pro Chor, innerhalb `/Apps/ChoirBox/`)

```
/Apps/ChoirBox/
├── global/
│   ├── labels.json          -- Chor-weite Labels
│   └── settings.json        -- Einstellungen des Chorleiters
├── media/
│   ├── stimmbildung/
│   ├── stuecke/
│   │   └── weihnachtsoratorium/
│   │       ├── sopran.mp3
│   │       ├── alt.mp3
│   │       └── ...
│   └── ...
└── users/
    ├── <user_uuid>/
    │   ├── favorites.json
    │   ├── progress.json
    │   ├── transpose.json
    │   └── user_labels.json
    └── ...
```

User-UUIDs entsprechen den IDs in der Server-DB. Kein Name, keine Mail in der Dropbox — nur die UUID. Damit bleibt die Dropbox pseudonymisiert.

## Auth-Flow

### Erstregistrierung eines Chorleiters

1. Chorleiter oeffnet ChoirBox-Client, klickt "Neuen Chor anlegen"
2. Gibt Chor-Name und eigene E-Mail ein
3. Server legt `choirs`-Zeile und `users`-Zeile mit `role=chorleiter` an
4. Server erzeugt Magic-Link-Token, speichert es, verschickt Mail
5. Chorleiter klickt Link → Server validiert Token, erstellt Session, setzt Cookie/JWT im Client
6. Chorleiter wird zum "Dropbox verbinden"-Schritt geleitet (PKCE-OAuth-Flow)
7. Nach erfolgreicher Autorisierung: Server verschluesselt Refresh Token, speichert in `choirs.dropbox_refresh_token`
8. Chor ist einsatzbereit

### Mitglied einladen

1. Chorleiter gibt in der App die Mail eines neuen Mitglieds ein (optional Stimmlage)
2. Server legt `users`-Zeile mit `role=saenger` und der Chor-ID an
3. Server verschickt Einladungs-Mail mit Magic Link
4. Mitglied klickt → Session wird erstellt, Mitglied ist drin

### Normaler Login

1. User oeffnet Client, gibt seine Mail ein
2. Server findet den Nutzer, ordnet ihn dem Chor zu
3. Server verschickt Magic Link
4. Klick → Session wird erstellt oder erneuert

### Session-Lifecycle

- Session-Token im Client gespeichert (`localStorage` in der PWA, Keychain/Keystore in einer spaeteren nativen Variante)
- Bei jedem API-Call wird das Token im `Authorization: Bearer`-Header mitgeschickt
- Server validiert, aktualisiert `last_seen_at`
- Session laeuft nach 90 Tagen Inaktivitaet ab → neuer Magic Link noetig
- User kann in den Settings alle aktiven Sessions sehen und einzeln widerrufen (Multi-Device-Uebersicht)

## Rollen-Durchsetzung

Alle schreibenden Endpoints pruefen die Rolle **serverseitig**, basierend auf dem Session-User:

```
POST   /api/media/upload          -> nur role=chorleiter
DELETE /api/media/<id>            -> nur role=chorleiter
POST   /api/global/labels         -> nur role=chorleiter
POST   /api/users/invite          -> nur role=chorleiter
DELETE /api/users/<id>            -> nur role=chorleiter

POST   /api/user/favorites        -> jeder User, nur eigener User-Folder
POST   /api/user/transpose        -> jeder User, nur eigener User-Folder
POST   /api/user/progress         -> jeder User, nur eigener User-Folder

GET    /api/media/browse          -> alle eingeloggten User des Chors
GET    /api/media/stream/<id>     -> alle eingeloggten User des Chors
GET    /api/global/labels         -> alle eingeloggten User des Chors
```

**Der Client hat keinen direkten Dropbox-Zugriff.** Der Server ist der einzige Weg, der den Refresh Token kennt und Writes ausfuehrt.

Damit sind die sechs Probleme aus der vorherigen Serverless-Analyse geloest:

1. Rollen sind echt durchgesetzt, nicht Honor-System
2. Auth ist sauber (Magic Links, keine Passwort-Verwaltung)
3. Concurrency ist serverseitig mit rev-basierten Dropbox-Writes loesbar
4. Datengranularitaet frei waehlbar (Server entscheidet, was wohin geht)
5. Sync-Strategie vom Server vorgegeben (Polling, Server-Sent Events oder WebSockets)
6. Onboarding: Mail eingeben, Link klicken, fertig

## Dropbox-Integration

### Pro Request

1. Client schickt API-Call mit JWT
2. Server validiert JWT → kennt `user_id` und `choir_id`
3. Server prueft Rolle fuer den Endpoint
4. Server laedt `choirs.dropbox_refresh_token`, entschluesselt, fordert Access Token an
5. Server fuehrt Dropbox-Call aus (Upload, List, Temporary Link)
6. Access Token wird fuer wenige Minuten in-Memory gecached (dict oder Redis); Refresh Token nie zum Client geschickt
7. Antwort an Client

### Token-Caching

Dropbox Access Tokens sind ueblicherweise 4 Stunden gueltig. Der Server cached pro Chor den Access Token in-Memory bis kurz vor Ablauf und holt sich dann per Refresh Token einen neuen. Das reduziert Roundtrips zu Dropbox.

### Scoped App

Die ChoirBox-Dropbox-App MUSS als Scoped App (App Folder, nicht Full Dropbox) registriert sein. Damit ist der Blast Radius bei Token-Kompromittierung auf `/Apps/ChoirBox/` begrenzt.

### PKCE fuer Chorleiter-Connect

Der "Dropbox verbinden"-Schritt nutzt den in `dropbox-pkce-migration.md` geplanten PKCE-Flow. Im Modell A haelt der Server den Refresh Token — was akzeptabel ist, weil der Server per Definition der vertrauenswuerdige Vermittler ist und User niemals in Kontakt mit dem Token kommen.

### Content-Hash-Caching

Fuer effizientes Client-Caching liefert der Server bei Browse-Requests den Dropbox `content_hash` mit. Clients koennen so Medien-Dateien im Service Worker cachen und nur bei Hash-Aenderung neu laden.

## Multi-Tenancy & Isolation

- Jede DB-Zeile hat eine `choir_id`
- Jeder API-Call wird serverseitig auf die `choir_id` des JWT-Users gescopt (Row-Level-Security in Postgres oder explizite `WHERE choir_id = ?`)
- Dropbox-Zugriffe nutzen den Refresh Token des jeweiligen Chors — Chor A kann technisch nicht in Dropbox B schreiben, weil der Server diesen Token nicht laedt
- Keine Cross-Tenant-Queries erlaubt, mit Ausnahme von Admin-Monitoring fuer den App-Betreiber (separate Admin-Rolle, nicht in diesem Dokument weiter spezifiziert)

## DSGVO

### Minimaldatensatz pro User

- E-Mail (fuer Magic Link unvermeidlich)
- Rolle und Stimmlage
- Timestamps (erstellt, zuletzt eingeloggt)

Keine Namen, keine Telefonnummern, keine Profilbilder, keine Tracking-Daten.

### Nutzerrechte

- **Auskunft (Art. 15):** User kann in den Settings seine gespeicherten Daten einsehen
- **Berichtigung (Art. 16):** E-Mail und Stimmlage editierbar
- **Loeschung (Art. 17):** "Account loeschen"-Button loescht die `users`-Zeile und den User-Folder in der Chor-Dropbox
- **Datenuebertragbarkeit (Art. 20):** Export als JSON
- **Widerspruch:** kein Tracking, kein Marketing → kaum Angriffsflaeche

### Hosting-Wahl

Fuer DSGVO-Konformitaet bevorzugt:

- **Server & DB:** EU-Hoster (Hetzner DE, Scaleway FR, OVH FR)
- **Mail-Service:** Brevo (FR), Mailjet (FR), Resend mit EU-Region
- **Dropbox:** US-Firma, aber der Chor bringt die eigene Dropbox mit — kein zusaetzlicher Datentransfer durch den App-Betreiber

### AVV

- Hoster: Standard-AVV (Hetzner, Scaleway, OVH liefern alle)
- Mail-Service: Standard-AVV (Brevo, Mailjet, Resend liefern)
- Impressum und Datenschutzerklaerung muessen im Client verlinkt werden

## Migration vom aktuellen Stand

Vom heutigen Single-Tenant-ChoirBox zum Modell-A-SaaS in fuenf Phasen:

### Phase 1 — Vorbereitung

- PKCE-Migration abschliessen (siehe `dropbox-pkce-migration.md`)
- Service-Layer weiter konsolidieren, damit API-Router wirklich duenne Wrapper sind
- Frontend-Code pruefen, ob er dropbox-agnostic ist (sollte er schon sein)

### Phase 2 — Multi-Tenant-DB

- SQLite durch Postgres ersetzen
- `choir_id` in alle Tabellen einfuehren
- Alembic fuer Schema-Migrationen einrichten
- Lokale Entwicklungsumgebung mit docker-compose (Postgres-Container)

### Phase 3 — Auth umstellen

- Passwort-Login entfernen
- Magic-Link-Token-Tabelle und -Flow implementieren
- Mail-Service-Integration (Brevo oder Mailjet)
- JWT-Session-Management
- Registrierungscode abschaffen, stattdessen direkte Einladung durch Chorleiter
- Frontend-Login-Page umbauen

### Phase 4 — Dropbox-Layout migrieren

- Neue Ordnerstruktur (`global/`, `media/`, `users/<uuid>/`)
- Migrations-Script fuer Bestands-Dropboxen
- User-IDs als UUIDs statt Integer

### Phase 5 — Deployment

- Zentrale Instanz auf Hetzner Cloud CX22 oder Supabase+Vercel aufsetzen
- Domain einrichten, TLS via Caddy oder Vercel
- Bestehende Chor-Instanzen einladen, zum neuen System zu migrieren
- Impressum, Datenschutzerklaerung, FAQ

### Aufwandsschaetzung

Grob 3-6 Wochen Halbtagsarbeit, je nachdem wie tief jede Phase aufgesetzt wird und ob Phase 1 und 2 parallel laufen.

## Offene Entscheidungen

1. **Hosting-Variante:** Hetzner Cloud VPS (volle Kontrolle, niedriger Preis, DSGVO sehr klar, mehr Ops) vs. Supabase + Vercel (No-Ops, schnelleres Go-Live, US-Firmen mit EU-Region). Siehe eigenes Folge-Dokument `hetzner-vs-supabase.md` (TODO).
2. **Mail-Service:** Brevo (FR, 300/Tag frei) vs. Mailjet (FR, 200/Tag frei) vs. Resend (US mit EU, 3000/Monat frei). Alle DSGVO-tauglich.
3. **Session-Token-Format:** JWT (stateless, keine DB-Lookups) vs. opaque Session-ID (leichter zu widerrufen).
4. **Session-Lebensdauer:** 90 Tage rolling vs. 30 Tage vs. kuerzer mit Refresh-Mechanismus.
5. **Refresh-Token-Verschluesselung:** Fernet mit statischem Server-Key vs. KMS mit rotierendem Key vs. Pro-Chor-Key mit User-Passphrase.
6. **Client-Architektur:** PWA weiter nutzen oder parallel Capacitor-Wrapper fuer native iOS/Android?
7. **Backward-Compatibility:** Alte Single-Tenant-Variante weiter pflegen oder hart ersetzen?
8. **Preismodell:** Kostenfrei fuer alle Choere (vom Betreiber getragen) oder Kostenbeteiligung ab bestimmter Chor-Groesse?

## Skalierung

### Lastprofil bei 1000 Choeren

Annahme: 1000 Choere, durchschnittlich 40 Mitglieder = 40.000 User. Spitzenzeiten (Montag/Dienstag Abend vor der Probe): ca. 4.000-6.000 gleichzeitige Clients.

Zugriffsmuster: App oeffnen → Browse (gecached) → Track waehlen → Stream-URL holen → Audio direkt von Dropbox → gelegentlich Favorit/Transpose speichern. **Read-heavy, write-light** — skaliert grundsaetzlich gut.

### Medien-Streaming (kritischer Pfad)

Medien fliessen **nicht** durch den Server. Der Server holt von Dropbox einen Temporary Link (4h gueltig), leitet den Client per 302 Redirect dorthin weiter. Audio-Traffic geht direkt Client → Dropbox CDN. Das ist der heutige `/stream`-Endpoint und bleibt unveraendert.

### Skalierungsstufen

**Stufe 1 (bis ~200 Choere):** Ein einzelner Hetzner CX22, 4 Uvicorn Worker. Browse-Requests aus Cache beantwortet (~2.000-3.000 req/s). Reicht fuer den Start und die ersten Jahre.

**Stufe 2 (200-1.000 Choere):** 2-3 identische FastAPI-Container hinter Caddy oder HAProxy als Load Balancer. Kein Code-Umbau noetig, weil die App stateless ist — State liegt in Postgres und Redis. Hetzner CX32 statt CX22.

**Stufe 3 (1.000+ Choere):** Hetzner Managed Kubernetes, Autoscaling basierend auf CPU. Redis-Cluster als geteilter Cache. Postgres Read Replicas fuer lesende Queries (95% aller DB-Zugriffe). Optional: CDN fuer statische Frontend-Assets.

### Dropbox API Rate Limits — der echte Engpass

Dropbox Rate Limits gelten **pro App**, nicht pro Chor. Erfahrungswerte: ca. 1.000 Calls/Minute, Bursts bis 5.000. Gegenmassnahmen:

- **Aggressives Server-Side-Caching:** Browse-Ergebnisse, Labels, Settings per TTL oder `content_hash`-Invalidierung. Reduziert API-Calls um 90%+.
- **Request-Batching:** 20 Saenger desselben Chors oeffnen gleichzeitig die App → ein `list_folder`-Call, alle warten auf dasselbe Future.
- **Graceful Degradation bei 429:** Retry mit Backoff, Client bekommt gecachte Daten (auch wenn Minuten alt).
- **Langfristig:** Dropbox API Partner Status beantragen (hoehere Limits, dedizierter Support).

### Architekturprinzipien fuer Skalierbarkeit

Fuenf Dinge, die **jetzt schon** festgenagelt werden muessen, damit Skalierung ein Ops-Upgrade bleibt und kein Architektur-Umbau:

1. **Stateless Server.** Kein In-Process-State, der bei Neustart verloren geht und nicht wiederherstellbar ist. Access-Token-Cache ist OK (regenerierbar), alles andere gehoert in DB oder Redis.
2. **Cache-Layer als eigene Schicht.** Starte mit In-Memory-Dict hinter einem Interface (`cache.get(key)` / `cache.set(key, value, ttl)`), das spaeter durch Redis ersetzt werden kann, ohne den restlichen Code anzufassen.
3. **Separater Worker fuer Background-Jobs.** Magic-Link-Mails, Session-Cleanup, Token-Refresh gehoeren nicht in den Request-Cycle. Starte mit `asyncio`-Task, spaeter Task-Queue (Celery, ARQ, oder Postgres als Queue).
4. **Health-Check und Metriken-Endpoint.** `/health` gibt DB-Connectivity, Dropbox-Token-Validitaet und Cache-Hit-Rate zurueck. 20 Zeilen Code, die bei 1.000 Choeren das Leben retten.
5. **Migrationen mit Alembic von Tag 1.** Keine manuellen `ALTER TABLE`-Statements. Schema-Changes muessen reproduzierbar und automatisiert ausrollbar sein.

## Code-Audit: Migrationsbefunde

Systematische Pruefung des aktuellen Codes auf Stellen, die fuer die Migration zu Modell A angepasst werden muessen. Ergebnis eines vollstaendigen Scans aller Backend- und Frontend-Dateien (Stand: 2026-04-10).

### Kritisch — vor Multi-Tenant-Betrieb zwingend zu fixen

**K1: `_oauth_states` im RAM (`backend/api/dropbox.py`, Zeile 43)**
```python
_oauth_states: dict[str, str] = {}
```
OAuth2 State-Tokens im Arbeitsspeicher. Bei Multi-Worker-Setup (Load Balancer) landet der Callback auf einem anderen Worker als der Authorize-Request → "Invalid state", OAuth-Flow bricht ab.
**Fix:** Kurzlebige DB-Tabelle `oauth_states(state TEXT PK, user_id UUID, created_at, expires_at)`. Analog zur `magic_links`-Tabelle.

**K2: `_login_attempts` im RAM (`backend/api/auth.py`, Zeile 29)**
```python
_login_attempts: dict[str, list[float]] = {}
```
Rate-Limiting nur Worker-lokal. Mit N Workern bekommt ein Angreifer N × 5 Versuche. Bei horizontaler Skalierung komplett wirkungslos.
**Fix:** Postgres-Tabelle `login_attempts(ip TEXT, attempted_at TIMESTAMP)` mit Index auf `(ip, attempted_at)`. Spaeter optional Redis.

**K3: `AppSettings` als Singleton (`backend/models/app_settings.py`, Zeile 8)**
```python
id: int = Field(default=1, primary_key=True)  # Always ID=1!
```
Nur ein Settings-Record fuer alle Choere. `dropbox_refresh_token` ist global, aber Dropbox-Account ist per Chor. Bei Multi-Tenant teilen sich alle Choere einen Token.
**Fix:** Neues Model `ChoirSettings(choir_id UUID FK, dropbox_refresh_token, ...)`. Globale App-Settings (falls noetig) separat halten.

**K4: Dropbox-Integration ist Single-Account (`backend/services/dropbox_service.py`, `backend/api/dropbox.py`)**
`get_dropbox_service(session)` laedt immer den einen globalen Token aus `AppSettings`. Bei Multi-Tenant: Chor A und Chor B teilen sich denselben Dropbox-Account.
**Fix:** `get_dropbox_service(session, choir_id)` → laedt Token aus `ChoirSettings` pro Chor.

**K5: Username global unique (`backend/api/auth.py`, Zeile 169)**
```python
user = session.exec(select(User).where(User.username == username)).first()
```
Username ist global unique statt per Chor. "alice" kann nur in einem Chor existieren.
**Fix:** Compound Unique Constraint `(username, choir_id)`. Alle User-Lookups um `choir_id`-Filter erweitern.

**K6: Models ohne `choir_id` (fehlende Multi-Tenant-Isolation)**
Folgende Models haben keine `choir_id` und damit keine Chor-Isolierung:
- `Document` (`backend/models/document.py`)
- `Section` (`backend/models/section.py`)
- `Annotation` (`backend/models/annotation.py`)
- `UserLabel` (`backend/models/user_label.py`) — Labels sind per `choir_id`, aber UserLabel-Zuweisungen nicht
- `Favorite` (`backend/models/favorite.py`) — funktioniert zufaellig, weil per `user_id` gefiltert, aber unsauber

Queries wie `select(Section).where(Section.folder_path == folder)` filtern nicht nach Chor. User von Chor A sieht Sections von Chor B bei gleichem `folder_path`.
**Fix:** `choir_id` in allen Models hinzufuegen, alle Queries um Chor-Filter erweitern. Groesster Einzelposten der Migration.

**K7: OAuth Callback Redirect hardcoded (`backend/api/dropbox.py`, Zeile 185)**
```python
return RedirectResponse("http://localhost:5174/#/settings?dropbox=connected")
```
In Production eine tote URL.
**Fix:** Frontend-URL aus `request.base_url` oder `.env`-Variable ableiten.

### Hoch — sollte parallel oder kurz nach den kritischen Fixes angegangen werden

**H1: Caches ohne `choir_id`-Isolierung**
- `folder_cache` (`backend/services/dropbox_cache.py`, Zeile 108) — Cache-Keys basieren auf `path`, nicht auf `(choir_id, path)`. Chor A und Chor B mit gleichem Ordnernamen teilen Cache-Eintraege.
- `_pdf_cache` (`backend/services/document_service.py`, Zeile 37) — Gleich Problem: `doc_id` ohne Chor-Kontext.
- `_cache` (`backend/services/github_service.py`, Zeile 16) — Issue-Listing, weniger kritisch.

**Fix:** Alle Cache-Keys mit `choir_id` prefixen: `f"{choir_id}:{path}"`.

**H2: Admin-Create ohne Chor-Boundary-Check (`backend/api/admin.py`, Zeile 46)**
```python
existing = session.exec(select(User).where(User.username == username)).first()
```
Globale Uniqueness-Pruefung statt per Chor. Admin von Chor A kann keinen User "alice" anlegen, wenn "alice" in Chor B existiert.
**Fix:** Filter um `choir_id` erweitern.

**H3: DB-Migrations sind SQLite-spezifisch und fragil (`backend/database.py`)**
- WAL-Mode-Pragma (Zeile 8-14): irrelevant fuer Postgres
- `_pre_migrate()` mit direktem `DROP TABLE`: zu aggressiv fuer Live-Daten
- Migrationsfunktionen nutzen Raw SQL statt Alembic-Revisionen

**Fix:** Komplett ersetzen durch Alembic. Bestehende Migrationslogik als Alembic-Revisionen nachbilden.

### Mittel — kann im Laufe der Migration adressiert werden

**M1: Seed-Script ist Single-Chor-optimistisch (`backend/seed.py`)**
`_seed_default_choir()` erstellt immer "Mein Chor", `_assign_orphans()` weist alle herrenlosen Records dem Default-Chor zu. Bei 1000 Choeren nicht sinnvoll.
**Fix:** Seed nur bei leerer DB ausfuehren. Kein hardcodierter Chor-Name.

**M2: `static/react/` als lokaler Pfad (`backend/app.py`, Zeile 70)**
React-Build wird vom Filesystem ausgeliefert. Bei mehreren Server-Instanzen: nur eine hat den Build. Andere → 404.
**Fix:** React-Build in einen S3-Bucket oder Shared Volume. Oder: als Docker-Image-Layer einbacken (dann hat jede Instanz den Build).

**M3: `localStorage`-Keys nicht Chor-spezifisch (Frontend)**
`choirbox_token`, `choirbox_theme` etc. sind global. Ein User, der zwischen zwei Choeren wechselt, ueberschreibt seine Session.
**Fix:** Prefix mit Chor-ID nach Login: `choirbox_${choirId}_token`.

**M4: API-Basis-URL relativ (`frontend/src/api/client.ts`)**
`fetch('/api${path}')` funktioniert, solange Frontend und Backend auf derselben Domain laufen. Bei getrenntem Deployment (Frontend auf CDN, Backend auf `api.choirbox.de`) bricht es.
**Fix:** API Base URL aus Environment-Variable oder `<meta>`-Tag konfigurierbar machen.

**M5: Fehlende Composite-Indexes**
Haeufige Query-Patterns wie `(choir_id, user_id)`, `(choir_id, folder_path)`, `(choir_id, dropbox_path)` haben keine dedizierten Indexes. Bei grossen Tabellen wird die Performance leiden.
**Fix:** Indexes in Alembic-Migration definieren.

**M6: Registrierungscode-Logik ist Legacy (`backend/api/auth.py`, `backend/seed.py`)**
Globaler `REGISTRATION_CODE` aus `.env` plus Fallback auf `AppSettings.registration_code` — fragile Doppellogik. Im Modell A ersetzt durch direkte Einladung per Chorleiter.
**Fix:** Registrierungscode komplett entfernen, nur per-Chor `Choir.invite_code` behalten.

### Migrations-Reihenfolge (empfohlen)

| Schritt | Finding | Aufwand | Phase |
|---------|---------|---------|-------|
| 1 | K7: OAuth Redirect hardcoded | Trivial | Sofort (auch ohne Modell A sinnvoll) |
| 2 | K1+K2: In-Memory-State → DB | Mittel | Phase 2 (Multi-Tenant-DB) |
| 3 | K3+K4: AppSettings → ChoirSettings + Dropbox per Chor | Aufwaendig | Phase 2 |
| 4 | K5+K6: choir_id in allen Models + Queries | Aufwaendig | Phase 2 |
| 5 | H1: Caches choir_id-aware | Mittel | Phase 2 |
| 6 | H2: Admin Boundary Checks | Mittel | Phase 2 |
| 7 | H3: Alembic einfuehren | Mittel | Phase 2 (Voraussetzung fuer alles) |
| 8 | M1-M6: Seed, Static, Frontend, Indexes | Verteilt | Phase 3-5 |

Geschaetzter Gesamtaufwand fuer Code-Migration: **4-6 Wochen** Halbtagsarbeit (zusaetzlich zu den 3-6 Wochen der Architektur-Phasen, teilweise parallel).

## Risiken und Gegenargumente

**"Ein Ausfall der zentralen Instanz legt alle Choere lahm."**
Stimmt. Gegenmassnahme: simples Setup auf Hetzner + externes Monitoring (Uptimerobot) + Backups. Bei den zu erwartenden Lastprofilen (seltene Logins, gelegentliche Uploads) ist eine einzelne VPS-Instanz mit 99,9 % Uptime realistisch.

**"Der Betreiber sieht die Mail-Adressen aller Chormitglieder."**
Stimmt. Gegenmassnahme: transparente Kommunikation, DSGVO-konformer Betrieb, kein Tracking, kein Marketing. Die Minimaldatenhaltung ist das einzige, was der Betreiber sieht.

**"Wenn der Betreiber die Lust verliert, ist der Dienst weg."**
Stimmt. Gegenmassnahme: Projekt Open-Source halten, Self-Hosting-Variante dokumentieren (jeder Chor kann den Server selbst betreiben, wenn er will), Datenexport fuer alle User ermoeglichen.

**"Der Server haelt verschluesselte Refresh Tokens — das ist ein attraktives Angriffsziel."**
Stimmt. Gegenmassnahme: Server gehaertet, DB-Backups verschluesselt, Zugang auf SSH-Key beschraenkt, regelmaessige Updates, minimal exponierte Oberflaeche. Dropbox Scoped App begrenzt den Blast Radius im Fall eines Lecks.

**"Magic Links koennen in falsche Haende geraten (weitergeleitete Mail, kompromittiertes Postfach)."**
Stimmt, aber das gilt fuer jeden Passwort-Reset auch. Gegenmassnahme: kurze Token-Lebensdauer (15 Minuten), Single-Use, Session-Binding an Device-Fingerprint optional.

## Verwandte Dokumente

- `dropbox-pkce-migration.md` — PKCE-Refactor, Voraussetzung fuer Phase 1
- `ui-ux-coding-standards.md` — Client-seitige Patterns
- `FEATURES.md` — aktueller Funktionsstand
