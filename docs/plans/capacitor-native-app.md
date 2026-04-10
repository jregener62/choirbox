# ChoirBox — Native App mit Capacitor

**Status:** Entwurf / Entscheidungsgrundlage
**Datum:** 2026-04-10
**Verwandt:** `choirbox-saas-architektur.md`, `dropbox-pkce-migration.md`

## Scope & Motivation

Dieses Dokument fasst die Ueberlegungen zur Bereitstellung von ChoirBox als native iOS- und Android-App zusammen. Es dokumentiert, warum **Capacitor** der empfohlene Weg ist, welche Vorteile eine native App gegenueber der bestehenden PWA bietet, und welche Probleme sie **nicht** loest.

### Ziele

- ChoirBox als installierbare App im Apple App Store und Google Play Store anbieten
- Bestehenden React/TypeScript-Code weitgehend unveraendert weiterverwenden
- Zugriff auf native APIs (Keychain, Push Notifications, Background Sync)
- Professionelleres Erscheinungsbild fuer nicht-technische Chorleiter
- Parallelbetrieb: PWA bleibt verfuegbar, native App als Alternative

### Nicht-Ziele

- Komplette Neuentwicklung in Swift/Kotlin
- Abschaffung der PWA-Variante
- Native-only Features, die in der PWA nicht funktionieren (Feature-Paritaet anstreben)

## Begriffsklaerung: PWA vs. Native

### PWA (Progressive Web App) — aktueller Stand

Eine Web-App, die im Browser-Sandbox laeuft, sich aber wie eine native App anfuehlt (installierbar, Fullscreen, Offline-faehig via Service Worker). Runtime ist WebKit (iOS) bzw. Chromium (Android).

Einschraenkungen auf iOS:
- Storage wird nach 7 Tagen Inaktivitaet geloescht (ITP/Intelligent Tracking Prevention)
- Kein Background Sync
- Push Notifications erst seit iOS 16.4, mit Einschraenkungen
- Kein Zugriff auf Keychain/Keystore
- Installation nur ueber "Zum Home-Bildschirm hinzufuegen" (nicht ueber App Store)

### Native App

Laeuft in einer nativen Shell mit Zugriff auf alle Plattform-APIs. Entweder komplett nativ (Swift/Kotlin) oder als Web-App in einem nativen Container (Capacitor, Cordova, React Native WebView).

### Capacitor — der empfohlene Mittelweg

Capacitor (von Ionic) ist das **Mobile-Aequivalent zu Electron**: eine native Shell (Swift auf iOS, Kotlin auf Android) die eine WKWebView (iOS) bzw. WebView (Android) einbettet, in der die bestehende React-App laeuft. Zusaetzlich gibt es JavaScript-Bridges zu nativen APIs.

Vergleichbare Produkte, die diesen Ansatz nutzen: Spotify (CEF/Electron fuer Desktop), diverse Ionic-basierte Apps im App Store.

## Warum Capacitor und nicht Alternativen

### Capacitor vs. React Native

| Aspekt | Capacitor | React Native |
|--------|-----------|-------------|
| Code-Wiederverwendung | ~95% (bestehender React+TS-Code laeuft direkt) | ~60-70% (UI-Komponenten muessen auf RN-Primitives portiert werden) |
| Migrationsaufwand | 1-2 Wochen | 4-8 Wochen |
| CSS/Styling | Bestehende CSS-Dateien funktionieren | Stylesheet-API statt CSS, kompletter Rewrite |
| Native Performance | Web-Performance (fuer ChoirBox ausreichend) | Naeher an nativ, aber fuer Audio-Streaming irrelevant |
| Plugin-Oekosystem | Gut (Capacitor Plugins + Cordova-kompatibel) | Sehr gut |
| Parallele PWA | Trivial (gleicher Code) | Separater Build noetig |

**Fazit:** Fuer ChoirBox ist Capacitor klar ueberlegen, weil der bestehende React-Code fast unveraendert weiterverwendet werden kann. React Native waere nur sinnvoll, wenn die Web-Performance nicht ausreicht — was fuer eine Audio-Streaming-App mit Listen-UI nicht der Fall ist.

