# Migrationsplan: Dropbox OAuth auf PKCE umstellen

## Übersicht

Der bestehende Dropbox-OAuth-Flow nutzt den klassischen Authorization Code Flow mit `client_secret`. Dieser Plan beschreibt die Umstellung auf **PKCE** (Proof Key for Code Exchange, RFC 7636). Nach der Umstellung braucht die App kein `DROPBOX_APP_SECRET` mehr — nur noch den `DROPBOX_APP_KEY`, der öffentlich sein darf.

**Scope:** Reiner OAuth-Refactor. Das Multi-User-Modell, die Server/Client-Verteilung und die Token-Speicherung bleiben unverändert. Das Backend behält den Refresh Token in `app_settings` wie bisher.

**Nicht-Scope:** Serverless-Umbau, Verschieben des Flows ins Frontend, zentrale App-Registrierung, Event-Sourcing-Konzept. Das sind separate, größere Entscheidungen.

## Motivation

### Warum PKCE überhaupt?

Im klassischen OAuth-Flow verlangt Dropbox beim Token-Tausch den `client_secret`. Für ein Backend ist das in Ordnung. Aber:

- Sobald ChoirBox als zentral gehosteter Dienst angeboten werden soll oder als selbst gehostete PWA ohne Backend-Anteil am OAuth-Flow, wird das Secret zum Problem — es liegt dann potentiell im Client oder muss dem Chorleiter als weiteres Konfigurationsfeld zugemutet werden.
- Dropbox' eigene Dokumentation empfiehlt PKCE für "public clients" und hat den Schalter "Allow public clients (Implicit Grant & PKCE)" im App Console, der für ChoirBox bereits auf `Allow` steht.
- PKCE ist rückwärtskompatibel mit bestehenden Refresh Tokens, die Umstellung ist damit risikoarm.

### Warum jetzt?

Auch wenn der Flow serverseitig bleibt, ist PKCE die bessere Wahl:

- Der App Secret verschwindet aus `.env` und Code — weniger Geheimnisse, weniger Konfigurationsfelder.
- Ein Self-Hoster, der eine eigene Dropbox-App registriert, muss nur noch den App Key eintragen (nicht mehr Key + Secret).
- PKCE ist eine notwendige Voraussetzung für jeden späteren Umbau Richtung Serverless-Single-User-PWA (siehe `docs/future/`).

## PKCE — die Kurzfassung

Statt `client_secret` zu senden, beweist der Client dynamisch pro Flow, dass er derselbe ist, der den Flow gestartet hat:

1. Vor dem Authorize-Request generiert der Client einen zufälligen **`code_verifier`** (43–128 Zeichen, URL-safe Base64).
2. Daraus wird die **`code_challenge`** berechnet: `BASE64URL(SHA256(code_verifier))` ohne Padding.
3. Der Authorize-Request an Dropbox enthält `code_challenge` + `code_challenge_method=S256`. Dropbox merkt sich die Challenge.
4. Dropbox leitet nach User-Zustimmung mit Authorization Code zurück.
5. Der Token-Tausch sendet den Code + den **ursprünglichen `code_verifier`** (nicht den Hash!). Dropbox verifiziert `SHA256(code_verifier) == code_challenge`.
6. Bei Erfolg: Access Token + Refresh Token. Kein `client_secret` beteiligt.

Wer den Code abfängt, kann ihn nicht einlösen, weil er den `code_verifier` nicht kennt. Dieser existiert nur im Speicher der ursprünglichen Client-Instanz.

## Aktueller Stand (Ist)

### Backend

Drei Code-Stellen verwenden `DROPBOX_APP_SECRET`:

**`backend/config.py`** (Zeile 14–16)

```python
DROPBOX_APP_KEY = os.getenv("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = os.getenv("DROPBOX_APP_SECRET", "")
DROPBOX_REDIRECT_URI = os.getenv("DROPBOX_REDIRECT_URI", "http://localhost:8001/api/dropbox/callback")
```

**`backend/api/dropbox.py` — `GET /api/dropbox/authorize`** (Zeile 97–113)

Der Endpoint baut die Authorize-URL aktuell ohne `code_challenge`. Der `state`-Wert wird in einem In-Memory-Dict `_oauth_states: dict[str, str]` abgelegt und mappt `state → user_id`.

**`backend/api/dropbox.py` — `GET /api/dropbox/callback`** (Zeile 116–185)

Tauscht den Authorization Code gegen Tokens. Der POST an `https://api.dropboxapi.com/oauth2/token` enthält `client_secret`:

