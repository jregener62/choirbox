# ChoirBox — Diskussion: Freemium-Strategie und Bundle-Export

Stand: April 2026
Status: **Exploration — bewusst noch kein Plan.** Wiederaufnahme offen.

## Zweck dieses Dokuments

Festhalten einer laengeren Diskussion ueber eine moegliche Freemium-Strategie fuer ChoirBox und die damit verbundene Bundle-Export-Idee. Das Dokument ist bewusst **kein** Implementierungsplan — die strategischen Kernfragen sind noch offen, aber die architektonischen Implikationen sind schon so weit durchdacht, dass sie nicht verloren gehen sollten. Wer spaeter an diesem Thema weiterarbeitet (Joerg selbst oder eine Claude-Session mit frischem Kontext), soll hier den Stand ohne Verlust wieder aufnehmen koennen.

## Ausgangspunkt

Die urspruengliche Ueberlegung kombinierte zwei Motive:

1. Vorbereitung auf die Migration zu Model A (zentraler Auth-Proxy, siehe `docs/plans/choirbox-saas-architektur.md`).
2. Alternative Distributionsmoeglichkeit fuer eine Single-Native-App ohne Server.

**Idee (Joerg):** Der Chorleiter kann mit der OS-Teilen-Funktion die Chor-DB-Daten (ausser User-Daten) plus alle Medien aus dem Chor als Bundle/ZIP exportieren. Ein anderer User der App kann dieses Bundle laden und hat alle Daten als Snapshot des Chores. User tauschen die Daten untereinander aus — egal ueber welchen Weg: AirDrop, WhatsApp, iCloud, USB.

## Erste Einwaende (Claude) und Gegenargumente (Joerg)

Die erste Einschaetzung nannte mehrere Probleme: Bundle-Groessen, fehlende Delta-Sync, Merge-Konflikte mit User-Daten, Authentizitaet, Urheberrecht, Speicherbedarf, Feature-Kosten.

Joergs Gegenargumente haben die meisten Punkte entkraeftet:

- **User-Daten sind nicht betroffen.** Favoriten, Notizen, Aufnahmen bleiben in einer lokalen User-DB auf dem Geraet. Das Bundle ersetzt nur den Chor-Content-Layer. → Merge-Problem verschwindet.
- **Delta-Updates ueber UUIDs machbar.** Mit stabilen Asset-UUIDs und Content-Hashes kann der Import diffen und nur geaenderte Dateien extrahieren.
- **Urheberrecht.** Dasselbe Problem wie bei AirDrop/WhatsApp/USB. Klarer Haftungsausschluss, die App ist Player und Archiv, kein Distributionsdienst.
- **Speicherbedarf.** Nur ein Chor pro Device, daher unkritisch.
- **Authentizitaet.** Soziales Vertrauensproblem, kein technisches. Signaturen spaeter nachruestbar, fuer MVP reicht "Absender-Name anzeigen".

Fazit nach diesem Austausch: Das Bundle-Feature ist deutlich tragfaehiger als zunaechst angenommen — vorausgesetzt, User-DB und Chor-Content-DB sind sauber getrennt.

## Verfeinerung 1: Freemium-Modell

Joergs Framing: Das Bundle-Feature lohnt sich nur, wenn man die Single-App als ersten Schritt zu einer Monetarisierung versteht.

**Modell:**

- **Tier 1 (Free):** Single-Chor-Native-App, kostenlos. Nuetzlich fuer kleine Singkreise, Jam-Sessions, Kammerensembles. Bundle-Distribution per AirDrop/WhatsApp/etc. Keine Server-Infrastruktur noetig.
- **Tier 2 (Premium):** Die volle Server-Loesung mit Dropbox, Sync, allen Features. Abo oder Einmalkauf. Im Idealfall dieselbe App, in der Features freigeschaltet werden und der User sich bei Cantabox anmelden kann.

**Warum das ueberzeugt:**

- Free-Tier braucht **keinen** Server → keine Ops-Kosten pro Nutzer → skalierbar ohne Infrastruktur-Risiko.
- Free-Tier ist kein verkrueppeltes Demo, sondern ein ehrliches Werkzeug fuer eine echte Zielgruppe.
- Upgrade-Trigger ist natuerlich: der Schmerz skaliert mit der Chorgroesse. Bundle-Shipping fuer sechs Leute ist einfach, fuer dreissig wird es Chaos.
- Bundle funktioniert auch im Premium-Kontext (Chorleiter mit Premium verteilt an Free-User in seinem Chor → Premium wird zur "Power-User-Position").
- Die UUID-Arbeit, die wir ohnehin fuer Model A brauchen, ist gleichzeitig die Grundlage des Free-Tiers. Keine verworfene Arbeit.

## Verfeinerung 2: Free-Tier ohne Audio-Bundle

Joergs naechster Schnitt: Die MP3s muss das Free-Tier-Bundle nicht transportieren. Das Bundle enthaelt nur Texte, Akkorde, PDFs, Metadaten.

