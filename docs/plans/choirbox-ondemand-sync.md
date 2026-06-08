# ChoirBox — Serverloser Free-Tier mit Files-On-Demand-Sync

**Status:** Entwurf / Diskussionsgrundlage
**Datum:** 2026-06-07
**Verwandt:** `choirbox-freemium-diskussion.md`, `capacitor-native-app.md`, `choirbox-saas-architektur.md`

## Scope & Motivation

Dieses Dokument beschreibt eine **serverlose Variante** von CantaBox als native App, bei der die Chormitglieder ohne eigenen Server, ohne Backend und ohne Dropbox-Account auskommen. Es konkretisiert den Free-Tier aus `choirbox-freemium-diskussion.md` und das daraus erarbeitete Sync-Konzept.

Premisse:

- **Die Dropbox des Chorleiters ist die Single Source of Truth (SSOT).**
- **Der Chorordner wird per Link mit den Chormitgliedern geteilt** (read-only).
- Die Mitglieder-App zieht den Stand selbst (Pull), niemand verschickt Bundles von Hand.

Abgrenzung zu Modell A (`choirbox-saas-architektur.md`): Modell A loest dieselben Probleme mit einem zentralen Server. Dieses Dokument ist der **server-lose Gegenentwurf** fuer den kostenlosen Tier — beide koennen koexistieren (gleiche UI, unterschiedliche Daten-Adapter, siehe Freemium-Doc).

### Ziele

- Mitglieder serverlos: kein Account, kein Token, kein Backend — nur der geteilte Link.
- UX wie Dropbox/iCloud "Files On-Demand": Liste sehen, antippen laedt, Symbol zeigt Offline-Status.
- Robuste Offline-Nutzung nach dem Download.
- Eine UI-Codebasis fuer Web und native App (Capacitor).

### Nicht-Ziele

- Schreibzugriff der Mitglieder auf die SSOT (rein lesend).
- Echtzeit-Sync / Push (manuell angetretener Sync genuegt).
- Streaming ohne lokale Ablage (bewusste Entscheidung: Download-to-own).
- Multi-Chor pro Geraet (ein Chor pro Geraet ist der Default).

## Architektur-Ueberblick

Die Architektur ist **asymmetrisch**:

- **Chorleiter = authentifizierter Publisher.** Hat Dropbox-OAuth (PKCE), pflegt den Ordner und veroeffentlicht ein Manifest. Sein Geraet ist faktisch "der Server".
- **Mitglieder = unauthentifizierte Puller.** Brauchen weder Dropbox-Account noch Token. Sie lesen das Manifest und laden Dateien ueber Per-Datei-Shared-Links.

### Warum kein geteilter Token

Verworfene Idee: den Refresh Token in die Dropbox legen und per Link verteilen.

- Ein **Write-Token** im teilbaren Link = jedes Mitglied und jeder Leak kann die SSOT ueberschreiben/loeschen. Nicht akzeptabel.
- Ein **read-only, App-Folder-scoped Token** ist machtgleich zum read-only Inhalts-Link, aber als wiederverwendbares Credential schlechter zu ueberblicken und nur global widerrufbar.
- Grundsatz: das *Lesen* teilen (Link), nicht den *Schluessel* (Token). Deckt sich mit der PKCE-Migration ("kein Secret im Client") und Modell A (Token nur server-seitig verschluesselt).

## Manifest-Ansatz

Der Kern: Der Ordner-Link allein erlaubt nur "alles als ZIP" — keine Liste-ohne-Download. Deshalb publiziert die Chorleiter-App eine **`manifest.json`** in den geteilten Ordner. Das Manifest ist gleichzeitig das Verzeichnis (Liste) und der Index der Download-Links.

### Format (Skizze, v1)

```json
{
  "schema_version": 1,
  "published_at": "2026-06-07T10:00:00Z",
  "assets": [
    {
      "asset_id": "uuid-stabil-pro-song",
      "name": "Weihnachtsoratorium",
      "asset_hash": "aggregat-hash",
      "total_size": 25165824,
      "files": [
        {
          "rel_path": "Texte/sopran.cho",
          "content_hash": "dropbox-content-hash",
          "size": 4096,
          "url": "https://www.dropbox.com/scl/fi/.../sopran.cho?rlkey=...&dl=1"
        }
      ]
    }
  ]
}
```

