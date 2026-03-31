# Handschriftliche Annotationen auf PDF-Seiten

## Kontext

Chormitglieder sollen auf den angezeigten Notenblatt-Seiten (gerendert als JPEG aus PDFs) handschriftliche Markierungen machen koennen — z.B. Atemzeichen, Dynamik, Einsaetze. Jeder User sieht nur seine eigenen Annotationen. Die Zeichnungen werden als Koordinaten-JSON gespeichert (winzig, skaliert bei jedem Zoom).

## Ansatz

**SVG-Overlay** auf jeder `<img>` Seite + **`perfect-freehand`** (109 KB, 0 Deps) fuer schoene druckempfindliche Striche. Koordinaten normalisiert in ViewBox-Space (0-1000), damit sie bei jedem Zoom korrekt skalieren.

**Zeichenmodus-Toggle**: Button in der Toolbar schaltet zwischen Scroll/Zoom und Zeichnen um. Im Zeichenmodus: SVG faengt Pointer Events, Scroll ist deaktiviert. Ausserhalb: SVG hat `pointer-events: none`, alles funktioniert wie bisher.

---

## Neue Dateien

| # | Datei | Beschreibung |
|---|-------|-------------|
| 1 | `backend/models/annotation.py` | SQLModel: user_id, dropbox_path, page_number, strokes_json, unique constraint |
| 2 | `backend/services/annotation_service.py` | CRUD: get, upsert, delete (page), delete_all (pdf) |
| 3 | `backend/api/annotations.py` | Router: GET, PUT, DELETE /annotations |
| 4 | `frontend/src/utils/strokeUtils.ts` | Koordinaten-Normalisierung, SVG-Path-Generierung via perfect-freehand |
| 5 | `frontend/src/hooks/useAnnotations.ts` | Zustand Store: drawingMode, tool, color, width, strokes, undo, API-Calls |
| 6 | `frontend/src/components/ui/AnnotatedPage.tsx` | `<img>` + SVG-Overlay pro Seite, Pointer-Event-Handling |
| 7 | `frontend/src/components/ui/AnnotationToolbar.tsx` | Floating Toolbar: Stift, Radierer, Farben, Breite, Undo, Loeschen |

## Zu aendernde Dateien

| Datei | Aenderung |
|-------|-----------|
| `backend/models/__init__.py` | Import Annotation |
| `backend/app.py` | Router registrieren |
| `frontend/package.json` | `perfect-freehand` hinzufuegen |
| `frontend/src/types/index.ts` | Stroke + AnnotationData Types |
| `frontend/src/components/ui/PdfViewer.tsx` | `<img>` → `<AnnotatedPage>`, Toggle-Button, Toolbar, Zoom-Sperre im Zeichenmodus |
| `frontend/src/styles/index.css` | Annotation-Styles |

---

## Backend-Design

### Model: `annotations` Tabelle

```
id          INT PK AUTO
user_id     STR FK→users.id (indexed)
dropbox_path STR (indexed)
page_number INT
strokes_json TEXT (JSON-Blob)
created_at  DATETIME
updated_at  DATETIME
UNIQUE(user_id, dropbox_path, page_number)
```

### strokes_json Format

```json
[
  {
    "id": "uuid",
    "points": [[x, y, pressure], ...],
    "color": "#ef4444",
    "width": 4,
    "tool": "pen"
  }
]
```

Koordinaten x: 0-1000, y: dynamisch nach Seitenverhaeltnis. Pressure: 0-1.

### API Endpoints (Prefix `/api/annotations`)

| Method | Endpoint | Auth | Beschreibung |
|--------|----------|------|-------------|
| GET | `?path=...&page=1` | require_user | Strokes fuer User+Seite laden |
| PUT | `/` | require_role("member") | Upsert: alle Strokes einer Seite speichern |
| DELETE | `?path=...&page=1` | require_role("member") | Seite loeschen |
| DELETE | `/all?path=...` | require_role("member") | Alle Seiten fuer dieses PDF loeschen |

---

## Frontend-Design

### Komponenten-Hierarchie

```
PdfViewer (bestehend, modifiziert)
├── pdf-toolbar
│   └── [NEU] Stift-Toggle-Button (Pencil Icon)
├── pdf-pages
│   └── AnnotatedPage (NEU, ersetzt bare <img>)
│       ├── <img> (Seiten-Bild)
│       └── <svg viewBox="0 0 1000 {h}"> (Overlay)
│           ├── <path> pro gespeichertem Stroke
│           └── <path> fuer aktiven Stroke (live)
└── AnnotationToolbar (NEU, floating, nur im Zeichenmodus)
    ├── Stift | Textmarker | Radierer
    ├── 6 Farben (rot, blau, gruen, gelb, lila, schwarz)
    ├── 3 Breiten (fein, mittel, dick)
    └── Undo | Seite loeschen
```

### Touch-Konflikt Loesung

- **Zeichenmodus AUS**: SVG hat `pointer-events: none` → Touch geht an Scroll-Container
- **Zeichenmodus AN**: SVG hat `pointer-events: auto` + `touch-action: none` → Touch zeichnet, `.pdf-pages` bekommt `overflow: hidden`
- Pinch-to-zoom und Double-tap werden im Zeichenmodus deaktiviert (early return im bestehenden useEffect)

### Auto-Save

- 500ms Debounce nach jedem Stroke-Ende → PUT /annotations
- Sofortiges Flush bei Component-Unmount und beforeunload
- Leere Strokes-Arrays loeschen den DB-Eintrag (kein Muell)

### SVG ViewBox und Skalierung

- ViewBox dynamisch: `0 0 1000 {1000 * img.naturalHeight / img.naturalWidth}`
- `preserveAspectRatio="none"` damit SVG exakt ueber dem Bild liegt
- Gleiche CSS `width` wie das `<img>` → skaliert identisch beim Zoom

---

## Implementierungs-Reihenfolge

### Phase 1: Backend (Steps 1-5)

1. Annotation Model erstellen
2. Model in __init__.py registrieren
3. annotation_service.py erstellen (get, upsert, delete, delete_all)
4. API Router erstellen (4 Endpoints)
5. Router in app.py registrieren

### Phase 2: Frontend Basis (Steps 6-9)

6. `npm install perfect-freehand`
7. TypeScript Types hinzufuegen
8. strokeUtils.ts erstellen (Koordinaten + SVG-Path-Generierung)
9. useAnnotations.ts Store erstellen

### Phase 3: Frontend Komponenten (Steps 10-13)

10. AnnotatedPage.tsx erstellen (img + SVG overlay + pointer events)
11. AnnotationToolbar.tsx erstellen (Tools, Farben, Breiten, Undo)
12. PdfViewer.tsx anpassen (Toggle-Button, AnnotatedPage statt img, Toolbar, Zoom-Sperre)
13. CSS Styles hinzufuegen

### Phase 4: Edge Cases (Step 14)

14. PDF-Loesch-Cascade: Annotationen mitloeschen

---

## Verifikation

1. Backend starten, pruefen dass `annotations` Tabelle erstellt wird
2. API mit curl testen: PUT → GET → DELETE
3. Frontend: Stift-Button in Toolbar sichtbar, Toggle funktioniert
4. Zeichnen: Striche erscheinen, skalieren beim Zoom korrekt
5. Persistenz: Seite neu laden → Striche wieder da
6. Radierer: Tap auf Strich loescht ihn
7. Undo: letzter Strich wird entfernt
8. Mobile: Scroll vs. Zeichnen klar getrennt
