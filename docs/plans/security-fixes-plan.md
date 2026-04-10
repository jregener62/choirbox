# Security-Fixes fuer cantabox.de (Field-Test)

Kopiere diesen Plan als Prompt in Claude Code.

---

## Kontext

ChoirBox laeuft unter cantabox.de als Field-Test mit einigen Choeren. Der Server ist oeffentlich erreichbar. Ein Security-Audit hat folgende Probleme gefunden. Bitte fixe sie der Reihe nach. Nach jedem Fix selbststaendig testen (Server starten, Endpunkt pruefen). Frage mich nach jedem abgeschlossenen Fix, ob ich committen soll.

## Fix 1: Security Headers Middleware

**Datei:** `backend/app.py`

Fuege eine neue Middleware-Klasse `SecurityHeadersMiddleware` hinzu, direkt nach der bestehenden `CacheControlMiddleware` (Zeile ~48). Registriere sie mit `app.add_middleware(SecurityHeadersMiddleware)` direkt nach Zeile 51.

Die Middleware soll bei jeder HTTP-Response folgende Header setzen:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://dl.dropboxusercontent.com; media-src 'self' blob: https://*.dropboxusercontent.com; connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com https://api.github.com
```

**Kein** HSTS-Header — das muss der Reverse-Proxy (Caddy/nginx) setzen, nicht die App.

Implementiere die Middleware im gleichen ASGI-Stil wie die bestehende `CacheControlMiddleware`.

## Fix 2: Query-String-Token entfernen

**Datei:** `backend/api/auth.py`, Funktion `get_current_user` (Zeile 94-110)

Zeile 99-100 lautet aktuell:
```python
    else:
        token = request.query_params.get("token", "")
```

Ersetze den `else`-Block so, dass nur noch der Bearer-Header akzeptiert wird:
```python
    else:
        token = ""
```

Pruefe dann, ob es im gesamten Projekt noch Stellen gibt, die `?token=...` als Query-Parameter an API-Calls haengen (z.B. im Frontend fuer Audio-Streaming oder Downloads). Falls ja: diese muessen auf den `Authorization: Bearer`-Header umgestellt werden. Suche im Frontend nach `token=` und `?token`.

**Ausnahme:** Falls Audio-/Download-Streaming-Endpoints (z.B. `/api/dropbox/stream`) den Token im Query-String brauchen, weil HTML5 Audio `<audio src="...">` keine Custom Headers senden kann, dann behalte den Query-String-Fallback NUR fuer diese spezifischen Endpoints bei, nicht global in `get_current_user`. Dokumentiere die Entscheidung als Code-Kommentar.

## Fix 3: SECRET_KEY absichern

**Datei:** `backend/config.py`, Zeile 18

Aktuell:
```python
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
```

Aendere zu:
```python
SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    import warnings
    warnings.warn(
        "SECRET_KEY ist nicht gesetzt! Nutze einen zufaelligen Wert. "
        "Setze SECRET_KEY in .env fuer Production.",
        stacklevel=2,
    )
    import secrets as _s
    SECRET_KEY = _s.token_hex(32)
```

Das sorgt dafuer, dass in Development automatisch ein zufaelliger Key erzeugt wird (statt eines vorhersagbaren Default), und in Production eine Warnung erscheint, wenn der Key fehlt. Der alte Default-String `"dev-secret-change-in-production"` verschwindet komplett.

## Fix 4: Dropbox Refresh Token verschluesseln

**Datei:** `backend/models/app_settings.py` und `backend/services/dropbox_service.py` und `backend/api/dropbox.py`

Der Dropbox Refresh Token liegt aktuell im Klartext in der SQLite-DB (`app_settings.dropbox_refresh_token`). Verschluessele ihn mit `cryptography.fernet`.

### Schritt 4a: Dependency hinzufuegen

Pruefe ob `cryptography` bereits in `requirements.txt` ist. Falls nicht, fuege `cryptography` hinzu.

### Schritt 4b: Crypto-Utility erstellen

Erstelle `backend/utils/crypto.py`:

```python
"""Symmetric encryption for sensitive DB fields using Fernet."""

from cryptography.fernet import Fernet, InvalidToken
from backend.config import SECRET_KEY

# Fernet needs a 32-byte URL-safe base64 key.
# Derive one from SECRET_KEY via SHA256.
import hashlib, base64

def _derive_fernet_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)

_fernet = Fernet(_derive_fernet_key(SECRET_KEY))

def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()