- `asset_id`: **stabile UUID pro `.song`-Verzeichnis**. Ueberlebt Umbenennen/Verschieben. User-Daten (Favoriten etc.) referenzieren ausschliesslich `asset_id`.
- `asset_hash`: Aggregat-Hash ueber die sortierte Liste der `{rel_path, content_hash}`. Entscheidet "hat sich am Song etwas geaendert?".
- `content_hash`: Dropbox-`content_hash` pro Datei (SHA-256 ueber 4-MB-Bloecke). Dient Delta-Erkennung und Integritaetspruefung.
- `url`: stabiler Per-Datei-Shared-Link. **Dreh- und Angelpunkt** — Sub-Pfade aus `scl`-Ordnerlinks sind unzuverlaessig, deshalb pro Datei ein eigener Link.

Das Mitglied gibt einmalig den **Shared-Link der `manifest.json`** ein (stabil), nicht den Ordner-Link.

## Granularitaet & Transfer-Modell

**Entschieden:**

1. **Granularitaet = `.song`.** Bedien-Einheit ist der ganze Song (ein Tap = ganzer Song).
2. **Download-to-own.** Kein Streaming; nach dem Download wird lokal abgespielt. Das umgeht Range-Streaming und schont das Dropbox-Shared-Link-Traffic-Limit (jede Datei einmal pro Version statt pro Abspielvorgang).

**Clou — Bedienung pro Song, Transfer pro Datei:** Unter der Haube laeuft der Transfer als Datei-Delta. Beim Update werden nur geaenderte/neue Dateien geladen, entfernte lokal geloescht, unveraenderte bleiben. So bleibt die UX simpel, ohne bei einer Textaenderung die ganze Audio-Datei neu zu ziehen.

## Statusmodell pro `.song`

| Zustand | Bedingung | Symbol |
|---|---|---|
| **Nur online** | keine Datei des Songs lokal | Wolke |
| **Wird geladen** | Download laeuft | Ring "3/7" |
| **Offline verfuegbar** | alle Dateien lokal, `asset_hash` = Manifest | Haken |
| **Update verfuegbar** | lokal, aber `asset_hash` != Manifest | Wolke-mit-Pfeil |
| **Unvollstaendig** | Download abgebrochen, nur Teil lokal | Warnsymbol -> erneut laden |

Download ist **atomar pro Song**: erst alle (Delta-)Dateien laden + Hashes pruefen, dann den Song als offline markieren. Abbruch -> Zustand "unvollstaendig", beim naechsten Tap wird fortgesetzt.

## Lokales Datenmodell (Mitglied-Geraet)

```
catalog_asset        // aus Manifest gespiegelt (= die Liste, auch offline sichtbar)
  asset_id, name, asset_hash, total_size

catalog_file         // aus Manifest, gehoert zu asset
  asset_id, rel_path, content_hash, size, url

local_asset          // Download-Status pro Song
  asset_id, downloaded_asset_hash, state, downloaded_at

local_file           // welche Einzeldateien wirklich liegen (Delta + Integritaet)
  asset_id, rel_path, cached_hash, local_path
```

- Status = `catalog_asset.asset_hash` vs. `local_asset.downloaded_asset_hash`.
- Manifest wird lokal gespiegelt -> Liste samt Symbolen funktioniert **offline**.
- User-DB (Favoriten, Notizen, lokale Audio-Anhaenge) bleibt davon getrennt und unberuehrt.

## Operationen

1. **"Aktualisieren" (Sync)** = nur Manifest laden (winzig). Rechnet alle Song-Status neu (neu = Wolke, geaendert = Update, entfernt = ausgegraut/raus). Kein Inhalt.
2. **Tap auf Song (Download)** = Datei-Delta laden -> jede Datei gegen `content_hash` pruefen -> atomar committen. Fortschritt als "N/M Dateien".
3. **"Offline-Kopie loeschen" (Evict)** = lokale Dateien des Songs weg, `local_asset` raus -> zurueck zu Wolke. Plus "Offline-Groesse gesamt" in den Einstellungen.

## Edge-Cases

- **Neue Datei im Song** -> `asset_hash` aendert sich -> Update; Tap laedt nur die neue Datei.
- **Datei entfernt** -> Update; beim Laden wird die lokale Kopie geloescht.
- **Song ganz aus Manifest entfernt** -> falls offline gecacht: ausgegraut, aber **weiter abspielbar** (verwaist, nicht loeschen); sonst faellt er aus der Liste.
- **Song umbenannt/verschoben** -> `asset_id` stabil -> fuer das Mitglied unsichtbar, Favoriten ueberleben.
- **Integritaet/Abbruch** -> in Temp-Datei laden, Hash pruefen, erst dann in den Cache verschieben.
- **Groesse vor Download anzeigen** ("Stueck . 24 MB").