### Capacitor vs. Flutter

Flutter wuerde eine komplette Neuentwicklung in Dart bedeuten. Kein Code-Sharing mit der bestehenden React-App. Fuer ChoirBox nicht sinnvoll.

### Capacitor vs. reines Swift + Kotlin

Zwei komplett separate Codebases in zwei verschiedenen Sprachen. Doppelter Entwicklungs- und Wartungsaufwand. Nur gerechtfertigt, wenn die App hochperformante native UI braucht (Spiele, AR, komplexe Animationen). Fuer ChoirBox massiv Over-Engineering.

## Was eine native App (via Capacitor) gegenueber der PWA loest

### 1. Persistenter lokaler Storage

iOS loescht IndexedDB und localStorage nach 7 Tagen Inaktivitaet (ITP). Capacitor-Apps haben dauerhaften App-Storage ueber die Capacitor Preferences API oder direkten SQLite-Zugriff. User-Daten (Favoriten, Transpose-Werte, Cache) ueberleben beliebig lange Pausen.

### 2. Sichere Token-Ablage

Capacitor bietet Plugins fuer iOS Keychain und Android Keystore — hardware-gestuetzte, verschluesselte Storage-Bereiche. Session-Tokens und ggf. Refresh-Tokens liegen dort sicherer als in localStorage einer PWA.

Empfohlenes Plugin: `@capacitor/secure-storage` oder `capacitor-secure-storage-plugin`.

### 3. Background Sync

Capacitor bietet Zugriff auf iOS Background Tasks und Android WorkManager. Die App kann im Hintergrund synchronisieren, z.B. Favoriten-Aenderungen hochladen oder neue Medien-Listen vorladen, auch wenn der User die App nicht aktiv nutzt.

Empfohlenes Plugin: `@capacitor/background-runner` oder `capacitor-background-fetch`.

### 4. Push Notifications

Native Push Notifications ueber APNs (iOS) und FCM (Android), zuverlaessiger als Web Push. Der Server kann den User benachrichtigen, wenn der Chorleiter neue Stuecke hochlaedt.

Empfohlenes Plugin: `@capacitor/push-notifications`.

### 5. Audio-Session-Management

Bessere Kontrolle ueber Audio-Sessions: Lock-Screen-Kontrollen (Play/Pause/Skip), Now-Playing-Info, Unterbrechungshandling (Anruf kommt rein). Die HTML5 Audio API bietet das teilweise ueber die MediaSession API, aber Capacitor gibt feinere Kontrolle.

### 6. App-Store-Distribution

Installation ueber App Store / Play Store ist fuer nicht-technische User vertrauter als "URL oeffnen → Teilen → Zum Home-Bildschirm". Suchbarkeit im Store erleichtert die Verbreitung.

### 7. Deep Links

`choirbox://choir/abc123` oeffnet direkt die App und navigiert zum richtigen Chor. Nuetzlich fuer Magic-Link-Auth: die Mail enthaelt einen Deep Link, der die App oeffnet und den Login abschliesst, ohne den Browser-Umweg.

## Was eine native App NICHT loest

Die folgenden Probleme sind **architektonisch bedingt** und unabhaengig davon, ob der Client eine PWA oder eine native App ist. Sie werden durch Modell A (zentraler Auth-Proxy) geloest, nicht durch den Client-Typ.

### Nicht geloest: Rollenprüfung bei Shared Dropbox Token

Wenn alle User denselben Dropbox Refresh Token teilen, ist Rollen-Enforcement clientseitig — egal ob der Client eine PWA oder eine Swift-App ist. Reverse Engineering einer nativen App ist schwieriger als bei einer PWA, aber nicht unmoeglich. Keychain macht Token-Extraktion schwieriger, schuetzt aber nicht gegen einen motivierten Angreifer.

**Loesung:** Modell A — Server haelt den Token, Client hat keinen direkten Dropbox-Zugriff.

### Nicht geloest: Auth-Modell

