# ChoirBox — Projektanweisungen

## Projektbeschreibung

Smartphone-optimierte Web-App fuer Chormitglieder zum Ueben mit Audio-Dateien aus einer geteilten Dropbox.
Basiert technologisch auf dem Music CMD Projekt.
Der Entwickler ist ein Web-Entwickler mit begrenzter Erfahrung — antworte direkt, ohne Beschoenigungen, aber erklaerend.

## Tech Stack

- **Backend**: Python 3.13, FastAPI, SQLModel, SQLite, Uvicorn
- **Frontend**: React 19, TypeScript, Vite 8, Zustand (State Management), React Router v7
- **Audio**: HTML5 Audio API (nur MP3)
- **Cloud**: Dropbox API via httpx (eigene ChoirBox Dropbox-App)
- **Config**: `.env` im Projekt-Root (python-dotenv)

## Test-Zugangsdaten (Preview/UI-Tests)

- **Admin Username:** `admin`
- **Admin Password:** `admin`
- **Registrierungscode:** `MeinChor2026`

Diese Daten werden beim ersten Start automatisch ueber `seed.py` aus `.env` angelegt.

## Projektstruktur

```
choirbox/                       <- Git Root
├── CLAUDE.md
├── .env.example
├── run.py                      # Entry Point — startet Uvicorn Dev-Server (Port 8001)
├── requirements.txt
├── frontend/                   # React SPA (TypeScript + Vite)
│   ├── package.json
│   ├── vite.config.ts          # Vite-Config mit Proxy auf Backend :8001
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx            # Entry Point
│       ├── App.tsx             # Router-Setup, Auth-Guard
│       ├── api/                # API-Client (fetch-Wrapper)
│       ├── components/
│       │   ├── layout/         # AppShell, BottomNav, MiniPlayer
│       │   └── ui/             # Wiederverwendbare Komponenten
│       ├── hooks/              # Custom Hooks
│       ├── pages/              # Page-Komponenten (Browse, Favorites, Settings, admin/)
│       ├── stores/             # Zustand Stores (authStore, appStore, playerStore)
│       ├── styles/             # CSS (Mobile-First)
│       └── types/              # TypeScript Type-Definitionen
├── backend/
│   ├── app.py                  # FastAPI App, Router-Registrierung
│   ├── config.py               # Konfiguration aus .env
│   ├── database.py             # DB-Verbindung (SQLite WAL)
│   ├── seed.py                 # Admin-User und Default-Labels aus .env
│   ├── schemas.py              # ActionResponse Standardformat
│   ├── models/                 # SQLModel Datenmodelle
│   │   ├── user.py             # User (mit voice_part)
│   │   ├── app_settings.py     # Singleton: Dropbox-Token, Registrierungscode
│   │   ├── label.py            # Admin-definierte Labels
│   │   ├── favorite.py         # User-Favoriten
│   │   └── user_label.py       # User-Label-Zuweisungen
│   ├── api/                    # FastAPI Router
│   │   ├── auth.py             # Login, Register (mit Code), Logout
│   │   ├── dropbox.py          # OAuth, Browse, Search, Stream
│   │   ├── favorites.py        # CRUD Favoriten
│   │   ├── labels.py           # CRUD Labels + User-Zuweisungen
│   │   └── admin.py            # Nutzerverwaltung, App-Settings
│   └── services/
│       └── dropbox_service.py  # Dropbox API Wrapper (Token-Refresh, Rate-Limiting)
└── static/                     # React-Build-Output
```

## Projekt einrichten (nach git clone)

```bash
# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Dropbox-Credentials eintragen

# Frontend
cd frontend
npm install
cd ..
```

Beim ersten Start passiert automatisch:
- Datenbank wird erstellt
- Admin-User wird aus .env angelegt
- Default-Labels werden erstellt (Sopran, Alt, Tenor, Bass, Schwierig, Geubt)

## App starten (Entwicklung)

Zwei Terminals noetig:

```bash
# Terminal 1 — Backend (API auf Port 8001)
source venv/bin/activate
python run.py

# Terminal 2 — Frontend (Vite Dev-Server auf Port 5174)
cd frontend
npm run dev
```

Oeffnen: **http://localhost:5174** (nicht :8001). Vite proxied `/api`-Requests automatisch ans Backend.

## Production Build

```bash
cd frontend
npm run build    # Output -> ../static/react/
```

Danach reicht `python run.py` allein — FastAPI liefert das React-Build aus `static/react/` aus.

## Entwicklungsprinzipien

### Immer lauffaehig

- Der Prototyp muss **jederzeit lauffaehig** sein. Kein Change darf die App brechen.
- Nach jeder Aenderung **selbststaendig E2E in der UI testen** (Preview-Server nutzen, Screenshot/Snapshot pruefen).
- **Kleine, inkrementelle Changes** bevorzugen. Lieber mehrere kleine Schritte als ein grosser Umbau.

### Aenderungen mit integrierter Vorschau testen