## Plattform-Voraussetzung

- **Capacitor-Native noetig.** Persistenter Datei-Cache via `@capacitor/filesystem`; iOS-PWA-Storage wuerde nach 7 Tagen geloescht (ITP, siehe `capacitor-native-app.md`).
- CORS ist **kein** Hindernis: der Content-Host sendet `access-control-allow-origin: *` (verifiziert, siehe unten) — auch eine Web-PWA koennte `fetch()`en. Hauptgrund fuer Native bleibt der **persistente Speicher** (ITP-7-Tage-Eviction der PWA).
- Range/Streaming **verifiziert** (HTTP 206) — siehe Abschnitt „Verifikation: Shared-Link-Mechanik".

---

## Notwendige Installationen (Capacitor / iOS)

Stand des Entwickler-Macs (geprueft 2026-06-07):

| Werkzeug | Status |
|---|---|
| Xcode 26.5 | vorhanden |
| Command Line Tools | gesetzt |
| Node v24 / npm 11 | vorhanden |
| Homebrew | vorhanden |
| iOS Simulator | vorhanden |
| **CocoaPods** | **fehlt** -> `brew install cocoapods` |
| **Capacitor im Projekt** | **fehlt** (keine Deps, keine config, kein `ios/`) |

Kein Apple-Developer-Account noetig fuer den **Simulator**. Fuer ein echtes iPhone: kostenlose Apple-ID (7-Tage-Signatur) bzw. bezahlter Account (99 USD/Jahr) fuer TestFlight/App Store.

Einmaliges Setup (aus `frontend/`, Build-Output ist `../static/react`):

```bash
brew install cocoapods
cd frontend
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/filesystem
npx cap init CantaBox de.cantabox.app --web-dir ../static/react
npm run build
npx cap add ios
npx cap sync
npx cap open ios   # Xcode -> Run -> Simulator
```

Alltag danach: `npm run build && npx cap sync`, dann in Xcode neu starten — oder Live-Reload (`server.url` auf den Vite-Dev-Server), dann reloaden Browser und Simulator zusammen.

### Hinweis: eine UI, zwei Auslieferungswege

Es gibt **eine** React-Codebasis. Geteilt: die gesamte UI. Divergent: eine duenne Adapter-Schicht (native Plugins, Datenquelle, Feature-Gating ueber `Capacitor.isNativePlatform()`). Web und iOS sind damit gleichzeitig entwickelbar.

---

## Kosten & Lizenzen

| Posten | Lizenz / Kosten | Haeufigkeit |
|---|---|---|
| Capacitor-Core + offizielle Plugins (`@capacitor/...`, inkl. `@capacitor/filesystem`) | MIT, kostenlos, kommerzielle Nutzung erlaubt | — |
| CocoaPods | MIT, kostenlos | — |
| Apple Developer Program | 99 USD | jaehrlich (nur fuer echtes Geraet / TestFlight / App Store; Simulator gratis) |
| Google Play Developer | 25 USD | einmalig (falls Android) |
| Dropbox (Chorleiter) | bringt der Chorleiter selbst mit | — |

- **MIT** verlangt nur das Beibehalten des Lizenzhinweises, kein Copyleft — eigener Code muss nicht offengelegt werden, unproblematisch fuer den Premium-Tier.
- **Ionic-Bezahlprodukte** (Appflow CI/CD, Enterprise-Plugins) sind optional und werden **nicht** benoetigt.
- **Community-Plugins** (nicht `@capacitor/...`) haben eigene Lizenzen — vor Einsatz einzeln pruefen.
- **Urheberrecht der Inhalte:** Texte/Akkorde/PDFs/Audio liegen in der Dropbox des Chorleiters; die App ist Player/Archiv, kein Distributionsdienst. Haftungsausschluss vorsehen (siehe `choirbox-freemium-diskussion.md`).

---

## Grober Implementations-Plan

### Phase 0 — Capacitor-Grundgeruest (1-2 Tage)

- CocoaPods + Capacitor installieren, `ios/` erzeugen, bestehende App im Simulator zum Laufen bringen.
- Plattform-Abstraktion `frontend/src/utils/platform.ts` (siehe `capacitor-native-app.md`).
- Networking-Stolperstein loesen: API-Basis-URL konfigurierbar (Befund M4 aus der SaaS-Doc) oder Live-Reload auf den Dev-Server.

### Phase 1 — Daten-/Adapter-Schicht trennen (2-4 Tage)