Wo leben die Passwörter/Credentials? Das ist ein Server-Problem, kein Client-Problem. Ob Magic Links, Passwort-Login oder OAuth — die Auth-Logik liegt auf dem Server.

### Nicht geloest: Concurrency bei Dropbox-Writes

Gleichzeitige Writes auf dieselbe JSON-Datei fuehren zu Datenverlust, unabhaengig vom Client-Typ. Rev-basierte Conditional Writes muessen serverseitig implementiert werden.

### Nicht geloest: Multi-Tenant-Isolation

Ohne serverseitige Isolation kann Chor A die Daten von Chor B lesen. Der Client-Typ aendert daran nichts.

### Nicht geloest: Onboarding-Flow

Wie bekommt ein neues Chormitglied Zugang? Das ist ein Auth-/Server-Problem (Magic Link, Invite-Code), nicht ein Client-Problem.

## Empfohlene Reihenfolge

Die Achsen "PWA vs. native" und "Single-Tenant vs. Multi-Tenant (Modell A)" sind **orthogonal**. Sie koennen in beliebiger Reihenfolge angegangen werden, aber die empfohlene Reihenfolge ist:

1. **Zuerst Modell A implementieren** (zentraler Server, Magic Link Auth, Postgres). Damit ist die Architektur sauber, unabhaengig vom Client-Typ.
2. **Dann Capacitor-Wrapper hinzufuegen.** Weil der ChoirBox-Client nach Modell A ein reiner API-Client ist (kein direkter Dropbox-Zugriff), ist der Capacitor-Wrapper trivial — er wrappt die gleiche React-App, die auch als PWA laeuft.

Umgekehrt (erst Capacitor, dann Modell A) funktioniert auch, bringt aber weniger Nutzen, weil die meisten Capacitor-Vorteile (Keychain, Background Sync, Push) erst mit einem zentralen Server richtig zur Geltung kommen.

## Technischer Migrationsplan: PWA → Capacitor

### Phase 1 — Capacitor initialisieren (1-2 Tage)

```bash
cd frontend
npm install @capacitor/core @capacitor/cli
npx cap init "ChoirBox" "com.choirbox.app" --web-dir ../static/react
npx cap add ios
npx cap add android
```

Das erzeugt `ios/` und `android/` Ordner im Projekt mit den nativen Shell-Projekten. Die React-App wird bei jedem Build in die native Shell kopiert.

### Phase 2 — Native Plugins integrieren (3-5 Tage)

**Secure Storage (Keychain/Keystore):**
```bash
npm install @capacitor/secure-storage
```
Anpassung in `authStore.ts`: Token-Storage abstrahieren — `localStorage` fuer PWA, Capacitor Secure Storage fuer native. Feature-Detection ueber `Capacitor.isNativePlatform()`.

**Push Notifications:**
```bash
npm install @capacitor/push-notifications
```
Server-seitig: FCM/APNs-Integration in den ChoirBox-Server. Push-Token pro Device in der `sessions`-Tabelle speichern.

**Background Sync (optional, spaeter):**
```bash
npm install @capacitor/background-runner
```
Periodische Synchronisation von Favoriten und Medien-Listen.

**Deep Links:**
```bash
npm install @capacitor/app
```
Konfiguration in `ios/App/App/Info.plist` und `android/app/src/main/AndroidManifest.xml` fuer `choirbox://`-Schema. Nuetzlich fuer Magic-Link-Auth.

### Phase 3 — Platform-Abstraktion im Code (2-3 Tage)

Einen Utility-Layer einfuehren, der plattformspezifische Unterschiede abstrahiert:

```typescript
// frontend/src/utils/platform.ts
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'web' | 'ios' | 'android'
```

Stellen, die sich unterscheiden:
- Token-Storage: `localStorage` vs. Secure Storage
- Push Notifications: Web Push vs. Native Push
- Deep Links: URL-Parameter vs. App URL Events
- Audio-Session: MediaSession API vs. Native Audio Plugin (falls noetig)

### Phase 4 — App Store Setup (1-2 Tage pro Plattform)

