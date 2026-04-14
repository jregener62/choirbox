# Setlist + Blättermodus im Doc-Player

## Kontext

Für Konzerte und Proben braucht der Chor eine **Setlist** mit fester Reihenfolge, die der
Chorleiter pflegt und alle Mitglieder lesend öffnen. Damit zwischen den Texten zügig
umgeblättert werden kann, bekommt der Doc-Player einen neuen **Blättermodus**, der alle
Seiten aller Dokumente in der Quellliste (Setlist / Suchergebnis / Favoriten) als
durchgehenden Seiten-Stream zugänglich macht — **nur im Texte-Modus**.

Beispiel: Setlist enthält Lied 1 (1 Seite) + Lied 2 (2 Seiten) + Lied 3 (4 Seiten) →
Blätter-Stream = 7 Seiten. Der User wischt/blättert linear durch alle 7.

## Mockups

Alle Varianten liegen unter `docs/mockups/` und sind lokal erreichbar unter
`http://localhost:8001/mockups/`.

### Setlist

- [setlist-overview.html](../mockups/setlist-overview.html) — Listen-Übersicht (Member vs. Chorleiter)
- [setlist-detail.html](../mockups/setlist-detail.html) — Detailansicht mit Reihenfolge + Blättern-CTA
- [setlist-editor.html](../mockups/setlist-editor.html) — Drag & Drop + Bottom-Sheet-Song-Picker

### Blättermodus

- [pageflip-nav-a-bottombar.html](../mockups/pageflip-nav-a-bottombar.html) — Variante A: persistente Bottom-Bar mit Progress
- [pageflip-nav-b-overlay.html](../mockups/pageflip-nav-b-overlay.html) — Variante B: Edge-Tap + Swipe (E-Reader-Stil)
- [pageflip-entry-points.html](../mockups/pageflip-entry-points.html) — Einstiege aus Setlist / Suche / Favoriten

## Kern-Konzept

### Setlist — Datenmodell (Vorschlag)

```
Setlist
  id
  title
  description (optional)
  date (optional, für Konzert/Probe)
  kind (concert | rehearsal | draft)
  created_by (User-ID)
  published (bool — Entwürfe sind nur für Ersteller sichtbar)
  created_at / updated_at

SetlistItem
  id
  setlist_id
  position (int, 0-basiert)
  document_id (Referenz auf das Text-Dokument, nicht den ganzen Song)
  note (optional — z.B. "A-cappella", "Solo T")
  divider_after (optional — "Pause", "Block 2")
```

**Wichtig:** `document_id` statt `song_id`, weil ein Song mehrere Dokumente haben kann
(PDF, CHO). Der Chorleiter wählt beim Hinzufügen gezielt das Text-Dokument aus.

### Blättermodus — Datenfluss

1. Start: Quellliste wird **eingefroren** → Array von `document_id`s in Reihenfolge.
2. Client holt `GET /api/documents/bulk-pages?ids=...` → Liste mit `{doc_id, page_count, title}`.
3. Blätter-Stream = flache Liste aller `(doc_id, page_number)`-Tupel.
4. Navigation: Index im Stream inkrementieren/dekrementieren, Seite wird geladen.
5. Beim Doc-Wechsel: kurzer Banner (800ms), neuer Header-Kontext.
6. Beenden: zurück zur Quelle (Setlist / Suche / Favoriten).

### Rollen & Sichtbarkeit

| Aktion | Guest | Member | Chorleiter | Admin |
|---|---|---|---|---|
| Setlist öffnen | — | ✓ | ✓ | ✓ |
| Setlist erstellen/editieren | — | — | ✓ | ✓ |
| Blättermodus nutzen | ✓¹ | ✓ | ✓ | ✓ |

¹ Für Gäste nur aus Suchergebnissen/Favoriten, wenn Gast-Link Texte-Modus erlaubt.

## Offene Fragen

1. **Neue Rolle „Chorleiter" oder Admin-Task?**
   Aktuell gibt es Admin + Member. Eine separate Rolle wäre sauber (mehrere Chorleiter
   pro Chor möglich), bedeutet aber Role-System-Erweiterung. Alternative: Admin-only
   — einfacher, aber Admin = einzige Person für alle Setlists.