- Datenzugriff hinter ein Interface legen (z. B. `ContentSource`), damit Server-Variante und serverlose Variante austauschbar sind.
- Klare Trennung User-DB <-> Content-Layer (Vorbedingung aus der Freemium-Doc).
- Entitlement-/Feature-Gate an *einer* zentralen Stelle (Hook/Store).

### Phase 2 — Lokaler Content-Store (3-5 Tage)

- SQLite (oder strukturierter Store) auf dem Geraet: `catalog_asset`, `catalog_file`, `local_asset`, `local_file`.
- Datei-Cache via `@capacitor/filesystem` (App-Storage-Bereich).
- Dropbox-`content_hash` clientseitig nachrechnen (Integritaet + Update-Erkennung).

### Phase 3 — Manifest-Sync (Mitglied-Seite) (3-5 Tage)

- Manifest-Link einmalig eingeben/speichern.
- "Aktualisieren": Manifest laden, gegen lokalen Stand diffen, Status neu berechnen.
- Liste mit Status-Symbolen (Wolke / Haken / Update / Ring / Warnung).
- Tap-Download mit Datei-Delta, atomar, Fortschritt; Evict + Offline-Groesse.

### Phase 4 — Manifest-Publisher (Chorleiter-Seite) (3-5 Tage)

- Aktion "Veroeffentlichen/Aktualisieren": `.song`-Verzeichnisse enumerieren, `content_hash` je Datei, Per-Datei-Shared-Links anlegen/wiederverwenden, `asset_hash` bilden, `manifest.json` schreiben.
- Stabile `asset_id` pro `.song` vergeben und persistieren.
- Setzt Chorleiter-OAuth voraus (PKCE).

### Phase 5 — Feinschliff & Test (laufend)

- Edge-Cases (verwaiste Songs, Umbenennung, Abbruch) testen.
- Range/CORS von Shared-Links empirisch absichern.
- iOS-Test im Simulator und auf einem echten Geraet (Apple-ID).

### Aufwandsschaetzung

Grob **2-4 Wochen Halbtagsarbeit**, abhaengig davon, wie sauber die Adapter-Trennung (Phase 1) gezogen wird und wie viel vom bestehenden Code wiederverwendbar ist.

## Offene Fragen

1. **Manifest-Verteilung:** ein stabiler Manifest-Datei-Link, der bei jeder Veroeffentlichung denselben Inhaltspfad behaelt — bestaetigen, dass ein Datei-Shared-Link nach Ueberschreiben weiterhin den neuen Inhalt liefert.
2. **Per-Datei-Shared-Links:** Anzahl-Limits pro Dropbox-Account bei grossen Bestaenden pruefen.
3. **content_hash clientseitig:** Bibliothek vs. Eigenimplementierung des Dropbox-Block-Hashes.
4. **Audio im Free-Tier:** ueberhaupt ueber diesen Sync, oder strikt "Free = lesen" und Audio nur ueber lokale Anhaenge/Premium? (Beeinflusst Bundle-Groesse und Traffic.)
5. **Android:** parallel mitziehen oder iOS zuerst?

## Verifikation: Shared-Link-Mechanik (Stand 2026-06-08)

Empirisch gegen die echte Chor-Dropbox geprueft (Skript `scripts/test_shared_link.py`).

