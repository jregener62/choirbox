# Implementierungsplan: Issues-Feature (FAB + Bottom Sheet)

## Übersicht

In-App Issue-Tracker als FAB + Bottom Sheet, nur sichtbar für die neue Rolle `developer`.
Issues werden direkt gegen die GitHub API (Repo `jregener62/music-cmd`) erstellt, gelesen und geschlossen.
Issue-Types: **bug**, **feature**, **idea**, **todo** (als GitHub Labels abgebildet).

**Wichtig:** Alle Änderungen auf Branch `feature/issues-page` — NICHT auf `main` committen.

## Vorbereitung

```bash
git checkout -b feature/issues-page
```

Neue `.env`-Variable (in `.env` und `.env.example` ergänzen):

```
GITHUB_TOKEN=ghp_...
GITHUB_REPO=jregener62/music-cmd
```

---

## Schritt 1: Neue Rolle `developer`

### Backend — `backend/models/user.py`

Das `role`-Feld akzeptiert bereits beliebige Strings. Keine Model-Änderung nötig.

### Backend — `backend/seed.py`

Admin-User aus `.env` bekommt `role="developer"` statt `role="admin"`.

### Backend — `backend/config.py`

Neue Config-Werte:

```python
GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO: str = os.getenv("GITHUB_REPO", "jregener62/music-cmd")
```

### Frontend — `frontend/src/utils/roles.ts`

```typescript
export type Role = 'guest' | 'member' | 'pro-member' | 'chorleiter' | 'admin' | 'developer'

const ROLE_LEVELS: Record<Role, number> = {
  guest: 0,
  member: 1,
  'pro-member': 2,
  chorleiter: 3,
  admin: 4,
  developer: 5,
}

export const ROLE_LABELS: Record<Role, string> = {
  guest: 'Gast',
  member: 'Mitglied',
  'pro-member': 'Pro-Mitglied',
  chorleiter: 'Chorleiter',
  admin: 'Admin',
  developer: 'Developer',
}

export const ALL_ROLES: Role[] = ['guest', 'member', 'pro-member', 'chorleiter', 'admin', 'developer']
```

### Frontend — `frontend/src/types/index.ts`

User-Interface: `role` Union-Type um `'developer'` erweitern.

### Commit

```
feat: add developer role (level 5, above admin)
```

---

## Schritt 2: GitHub API Proxy (Backend)

### Neuer Service — `backend/services/github_service.py`

```python
import httpx
from backend.config import GITHUB_TOKEN, GITHUB_REPO

GITHUB_API = "https://api.github.com"
HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

async def list_issues(state: str = "open", labels: str | None = None) -> list[dict]:
    """Offene Issues abrufen. Optional nach Label filtern."""
    params = {"state": state, "per_page": 50, "sort": "created", "direction": "desc"}
    if labels:
        params["labels"] = labels
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/issues",
            headers=HEADERS, params=params
        )
        resp.raise_for_status()
        # Pull Requests rausfiltern (GitHub API liefert die mit)
        return [i for i in resp.json() if "pull_request" not in i]

async def create_issue(title: str, body: str = "", labels: list[str] | None = None) -> dict:
    """Neues Issue erstellen."""
    payload = {"title": title, "body": body}
    if labels:
        payload["labels"] = labels
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/issues",
            headers=HEADERS, json=payload
        )
        resp.raise_for_status()
        return resp.json()

async def close_issue(issue_number: int) -> dict:
    """Issue schließen."""
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/issues/{issue_number}",
            headers=HEADERS, json={"state": "closed"}
        )
        resp.raise_for_status()
        return resp.json()
```

### Neuer Router — `backend/api/issues.py`

Dünner Wrapper nach dem Service-Layer-Pattern:

- `GET /api/issues` — ruft `list_issues()` auf, gibt kompaktes JSON zurück
- `POST /api/issues` — Body: `{ title, body?, type }` wobei `type` eines von `bug|feature|idea|todo`
- `PATCH /api/issues/{number}/close` — ruft `close_issue()` auf

**Alle Endpoints erfordern Rolle `developer`.**

Response-Format für die Liste (Frontend-freundlich gemappt):

```json
[
  {
    "number": 23,
    "title": "Player stoppt bei Bildschirmsperre",
    "type": "bug",
    "labels": ["bug", "audio"],
    "created_at": "2026-03-28T10:00:00Z",
    "html_url": "https://github.com/jregener62/music-cmd/issues/23"
  }
]
```

Mapping-Logik: Wenn ein Issue das Label `bug`, `feature`, `idea` oder `todo` hat → das wird zum `type`. Sonst Default `todo`.

### Router registrieren — `backend/app.py`

```python
from backend.api.issues import router as issues_router
app.include_router(issues_router, prefix="/api")
```

### Commit

```
feat: add GitHub issues API proxy (GET/POST/PATCH, developer-only)
```

---

## Schritt 3: Frontend — Issue Store

### Neuer Store — `frontend/src/stores/issueStore.ts`

Zustand Store mit:

```typescript
interface Issue {
  number: number
  title: string
  type: 'bug' | 'feature' | 'idea' | 'todo'
  labels: string[]
  created_at: string
  html_url: string
}

interface IssueState {
  issues: Issue[]
  isLoading: boolean
  isOpen: boolean          // Bottom Sheet offen/zu
  showNewForm: boolean     // Neues-Issue-Formular anzeigen
  fetchIssues: () => Promise<void>
  createIssue: (title: string, body: string, type: string) => Promise<void>
  closeIssue: (number: number) => Promise<void>
  setOpen: (open: boolean) => void
  setShowNewForm: (show: boolean) => void
}
```

API-Calls über den bestehenden fetch-Wrapper aus `api/`.