2. **Bottom-Nav-Platzierung für „Setlists"**
   4 Slots sind belegt (Browser / Favs / (Slot) / Settings). Optionen:
   - Setlists ersetzt einen bestehenden Eintrag → welchen?
   - Setlists als Sub-Punkt unter „Mehr" → schlechter erreichbar.
   - 5. Slot einführen → eng auf kleinen Displays.

3. **Variante A (Bottom-Bar) vs. B (Edge-Tap/Swipe)**
   A: mehr Kontrolle & Übersicht, aber weniger Lesefläche.
   B: konzerttauglich, aber keine direkte Sprungmöglichkeit sichtbar.
   Vorschlag: **B** als Default, **A** als Setting für Proben/Orientierung. Oder:
   Beide Elemente kombinieren — Edge-Tap + schmale Mini-Progress-Bar unten (aus B),
   TOC-Overlay per Mitte-Tap (aus A).

4. **Tap-Verhalten in Setlist-Detail**
   - Tap auf Song = Song einzeln öffnen, Button „Blättern" = Modus ab Lied 1 **(aktuell im Mockup)**
   - ODER Tap = Blättern ab dieser Position, Long-Press = Einzel-Öffnen
   - Frage auch: Bei „Blättern"-Start aus Setlist-Detail immer bei Lied 1 starten, oder
     bei Liedposition, die der User zuletzt angesehen hat? (Resume-Funktion)

5. **PDF-Seitenanzahl ermitteln**
   Aktuell hat `Document` keine `page_count`-Spalte. Optionen:
   - Bei Upload/Import per `PyPDF2`/`pypdf` zählen und speichern.
   - Beim ersten Öffnen nachtragen (lazy).
   - Für CHO/TXT: immer 1 Seite.
   - Migration: beim Deploy einmalig alle bestehenden PDFs durchzählen.

6. **Blättermodus in der Suche — Nur-Texte-Pflicht**
   Button „Alle blättern" nur sichtbar, wenn View-Mode = „Nur Texte" aktiv ist.
   Im Songs+Audio-Modus haben Treffer auch Audio-Einträge ohne Seiten — unklar,
   was dort sinnvoll wäre. Vorschlag: Button im Audio-Modus einfach ausblenden.

7. **Paginierungs-Stream bei PDF-Rendering**
   PDF-Seiten werden aktuell wie gerendert? Wenn seitenweise per `pdf.js`, ist der
   Blätter-Modus quasi natürlich. Wenn als ganzes Bild/DOM, muss die Render-Strategie
   auf seitenweises Rendering umgebaut werden.

8. **Setlist-Zugehörigkeit beim Anzeigen von Songs**
   Wenn ein Song in mehreren Setlists verwendet wird, anzeigen wo? Sidebar im
   Doc-Viewer? Badge in Browser? Oder gar nicht (zu überladen)?

9. **Blättermodus + Annotations/Notizen**
   Wie verhalten sich User-Notizen zu einem Dokument im Blättermodus? Anzeigen wie
   im normalen Viewer, oder im Performance-Flow ausgeblendet?

10. **Setlist-Teilen**
    Share-Link einer Setlist an Gäste? Bestehender Guest-Link-Mechanismus
    wiederverwenden oder eigener Setlist-Share?

## Geplantes Vorgehen (Phasen)

**Phase 1 — Setlist-Grundgerüst (Lesen)**
- Datenmodell + Backend-CRUD (Admin-only)
- Setlist-Übersicht + Detailansicht (Member-Read)
- Noch kein Editor-UI, Daten per API-Tool/Seed anlegen

**Phase 2 — Setlist-Editor (Chorleiter)**
- Rollen-Entscheidung treffen (Frage 1)
- Editor mit Drag & Drop, Song-Picker
- Entwurfs-Status + Veröffentlichen

**Phase 3 — Blättermodus (MVP)**
- Variante-B-Navigation (Edge-Tap + Swipe)
- Kontextheader + Status-Pill + Mini-Progress
- Einstieg aus Setlist-Detail
- PDF-Seitenzählung + Endpoint

**Phase 4 — Blättermodus-Quellen ausweiten**
- Einstieg aus Suchergebnis (nur Texte-Modus)
- Einstieg aus Favoriten
- Freeze-Banner + Resume-Verhalten

**Phase 5 — Polish**
- Variante-A-Elemente optional zusätzlich
- Sprungleiste / TOC-Overlay
- Optionale Set-Trenner (Pause/Block)
- Progress-Segmente pro Song