```python
resp = await client.post(
    "https://api.dropboxapi.com/oauth2/token",
    data={
        "code": code,
        "grant_type": "authorization_code",
        "client_id": DROPBOX_APP_KEY,
        "client_secret": DROPBOX_APP_SECRET,
        "redirect_uri": DROPBOX_REDIRECT_URI,
    },
)
```

**`backend/services/dropbox_service.py` — `_get_access_token`** (Zeile 33–55)

Refresht Access Tokens mit `client_secret`:

```python
resp = await client.post(
    "https://api.dropboxapi.com/oauth2/token",
    data={
        "grant_type": "refresh_token",
        "refresh_token": self.refresh_token,
        "client_id": DROPBOX_APP_KEY,
        "client_secret": DROPBOX_APP_SECRET,
    },
)
```

### Frontend

**Keine Änderungen nötig.** Der Frontend-Code ist am eigentlichen OAuth-Flow praktisch unbeteiligt:

- `authStore.ts` und `api/client.ts` kennen Dropbox gar nicht.
- `pages/SettingsPage.tsx` ruft nur `GET /api/dropbox/authorize` auf und öffnet die zurückgelieferte URL. Der Redirect nach `/api/dropbox/callback` und die ganze Token-Mechanik läuft serverseitig.

## Zielbild (Soll)

Der OAuth-Flow bleibt komplett serverseitig und verwendet PKCE statt `client_secret`. Der Refresh Token wird weiterhin in `app_settings.dropbox_refresh_token` gespeichert. Alle Backend-Services (`dropbox_service.py`, alle Router-Endpoints in `api/dropbox.py`) funktionieren wie bisher — nur der interne Token-Austausch ändert sich.

Nach der Umstellung ist `DROPBOX_APP_SECRET` im Code nicht mehr nötig und wird aus `.env.example` und `config.py` entfernt.

## Konkreter Plan

### 1. `.env.example` und `backend/config.py`

**Änderung:** `DROPBOX_APP_SECRET` entfernen. Es bleibt nur `DROPBOX_APP_KEY` + `DROPBOX_REDIRECT_URI`.

**Migration für bestehende Installationen:** Der Eintrag in `.env` darf stehen bleiben — er wird nicht mehr gelesen. Kein Breaking Change.

### 2. `backend/api/dropbox.py` — `/authorize` Endpoint

**Änderungen:**

- `code_verifier` generieren mit `secrets.token_urlsafe(64)` (ergibt ~86 Zeichen, im erlaubten Bereich 43–128).
- `code_challenge` berechnen: `base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).rstrip(b"=").decode()`.
- Die `_oauth_states`-Datenstruktur anpassen: aktuell `state → user_id`, neu `state → {"user_id": ..., "code_verifier": ...}`.
- Die Authorize-URL um zwei Parameter erweitern: `code_challenge=<challenge>` und `code_challenge_method=S256`.

**Status-Endpoint `/status`:** Das Feld `"configured"` prüft aktuell `DROPBOX_APP_KEY and DROPBOX_APP_SECRET`. Muss auf `bool(DROPBOX_APP_KEY)` reduziert werden.

### 3. `backend/api/dropbox.py` — `/callback` Endpoint

**Änderungen:**

- Beim Lookup aus `_oauth_states` nicht mehr nur `user_id`, sondern auch `code_verifier` extrahieren.
- Im POST an `/oauth2/token` `client_secret` weglassen, dafür `code_verifier` mitschicken.
- Fehlerfall absichern: Falls kein `code_verifier` für den `state` existiert (z.B. durch Server-Neustart während eines laufenden Flows), klare Fehlermeldung.

Die übrige Callback-Logik (Refresh Token speichern, Account Info abrufen, Redirect zurück in die App) bleibt unverändert.

### 4. `backend/services/dropbox_service.py` — `_get_access_token`

**Änderung:** Im Refresh-POST `client_secret` weglassen, `client_id` behalten.

Dropbox akzeptiert PKCE-Refresh ohne Secret. Der Rest der Datei (`api_call`, `upload_file`, alle High-Level-Methoden) bleibt unverändert.

### 5. Frontend

**Keine Änderungen.** `authStore.ts`, `api/client.ts`, `pages/SettingsPage.tsx` bleiben wie sie sind.

### 6. Dropbox App Console (manuell, einmalig)

Bereits erledigt oder zu prüfen:

- **"Allow public clients (Implicit Grant & PKCE)"** steht auf `Allow`. (Bereits bestätigt.)
- **OAuth 2 → Redirect URIs**: Die in `.env` konfigurierte `DROPBOX_REDIRECT_URI` muss eingetragen sein (typischerweise `http://localhost:8001/api/dropbox/callback` für Dev und die Produktions-URL).
- **Permissions Tab**: Benötigte Scopes aktiv und mit "Submit" bestätigt (`files.metadata.read`, `files.content.read`, `files.content.write`, `files.metadata.write`).
- **App Secret**: Kann im App Console bleiben, wird nicht mehr verwendet.