**Effekt:**

- Bundle-Groesse faellt auf wenige MB → alle Distributionskanaele einsetzbar, auch E-Mail und Messenger mit kleinen Limits.
- Urheberrecht deutlich weniger brisant (Texte/Akkorde/PDFs statt MP3s, Kontext naeher an "geteiltem Arbeitsdokument").
- Premium-Abgrenzung wird glasklar: **Free = "alles, was du lesen kannst", Premium = "alles, was du hoeren kannst"**. Ein mentales Modell, das in einem Satz erklaerbar ist.

**Wichtige Korrektur:** Zunaechst als "Produkt-Pivot" eingeschaetzt, weil der urspruengliche ChoirBox-Schwerpunkt auf Audio liegt und Text-Rendering fehlen wuerde. Joerg hat korrigiert:

> **ChordPro-Rendering mit Mobile-Reflow/Transposition/Dark-Mode und PDF-Viewer mit Pinch-Zoom sind schon gebaut.**

Damit wird aus dem vermeintlichen Produkt-Pivot "bestehendes Produkt mit ausgeblendetem Audio plus Bundle-Import" — geschaetzter Aufwand: Wochen, nicht Monate.

## Verfeinerung 3: Lokale Audio-Anhaenge im Free-Tier

Joerg: Chormitglieder koennen auch im Free-Tier MP3s importieren — sie muessen es halt "zu Fuss" machen, also manuell eigene Dateien an ein Stueck haengen.

**Architektonische Einordnung:**

- Lokale Audio-Anhaenge leben in der **User-DB**, nicht im Chor-Content-Layer.
- Tabelle `user_audio_attachment (user_id, asset_id, local_file_path, added_at)`.
- Audio-Dateien liegen im App-Storage-Bereich (iOS Application Support, Android Internal Storage).
- Andere User sehen dasselbe Asset, haben aber ihre eigenen (oder keine) Audio-Anhaenge.

**Player-Logik wird einfach — eine Komponente, drei Quellen:**

1. Gibt es einen lokalen User-Anhang fuer dieses Asset? → abspielen.
2. Nein, aber Premium aktiv? → Dropbox-URL ziehen.
3. Nein, Free? → "Keine Audio-Datei hinterlegt — hinzufuegen?"

**Upgrade-Weg bleibt sanft:** Beim Wechsel auf Premium fliegen die lokalen Anhaenge nicht weg. Die App kann automatisch auf die Premium-Quelle umschalten oder eine Wahl anbieten ("ich habe meine eigene Aufnahme, die will ich weiter nutzen").

**Technische Voraussetzung:** File-Picker auf Native-Seite. Capacitor bietet `@capacitor/filesystem` plus Community-Plugins. Unkritisch.

## Verfeinerung 4: `.song`-Verzeichnisse als Asset-Einheit

Joerg: ChoirBox verwendet bereits `.song`-Verzeichnisse in Dropbox als logische Einheit. Ressourcen werden ueber Pfade wie `.song/Texte/` und `.song/Audio/` zugeordnet.

**Effekt auf das Daten-Modell:**

- Asset = `.song`-Verzeichnis, nicht einzelne Datei.
- **Keine** separate `asset_resource`-Tabelle noetig. Ressourcen sind implizit die Dateien im Verzeichnis, von der Browse-Logik nach Unterordner/Endung kategorisiert.
- Favoriten und Labels haengen am `.song`-Verzeichnis als Ganzes.
- Bundle-Export serialisiert `.song`-Verzeichnisse komplett, mit Unterordnern.

**Vereinfachtes Schema:**

```
asset
  id              UUID PRIMARY KEY
  dropbox_path    TEXT       (Pfad zum .song-Verzeichnis, veraenderlich)
  name            TEXT       (abgeleitet vom Verzeichnisnamen)
  content_hash    TEXT       (Hash ueber Dateiliste + mtimes, fuer Delta)
  created_at      TIMESTAMP
  updated_at      TIMESTAMP

favorite
  id              UUID PRIMARY KEY
  user_id         INT
  asset_id        UUID FK -> asset.id
  created_at      TIMESTAMP

user_audio_attachment
  id              UUID PRIMARY KEY
  user_id         INT
  asset_id        UUID FK -> asset.id
  local_file_path TEXT
  added_at        TIMESTAMP
```

## Architektur-Entscheidungen (schon klar)