**iOS (Apple Developer Program, 99 USD/Jahr):**
- Apple Developer Account anlegen
- Provisioning Profile und Signing Certificate erstellen
- App Store Connect: App anlegen, Screenshots, Beschreibung, Datenschutzangaben
- TestFlight fuer Beta-Tester

**Android (Google Play Developer, 25 USD einmalig):**
- Google Play Console Account anlegen
- Signing Key erstellen
- Play Store Listing: Screenshots, Beschreibung, Datenschutzerklaerung
- Internal Testing Track fuer Beta

### Phase 5 — CI/CD fuer native Builds (optional, 1-2 Tage)

Automatisierte Builds mit GitHub Actions oder Fastlane:

```bash
# iOS Build
npx cap sync ios
cd ios && xcodebuild -workspace App.xcworkspace -scheme App -sdk iphoneos

# Android Build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Fuer Anfang: manuelle Builds genuegen. Automatisierung lohnt sich ab regelmaessigen Releases.

## Kosten

| Posten | Kosten | Haeufigkeit |
|--------|--------|-------------|
| Apple Developer Program | 99 USD | jaehrlich |
| Google Play Developer | 25 USD | einmalig |
| Capacitor + Plugins | 0 USD | Open Source |
| TestFlight (iOS Beta) | 0 USD | inklusive |
| Entwicklungsaufwand | ~2 Wochen Halbtag | einmalig + laufend |

Laufende Kosten: nur die Apple-Gebuehr (99 USD/Jahr). Alles andere ist einmalig oder kostenlos.

## Risiken

**"WebView-Performance reicht nicht."**
Fuer ChoirBox unwahrscheinlich. Die App zeigt Listen, spielt Audio und hat einfache Formulare. Keine 3D-Grafik, keine komplexen Animationen, keine rechenintensiven Operationen. WKWebView auf iOS und WebView auf Android sind fuer diesen Use Case mehr als schnell genug.

**"Apple lehnt die App ab weil sie nur eine WebView ist."**
Apple lehnt gelegentlich Apps ab, die "lediglich eine Website in einer WebView sind" (Guideline 4.2). Gegenmassnahme: native Plugins aktiv nutzen (Push Notifications, Keychain, Deep Links, Audio Session). Das differenziert die App von einer reinen Website und erfuellt Apple's Anforderung an "native Funktionalitaet". Viele erfolgreiche Ionic/Capacitor-Apps sind im App Store.

**"Zwei Build-Pipelines pflegen ist aufwaendig."**
Stimmt, aber der Aufwand ist gering: `npx cap sync` vor jedem nativen Build kopiert den React-Build in die native Shell. Xcode und Android Studio werden nur fuer native Konfiguration und Signing benoetigt, nicht fuer die eigentliche Entwicklung.

**"Capacitor-Plugins werden deprecated oder unmaintained."**
Capacitor wird aktiv von Ionic (mit VC-Funding und Enterprise-Kunden) entwickelt. Die Core-Plugins (`@capacitor/core`, `@capacitor/push-notifications`, etc.) sind stabil. Fuer Community-Plugins: vor Einsatz Aktivitaet auf GitHub pruefen.

## Projektstruktur nach Capacitor-Integration

```
choirbox/
├── frontend/                    # React SPA (unveraendert)
│   ├── src/
│   │   ├── utils/platform.ts    # NEU: Plattform-Abstraktion
│   │   └── ...
│   ├── capacitor.config.ts      # NEU: Capacitor-Konfiguration
│   └── package.json             # + Capacitor-Dependencies
├── ios/                         # NEU: Xcode-Projekt (generiert)
│   └── App/
├── android/                     # NEU: Android-Projekt (generiert)
│   └── app/
├── backend/                     # Unveraendert
├── static/react/                # Build-Output (wird in native Shell kopiert)
└── ...
```

## Verwandte Dokumente

- `choirbox-saas-architektur.md` — Modell A (zentraler Auth-Proxy), Voraussetzung fuer vollen Nutzen der nativen App
- `dropbox-pkce-migration.md` — PKCE-Refactor, Voraussetzung fuer Modell A