**Voraussetzung Publisher-Seite:** Die Dropbox-App braucht die Scopes
**`sharing.read` + `sharing.write`** (Permissions-Tab in der App Console
anhaken **und „Submit"** — sonst wirkungslos), danach **neu autorisieren**
(Scopes werden beim Autorisieren in den Token gebacken; ein bestehender Token
bekommt sie nicht nachtraeglich). Der Authorize-Flow sendet keinen
`scope`-Parameter → Dropbox vergibt alle aktivierten Scopes.

**Token-loser Lesezugriff bestaetigt** — persistenter Shared-Link einer MP3
(6.522.043 Bytes), Abruf **ohne jeden Auth-Header**:

| Test | Ergebnis |
|---|---|
| Voll-Download | HTTP 200, exakte Groesse, vollstaendig |
| Range (Streaming/Seek) | HTTP 206, `accept-ranges: bytes`, `content-range: …/6522043` |
| CORS (`Origin` gesetzt) | `access-control-allow-origin: *` |

→ Mitglieder koennen token-los **lesen und streamen** (Range), sogar aus einer
Web-PWA (CORS offen). Die Kern-Annahme „Mitglieder halten keinen Token, lesen
ueber read-only Shared-Links" traegt. Content-Host: `dl.dropboxusercontent.com`
(gleiches Verhalten bei Temporary Links wie bei persistenten Shared-Links).

## Dropbox Traffic-Limits

Pro **Dropbox-Account und Tag** (Quelle: help.dropbox.com/share/banned-links,
Stand Jan 2026) — gilt beim **Chorleiter** (dessen Links geteilt werden):

| Account-Typ | Traffic/Tag | Downloads/Tag |
|---|---|---|
| Basic (kostenlos)/Trial | 20 GB | 100.000 |
| Plus, Family, Professional, Essentials, Standard, Business | 1 TB | unbegrenzt |
| Advanced, Business Plus, Enterprise | 4 TB | unbegrenzt |

Ueberschreitung → Sharing 24 h pausiert (Wiederholung laenger).

**Einordnung (40 Mitglieder):**
- **Text-only** (Bundle ~82 KB fuer 15 Songs): ~3 MB/Tag — selbst auf Basis-
  Account voellig unkritisch.
- **Audio auf Basic (20 GB):** volle Audio-Bibliothek (~1 GB) × 40 ≈ 40 GB →
  ueber dem Limit. Risikozone.
- **Audio auf Plus/Professional (1 TB):** dasselbe = ~4 % des Limits → komfortabel.
- **Download-to-own** (einmal pro Version statt pro Abspielen) senkt den
  Dauerbetrieb zusaetzlich. Der 100.000-Downloads-Zaehler (nur Basic) ist v. a.
  bei Range-Streaming relevant (jeder Seek = Request); bezahlte Plaene unbegrenzt.

→ Free-Tier text-lastig (jeder Dropbox-Plan reicht); Audio sinnvoll nur mit
bezahltem Chorleiter-Dropbox + Download-to-own.

## Zugriffsschutz & Mitglieder-Churn

Zwei harte Wahrheiten: ein Shared-Link ist ein **Bearer-Token in URL-Form**
(serverlos keine pro-Person-Sperre), und **bereits geladene Inhalte sind in
keinem serverlosen Modell zurueckholbar** (Offline-Kopie existiert). Kontrollierbar
ist nur der **zukuenftige** Zugriff. Optionen:

| Ansatz | Mechanik | Austritt | Bewertung |
|---|---|---|---|
| **Bundle-Uebergabe (kein Link)** | Export → AirDrop/Mail an aktuelle Mitglieder | nicht mehr in den Verteiler aufnehmen | sauberster Free-Tier-Weg; Zugriffskontrolle ist sozial |
| **Link-/Key-Rotation** | bei Austritt/saisonal neue Links + Manifest, nur an Verbleibende | alte Links widerrufen → tot; alle re-syncen | pragmatisch; nicht pro Austritt, eher saisonal |
| **Pro-User-Schluesseltresor (Envelope-Verschluesselung)** | Content verschluesselt (Key `K`); pro Mitglied eigene Tresor-Datei mit eigenem Link = `Enc_Km(K)` | neuer `K'` nur in Tresore der Verbleibenden; M's Link lebt, enthaelt altes `K` | bester serverloser Kompromiss; **Verschluesselung Pflicht** (Proxy-Datei ohne Krypto ist umgehbar, da Content-Links oeffentlich + gecacht); kuenftiger Content braucht Re-Encryption |
| **Dropbox Shared *Folders*** (statt Links) | pro-Mitglied-Einladung via Dropbox-ACL | echtes per-User-Revoke | aber: jedes Mitglied braucht **Dropbox-Account** |
| **Model A (Server)** | per-User-Token, serverseitige Pruefung | sofortiges granulares Revoke inkl. Altbestand | einzige echte Loesung — die Premium-Grenze |

**Wichtig zur „Proxy-Datei"-Idee:** Eine pro-User-Datei, die andere Links
„freischaltet", schuetzt **nur ohne Verschluesselung nicht** — sie gated nur das
*Auffinden*; wer einmal gesynct hat, haelt die echten (oeffentlichen) Content-Links
direkt. Erst als **verschluesselter Schluesseltresor** (Zeile oben) wird daraus
echter Schutz. Kollusion (Mitglied gibt Link/Key weiter) bleibt serverlos
ungeloest.

## Verwandte Dokumente

- `choirbox-freemium-diskussion.md` — Free-/Premium-Strategie, Bundle-Idee, Schicht-Trennung
- `capacitor-native-app.md` — Native-App-Grundlagen, Plugins, App-Store-Setup, Kosten
- `choirbox-saas-architektur.md` — Modell A (zentraler Server) als Premium-Gegenstueck
- `dropbox-pkce-migration.md` — PKCE-Flow fuer den Chorleiter-Connect