- **Jede Aenderung** muss mit der **integrierten Preview-Funktion** (Claude Code Browser-Vorschau) getestet werden — nicht manuell vom Entwickler.
- Workflow: `preview_start` -> Code aendern -> `preview_snapshot`/`preview_screenshot` -> Ergebnis pruefen -> ggf. fixen.
- Dabei nutzen: `preview_console_logs` (Fehler?), `preview_logs` (Server-Fehler?), `preview_network` (API-Fehler?), `preview_snapshot` (UI korrekt?).
- Fehler nicht ignorieren — sofort fixen, bevor weitergearbeitet wird.

### Git-basiert entwickeln

- Nach **jedem abgeschlossenen Change** fragen: "Soll ich committen?"
- Aussagekraeftige Commit-Messages schreiben.
- Nicht automatisch committen — immer erst fragen.

### Code-Qualitaet

- **Modular entwickeln**: Wiederverwendbare Module bevorzugen, Duplikate vermeiden.
- **Sinnvoll kommentieren**: Code soll wartbar sein, aber nicht mit Kommentaren ueberladen. Nur kommentieren, wo die Logik nicht selbsterklaerend ist.
- **Keine Bugfix-Kommentare** im Code hinterlassen. Wenn ein Bug gefixt ist, gehoeren Erklaerungen dazu in die Commit-Message, nicht in den Code.
- Bestehenden Code lesen und verstehen, bevor Aenderungen vorgeschlagen werden.
- **Keine Hacks oder Workarounds** ohne explizite Genehmigung.

### Architektur-Prinzipien

**Backend — Service-Layer-Pattern:**
- Business-Logik gehoert in `backend/services/`, **nicht** in API-Router.
- API-Router (`backend/api/`) sind **duenne Wrapper**: Request validieren -> Service aufrufen -> Response zurueckgeben.
- Services sind unabhaengig von FastAPI (kein `Request`, kein `HTTPException`) und bekommen `Session` + benoetigte Daten als Parameter.

**Frontend — React-Architektur:**
- **Pages** (`pages/`) sind Route-Komponenten.
- **Wiederverwendbare UI-Komponenten** (`components/ui/`) fuer gemeinsam genutzte Elemente.
- **Layout-Komponenten** (`components/layout/`) fuer AppShell, BottomNav, MiniPlayer.
- **Zustand Stores** (`stores/`) fuer globalen State: `authStore` (Login/Token), `appStore` (Theme, Requests), `playerStore` (Audio-State).
- **Custom Hooks** (`hooks/`) fuer wiederverwendbare Logik.

**Frontend — Hooks-First-Prinzip:**
- **Vor jeder neuen Feature-Implementierung pruefen:** Gibt es wiederverwendbare Logik, die als Hook extrahiert werden sollte?
- **Bestehende Hooks zuerst suchen:** Vor dem Schreiben neuer Logik pruefen, ob ein bestehender Hook das Problem bereits loest.
- **Hooks statt Copy-Paste:** Wenn Code zwischen Pages dupliziert wird, ist das ein Signal fuer einen fehlenden Hook.

**Frontend — Mobile-First:**
- Alle Komponenten werden zuerst fuer Smartphones entworfen (min-width Breakpoints fuer Desktop).
- Touch-Targets mindestens 44px.
- Bottom-Navigation statt Sidebar.
- Mini-Player immer sichtbar wenn ein Track geladen ist.

**Frontend — Deutsche Oberflaechensprache:**
- Alle UI-Texte, Labels, Buttons und Fehlermeldungen auf Deutsch.
- Technische Begriffe (z.B. "Cycle-Play", "Loop") duerfen englisch bleiben wenn sie gaengig sind.

### Im Zweifel nachfragen

- Bei unklaren Anforderungen oder mehreren moeglichen Ansaetzen: **nachfragen statt raten**.
- Keine Over-Engineering-Entscheidungen eigenstaendig treffen.

## Wichtige technische Details

- **Zwei-Port-Architektur (Entwicklung):** Vite Dev-Server (:5174) fuer Frontend mit Hot Module Replacement, proxied API-Calls ans FastAPI-Backend (:8001). In Production liefert FastAPI alles aus.
- **Dropbox OAuth2**: Authorization Code Flow mit Refresh Token. Nur Admin kann Dropbox verbinden — ein Account fuer alle User.
- **Datenbank**: SQLite unter `choirbox.db` im Projekt-Root. WAL-Mode fuer Concurrent Access.
- **Registrierungscode**: In `.env` und in `app_settings` Tabelle. Admin kann ihn ueber die UI aendern.
- **Audio-Streaming**: Dropbox Temporary Links (4h gueltig), gecached im Frontend.
- **React Build Output**: `frontend/` -> `static/react/` (via Vite Build). FastAPI mounted dieses Verzeichnis fuer Production.

## Verwandtes Projekt

Dieses Projekt basiert auf **Music CMD** (`/Users/jregener/Documents/Git/music-cd/`).
Geteilte Technologie: Dropbox Service, Auth-Pattern, API-Client, DB-Setup.
Features wie Cycle-Play werden hier entwickelt und spaeter nach Music CMD portiert.