def decrypt(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()

def is_encrypted(value: str) -> bool:
    """Check if a value looks like a Fernet token."""
    try:
        _fernet.decrypt(value.encode())
        return True
    except (InvalidToken, Exception):
        return False
```

### Schritt 4c: Token beim Speichern verschluesseln

In `backend/api/dropbox.py`, suche die Stelle wo `settings.dropbox_refresh_token = ...` gesetzt wird (im OAuth-Callback nach Token-Exchange). Aendere diese Stelle so, dass der Token vor dem Speichern verschluesselt wird:

```python
from backend.utils.crypto import encrypt
settings.dropbox_refresh_token = encrypt(refresh_token)
```

### Schritt 4d: Token beim Lesen entschluesseln

In `backend/services/dropbox_service.py` (Funktion `get_dropbox_service` oder `_get_access_token`), suche die Stelle wo `settings.dropbox_refresh_token` gelesen wird. Entschluessele vor der Verwendung:

```python
from backend.utils.crypto import decrypt, is_encrypted
raw_token = settings.dropbox_refresh_token
if raw_token and is_encrypted(raw_token):
    raw_token = decrypt(raw_token)
```

Die `is_encrypted`-Pruefung stellt sicher, dass alte Klartext-Tokens weiterhin funktionieren (Backward Compatibility). Beim naechsten Speichern (Reconnect) wird der Token dann verschluesselt.

### Schritt 4e: Bestehenden Token migrieren

Fuege in `backend/app.py` im `on_startup`-Event eine einmalige Migration hinzu, die einen bestehenden Klartext-Token verschluesselt:

```python
from backend.utils.crypto import encrypt, is_encrypted

# In on_startup, nach create_db_and_tables():
with next(get_session()) as session:
    settings = session.get(AppSettings, 1)
    if settings and settings.dropbox_refresh_token and not is_encrypted(settings.dropbox_refresh_token):
        settings.dropbox_refresh_token = encrypt(settings.dropbox_refresh_token)
        session.add(settings)
        session.commit()
```

## Fix 5: CORS Middleware

**Datei:** `backend/app.py`

Fuege nach den Imports hinzu:
```python
from fastapi.middleware.cors import CORSMiddleware
```

Registriere nach Zeile 50 (`app = FastAPI(...)`):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cantabox.de",
        "http://localhost:5174",   # Vite Dev Server
        "http://localhost:8001",   # Backend Dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Fix 6: OAuth Callback Redirect fixen

**Datei:** `backend/api/dropbox.py`

Suche die Stelle mit dem hardcodierten Redirect nach localhost:
```python
return RedirectResponse("http://localhost:5174/#/settings?dropbox=connected")
```

Es gibt vermutlich noch einen zweiten Redirect auf `localhost:5174` (Fehlerfall). Suche nach allen Vorkommen von `localhost:5174` in dieser Datei.

Ersetze alle durch eine dynamische URL, die auf der eingehenden Request basiert:

```python
# Bestimme Frontend-Origin aus dem Request
frontend_url = str(request.base_url).rstrip("/")
# In Production ist base_url z.B. https://cantabox.de
# In Development ist es http://localhost:8001 — dann auf Vite-Port umleiten
if "localhost:8001" in frontend_url:
    frontend_url = "http://localhost:5174"
return RedirectResponse(f"{frontend_url}/#/settings?dropbox=connected")
```

Wende das gleiche Pattern auf alle `RedirectResponse`-Stellen in der Datei an, die nach localhost zeigen.

## Fix 7: Impressum und Datenschutz (Platzhalter)

**Datei:** Neuer API-Endpoint oder statische Seiten

Erstelle zwei minimale Endpoints:

```python
# In backend/app.py oder einem neuen Router

@app.get("/impressum")
def impressum():
    return FileResponse(str(BASE / "static" / "impressum.html"))

@app.get("/datenschutz")
def datenschutz():
    return FileResponse(str(BASE / "static" / "datenschutz.html"))
```

Erstelle `static/impressum.html` und `static/datenschutz.html` als einfache HTML-Seiten mit Platzhalter-Text:

**impressum.html:** Ueberschrift "Impressum", Hinweis "Angaben gemaess § 5 TMG" und Platzhalter fuer Name, Anschrift, E-Mail.

**datenschutz.html:** Ueberschrift "Datenschutzerklaerung", Abschnitte fuer: Verantwortlicher, Welche Daten (E-Mail bei Registrierung, gehashtes Passwort, IP in Server-Logs, Dropbox-Verbindung), Zweck (Chor-App-Funktionalitaet), Rechtsgrundlage (Art. 6 Abs. 1 lit. b DSGVO), Speicherdauer, Rechte (Auskunft, Berichtigung, Loeschung), Kontakt.

Beide Seiten auf Deutsch, schlichtes Design, keine externen Ressourcen.

Fuege dann im Frontend (z.B. in der Login-Seite und/oder den Settings) Links auf `/impressum` und `/datenschutz` hinzu. Oeffne die Links in einem neuen Tab (`target="_blank"`).

## Reihenfolge und Tests

1. Fix 1 (Security Headers) → Server starten → mit curl pruefen: `curl -I https://cantabox.de` — Headers muessen erscheinen
2. Fix 2 (Query-String-Token) → Login testen, Audio-Streaming testen
3. Fix 3 (SECRET_KEY) → Server starten → Warning darf nur erscheinen wenn SECRET_KEY nicht in .env
4. Fix 4 (Token-Verschluesselung) → Dropbox-Verbindung testen (Disconnect → Reconnect)
5. Fix 5 (CORS) → Aus anderem Origin testen (sollte geblockt werden)
6. Fix 6 (OAuth Redirect) → Dropbox Connect auf cantabox.de testen (nicht localhost)
7. Fix 7 (Impressum/Datenschutz) → Seiten aufrufen, Links im Frontend pruefen

Bitte nach jedem Fix fragen, ob ich committen soll. Standard-Abschluss: FEATURES.md aktualisieren (Bugfix-Sektion).