### 7. Bestehende Dropbox-Verbindungen

Existierende `dropbox_refresh_token`-Werte in `app_settings` funktionieren weiter. Ein Refresh Token ist Flow-unabhängig: Was mit Secret ausgegeben wurde, kann mit PKCE-Refresh (ohne Secret) eingelöst werden. **Kein Re-Authorize nötig.**

Fallback-Szenario: Sollte der Refresh-Call mit PKCE gegen einen alten Refresh Token fehlschlagen, reicht ein manuelles Disconnect/Connect in den Settings (10 Sekunden).

## Test-Strategie

1. **Unit-Test für PKCE-Roundtrip** (neu): `code_verifier` generieren, `code_challenge` berechnen, gegen bekannten Test-Vector aus RFC 7636 Anhang B verifizieren.
2. **Unit-Test für `_oauth_states`-Struktur** (neu): Roundtrip speichern und auslesen mit dem neuen Dict-Format.
3. **Integration-Test, manuell** (einmal nach Umbau): Frischer Connect-Flow end-to-end in der Preview — Klick "Mit Dropbox verbinden" in Settings → Zustimmen im Dropbox-Dialog → Callback → Refresh Token in DB → Browse funktioniert.
4. **Integration-Test Refresh** (einmal): Bestehende Verbindung, Access Token künstlich ungültig machen (z.B. `_access_token = "invalid"`), Browse-Request auslösen, prüfen dass der automatische Refresh ohne `client_secret` durchgeht.
5. **E2E in der Preview** gemäß CLAUDE.md: `preview_start` → Browse-Page → `preview_console_logs` (Fehler?) → `preview_logs` (Server-Fehler?) → Screenshot zur Kontrolle.

## Aufwandsschätzung

| Bereich | Aufwand |
|---------|---------|
| Backend-Änderungen (4 Stellen) | ~40–60 Zeilen |
| Frontend-Änderungen | keine |
| DB-Migrationen | keine |
| Neue Dependencies | keine (`hashlib`, `secrets`, `base64` sind Standard-Lib) |
| Tests (Unit + manueller E2E) | ~1 neuer Unit-Test, 1 manueller Durchlauf |
| **Gesamt** | **1–2 Stunden** |

Passt als kleiner, inkrementeller Change im Sinne der CLAUDE.md.

## Offene Entscheidungen

Zwei Punkte, die vor der Umsetzung zu klären sind:

### 1. Self-hosted bleiben oder zentral hosten?

- **Self-hosted:** ChoirBox bleibt ein Projekt, das jeder Chorleiter selbst deployed. Er muss weiterhin eine eigene Dropbox-App registrieren, aber PKCE reduziert seine Konfiguration: **nur noch den App Key eintragen**, nicht mehr Key + Secret. UX-Verbesserung, aber keine Eliminierung der Registrierung.
- **Zentral gehostet:** Du registrierst die Dropbox-App einmal zentral, alle Chorleiter nutzen denselben App Key. PKCE ist dafür Voraussetzung, aber das eigentliche Hosting ist ein separater, größerer Plan.

Dieser PKCE-Plan funktioniert für beide Varianten und ist eine Voraussetzung für die zentrale Variante.

### 2. `DROPBOX_APP_SECRET` hart entfernen oder weich deprecaten?

- **Hart entfernen (empfohlen):** Variable aus `config.py` und Code streichen. Saubere Lösung.
- **Weich deprecaten:** Variable bleibt lesbar, wird im Code nicht mehr verwendet. Deprecation-Hinweis in `.env.example`. Nach einigen Versionen hart entfernen.

Empfehlung: **hart entfernen**. PKCE ist nicht zusätzlich, sondern der vollwertige Ersatz. Dual-Mode würde den Code unnötig aufblähen.

## Verwandte Dokumente

- `docs/future/pwa-audio-caching.md` — PWA-Grundlage, die langfristig ein Serverless-Szenario ermöglichen könnte
- Music CMD: `docs/evaluations/Dropbox_EventSourcing.md` — JSON-basierter Sync-Ansatz ohne Server, der auf PKCE aufbauen würde
- Music CMD: `docs/evaluations/Dropbox_Native.md` — älterer Dropbox-Native-Ansatz mit Copy-on-Open-Pattern
- RFC 7636 — PKCE-Spezifikation
- [Dropbox OAuth Guide](https://developers.dropbox.com/oauth-guide) — offizielle Dokumentation

## Status

Konzept. Wartet auf Entscheidung zu den beiden offenen Punkten.