### Commit

```
feat: add issueStore (Zustand) for issue state management
```

---

## Schritt 4: Frontend — UI-Komponenten

### Neue Dateien unter `frontend/src/components/issues/`

**`IssueFab.tsx`** — Der Floating Action Button

- Amber-farbig (#f59e0b), Bug-Icon (lucide `Bug`)
- Position: `fixed`, `bottom: 80px`, `right: 16px` (über BottomNav/MiniPlayer)
- Nur rendern wenn `hasMinRole(user.role, 'developer')`
- Tap öffnet `issueStore.setOpen(true)`
- Badge-Counter mit Anzahl offener Issues

**`IssueSheet.tsx`** — Das Bottom Sheet

- Overlay mit `position: fixed`, dunkler Backdrop
- Sheet von unten mit `border-radius: 20px 20px 0 0`
- Header: Bug-Icon, "Issues" Titel, + Button
- Zähler: "5 offen · 12 geschlossen"
- Scrollbare Issue-Liste
- Schließen durch Tap auf Backdrop oder Swipe-Down auf Handle

**`IssueItem.tsx`** — Einzelnes Issue in der Liste

- Farbiger Dot: rot (bug), grün (feature), gelb (idea), blau (todo)
- Titel, Labels als kleine Chips, Issue-Nummer (#23)
- Swipe-Left zeigt zwei Aktionen:
  - Grün: "Schließen" (ruft `closeIssue` auf)
  - Accent: "GitHub" (öffnet `html_url` in neuem Tab)
- Swipe-Implementierung via Touch-Events (`touchstart`, `touchmove`, `touchend`)
  - Threshold: 60px bevor Aktionen sichtbar werden
  - Snap: Entweder ganz offen (128px) oder zurück

**`IssueForm.tsx`** — Neues Issue erstellen

- Titel-Input (Pflicht)
- Textarea für Body (optional)
- Type-Buttons: bug | feature | idea | todo (Toggle-Gruppe, Default: todo)
- Send-Button → `createIssue()` → Sheet bleibt offen, Liste refreshed

### Styles — `frontend/src/styles/issues.css`

Eigene CSS-Datei für alle Issue-Komponenten. Importiert in `main.tsx` oder in den Komponenten.
Verwendet die bestehenden CSS-Variablen aus `:root`. Issue-Type-Farben:

```css
--issue-bug: var(--danger);      /* #dc2626 / #f87171 */
--issue-feature: var(--success); /* #16a34a / #4ade80 */
--issue-idea: var(--warning);    /* #d97706 / #fbbf24 */
--issue-todo: var(--accent);     /* #6366f1 / #818cf8 */
```

### Commit

```
feat: add Issue UI components (FAB, BottomSheet, Item with swipe, Form)
```

---

## Schritt 5: Integration in AppShell

### `frontend/src/components/layout/AppShell.tsx`

FAB und Sheet in die AppShell einbauen (nur für Developer):

```tsx
import { useAuthStore } from '@/stores/authStore'
import { hasMinRole } from '@/utils/roles'
import { IssueFab } from '@/components/issues/IssueFab'
import { IssueSheet } from '@/components/issues/IssueSheet'

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const isDeveloper = hasMinRole(user?.role ?? 'guest', 'developer')

  return (
    <div className="app-shell">
      <PwaInstallGuide />
      <div className="main-content">
        {children}
      </div>
      {isDeveloper && <IssueFab />}
      {isDeveloper && <IssueSheet />}
    </div>
  )
}
```

### Commit

```
feat: integrate IssueFab + IssueSheet into AppShell (developer-only)
```

---

## Schritt 6: Seed-Daten und GitHub Labels

### `backend/seed.py`

Admin-User auf `role="developer"` setzen (nur beim Seeden).

### GitHub Labels sicherstellen

Beim ersten `GET /api/issues` prüfen ob die Labels `bug`, `feature`, `idea`, `todo` im Repo existieren. Falls nicht, per GitHub API anlegen (einmalig, kann auch manuell gemacht werden).

### Commit

```
feat: update seed to set admin as developer, ensure GitHub labels
```

---

## Schritt 7: Testen

1. Backend starten, Login als `admin` (jetzt `developer`)
2. FAB sollte sichtbar sein auf allen Seiten
3. Tap → Bottom Sheet öffnet, zeigt Issues aus GitHub
4. + Button → Formular, Issue erstellen mit Type `todo`
5. Swipe-Left auf Issue → Schließen / GitHub-Link testen
6. Ausloggen, als normaler User einloggen → FAB nicht sichtbar
7. Mobile testen (Touch-Events, Sheet-Höhe, Swipe-Threshold)

---

## Datei-Übersicht (neue/geänderte Dateien)

```
Geändert:
  .env.example                          # + GITHUB_TOKEN, GITHUB_REPO
  backend/config.py                     # + GITHUB_TOKEN, GITHUB_REPO
  backend/app.py                        # + issues router
  backend/seed.py                       # admin → developer
  frontend/src/utils/roles.ts           # + developer rolle
  frontend/src/types/index.ts           # + developer in User type
  frontend/src/components/layout/AppShell.tsx  # + FAB + Sheet

Neu:
  backend/services/github_service.py    # GitHub API Wrapper
  backend/api/issues.py                 # REST Endpoints
  frontend/src/stores/issueStore.ts     # Zustand Store
  frontend/src/components/issues/IssueFab.tsx
  frontend/src/components/issues/IssueSheet.tsx
  frontend/src/components/issues/IssueItem.tsx
  frontend/src/components/issues/IssueForm.tsx
  frontend/src/styles/issues.css
```

## Mockup-Referenz

Visuelles Design: `docs/mockups/issues-a-fab-bottomsheet.html`