1. **Schicht-Trennung:** Chor-Content-DB und User-DB sind logisch und physikalisch getrennt. Chor-Content wird durch Bundle-Import ersetzt oder per Delta aktualisiert. User-DB bleibt dabei unberuehrt.
2. **Stabile Asset-UUIDs** auf `.song`-Verzeichnis-Ebene. Referenzen aus User-Daten laufen ausschliesslich ueber `asset_id`, nie ueber Pfad.
3. **Orphaned References** (Asset im neuen Bundle nicht mehr vorhanden): ausgrauen, nicht loeschen. Kommt das Asset spaeter zurueck, ist die Verknuepfung automatisch wieder live.
4. **Content-Layer hat keine `asset_resource`-Tabelle.** Ressourcen sind implizit im `.song`-Verzeichnis.
5. **User-Audio als eigene User-DB-Tabelle** `user_audio_attachment`. Orthogonal zu Premium-Audio aus Dropbox.
6. **Player mit dreistufiger Quellen-Hierarchie:** lokal → Dropbox → "keine Datei, hinzufuegen?".
7. **Feature-Gating im Client** nicht verteilt — eine zentrale Stelle (Hook oder Store), die Entitlements verwaltet. Mehrere Flags statt nur `is_premium`, damit spaetere differenzierte Tiers moeglich sind.

## Offene strategische Fragen

Diese muessen beantwortet werden, **bevor** konkret implementiert wird:

1. **Side-Projekt oder Business?**
   - *Side-Projekt, das seine Infrastrukturkosten deckt:* Free-Tier gratis, Premium ~3-5 EUR/Monat, 50-100 zahlende Nutzer decken Hetzner + Dropbox + Domain. Machbar ohne Marketing.
   - *Nebenjob mit Revenue-Ziel:* Mehrere hundert zahlende User, aktives Marketing, Support-Inbox, Feature-Priorisierung nach Revenue. Deutlich mehr Aufwand.

2. **Ein Chor pro Device** oder Multi-Chor-Support? Mit Bundle-Modell ist "ein Chor" der Default. Multi-Chor waere spaeter nachruestbar, muss aber aktiv im Schema nicht vorbereitet werden, wenn nicht bewusst gewuenscht.

3. **Privatperson oder Kleinunternehmer/Unternehmen?** Kleinunternehmer-Regelung gilt (Stand 2024) bis 22.000 EUR Jahresumsatz — in 2026 ggf. angehoben, muss nochmal geprueft werden. Ab kommerzieller Taetigkeit: AGB, Widerrufsrecht, ggf. Umsatzsteuer. Bei ersten Umsaetzen mit Steuerberater klaeren.

4. **Payment-Strategie:**
   - In-App-Purchase via Apple/Google (hohe Konversion, 15-30% Abgabe).
   - Web-Subscription via Stripe (Spotify-Modell, in-App nicht anpreisbar).
   - Einfacher Startpunkt: Stripe auf Webseite, App prueft Status per API.

5. **Pricing:** Fuer kleine Chorgruppen fuehlt sich 3-5 EUR/Monat machbar an. Chor-Plan (einer zahlt, alle bekommen Premium) ist natuerlicher als individuelle Abos.

## Offene technische Fragen

1. **Wie funktionieren Favoriten heute?** Auf `.song`-Ebene oder auf Datei-Ebene? Muss vor dem Migrations-Sweep geklaert werden. Bei Datei-Ebene: Favoriten werden im Sweep auf den umschliessenden `.song`-Ordner hochgezogen, mit Verlust der Datei-Granularitaet falls vorhanden.

2. **Content-Hash-Strategie:** Hash ueber Dateiliste + mtimes (billig, grob), oder ueber Dateiinhalte (genau, teuer)?

3. **Bundle-Format:** ZIP mit SQLite-Dump + `.song`-Verzeichnissen, oder ZIP mit JSON-Manifest + `.song`-Verzeichnissen? JSON ist simpler, SQLite maechtiger.

4. **Versionierung des Bundle-Formats:** Schon bei v1 eine Schema-Version-Nummer einfuehren, damit spaetere Format-Aenderungen abwaertskompatibel bleiben.

5. **Entitlement-System im Client:** zentraler Hook oder Store. Noch nicht implementiert, Design offen.

## Naechste Schritte (wenn wieder aufgenommen)

Drei Deliverables, die nach einem Go-Signal zu schreiben waeren — in dieser Reihenfolge:

1. **`docs/plans/choirbox-freemium-strategie.md`** — formales Strategiedokument, das die Entscheidungen festhaelt (Tier-Definition, Upgrade-Weg, Pricing-Skizze, App-Store-Strategie, offene Fragen).

2. **Update des UUID-Issues** — der Befehl ist schon entworfen, muss aber vor dem Absenden angepasst werden: `.song` als Asset-Einheit (keine `asset_resource`-Tabelle), `user_audio_attachment` mit rein, Free-Tier als Hauptmotivation statt nur Model-A-Migration. Schema aus Abschnitt "Verfeinerung 4" uebernehmen.

3. **Neues Issue "Bundle-Export/-Import"** als separates, niedriger priorisiertes Follow-up, das auf (1) und (2) verweist.

## Verwandte Dokumente

- `docs/plans/choirbox-saas-architektur.md` — Model A (zentraler Auth-Proxy), urspruengliche Migration
- `docs/plans/capacitor-native-app.md` — Native-App-Strategie via Capacitor
- `docs/plans/security-fixes-plan.md` — Security-Fixes fuer den aktuellen Field-Test unter cantabox.de
