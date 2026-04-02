# Implementierungsplan: Label-basierte Stimmen/Instrumente

> Mockups: `docs/mockups/labels-dateiliste.html`, `labels-rename-modal.html`, `labels-datenmodell.html`

## Uebersicht

Hardcoded SATB-Stimmen durch dynamische, admin-definierbare Labels mit `category="stimme"` ersetzen.
Jedes Stimmen-Label bekommt ein `shortcode` (fuer Dateinamen) und `aliases` (fuer Fuzzy-Matching).

---

## Phase 1: Backend — Label-Model erweitern

### Schritt 1.1: Label-Model erweitern
**Datei:** `backend/models/label.py`
- Neues Feld `shortcode: Optional[str] = Field(default=None, max_length=10)` — Kuerzel fuer Dateinamen ("S", "A", "Git", "PB")
- Neues Feld `aliases: Optional[str] = Field(default=None, max_length=200)` — Komma-getrennte Aliase fuer Fuzzy-Matching ("soprano,sop")

### Schritt 1.2: Seed-Labels aktualisieren
**Datei:** `backend/seed.py`
- Default-Stimmen-Labels mit `category="stimme"`, `shortcode` und `aliases` erstellen:
  - Sopran: shortcode="S", aliases="soprano,sop", color="#ec4899"
  - Alt: shortcode="A", aliases="alto", color="#f97316"
  - Tenor: shortcode="T", aliases="tenore", color="#3b82f6"
  - Bass: shortcode="B", aliases="basso,baritone", color="#22c55e"
- Bestehende Default-Labels (Schwierig, Geubt) behalten mit `category=None`

### Schritt 1.3: Label-API — Berechtigungen pro Kategorie
**Datei:** `backend/api/labels.py`
- Stimmen-Labels (category="stimme") **setzen/entfernen**: min. `pro-member`
- Stimmen-Labels **erstellen/bearbeiten/loeschen**: min. `chorleiter`
- Allgemeine Labels **setzen/entfernen**: min. `member`
- Allgemeine Labels **erstellen/bearbeiten/loeschen**: min. `pro-member`
- Label-API-Response um `shortcode` und `aliases` erweitern

### Schritt 1.4: VALID_VOICE_PARTS entfernen
**Dateien:** `backend/api/auth.py`, `backend/api/admin.py`
- `VALID_VOICE_PARTS`-Konstante entfernen
- Validierung bei Registrierung/User-Update: `voice_part` gegen Labels mit category="stimme" aus der DB pruefen (oder Freitext erlauben)

---

## Phase 2: Frontend — Types & Store

### Schritt 2.1: Label-Type erweitern
**Datei:** `frontend/src/types/index.ts`
- `Label`-Interface um `shortcode` und `aliases` erweitern:
  ```ts
  export interface Label {
    id: number
    name: string
    color: string
    category: string | null
    shortcode: string | null
    aliases: string | null
  }
  ```

### Schritt 2.2: Labels-Store — Helper fuer Stimmen-Labels
**Datei:** `frontend/src/hooks/useLabels.ts`
- Neuer Getter `voiceLabels`: filtert Labels mit `category === "stimme"`
- Neuer Getter `generalLabels`: filtert Labels mit `category !== "stimme"`
- Neuer Helper `getVoiceLabelsForPath(path)`: gibt nur Stimmen-Labels fuer eine Datei zurueck
- Neuer Helper `getGeneralLabelsForPath(path)`: gibt nur allgemeine Labels zurueck

---

## Phase 3: Frontend — Dateiliste (BrowsePage)

### Schritt 3.1: VoiceIcon durch VoicePill ersetzen
**Datei:** `frontend/src/components/ui/VoiceIcon.tsx` → umbenennen/refactoren
- Statt Buchstabe im Icon-Quadrat: Farbiger Pill mit ausgeschriebenem Label-Namen
- Input: `dropboxPath` statt `filename` + `folderName`
- Liest Stimmen-Labels fuer den Pfad aus dem Labels-Store
- Fallback: Music-Icon wenn kein Stimmen-Label vorhanden
- Mehrere Stimmen: Labels nebeneinander oder kombiniert anzeigen

### Schritt 3.2: BrowsePage anpassen
**Datei:** `frontend/src/pages/BrowsePage.tsx`
- `VoiceIcon` durch neuen `VoicePill` ersetzen, `entry.path` uebergeben
- Label-Chips unter dem Dateinamen: nur noch allgemeine Labels (nicht Stimmen-Labels, die sind jetzt im Pill)
- Filter-Bar: Stimmen-Labels und allgemeine Labels gemeinsam anzeigen (wie bisher)

### Schritt 3.3: FavoritesPage anpassen
**Datei:** `frontend/src/pages/FavoritesPage.tsx`
- Gleiche Aenderung wie BrowsePage: VoicePill statt VoiceIcon

---

## Phase 4: Frontend — Rename-Modal

### Schritt 4.1: RenameModal refactoren
**Datei:** `frontend/src/components/ui/RenameModal.tsx`
- Stimmen-Auswahl: Dynamisch aus `voiceLabels` des Stores laden (statt hardcoded `VOICES`)
- Jedes Stimmen-Label als toggle-barer Chip mit Farbpunkt und Label-Name
- Beim Auswaehlen: `shortcode` des Labels fuer `buildFilename()` verwenden
- Beim Speichern: Zusaetzlich zum Umbenennen die gewaehlten Stimmen-Labels als UserLabel-Assignments setzen

### Schritt 4.2: buildFilename anpassen
**Datei:** `frontend/src/utils/filename.ts`
- `VOICES`-Konstante entfernen
- `buildFilename()` akzeptiert jetzt `voiceShortcodes: string[]` statt `voices: string[]`
- Sortierung der Shortcodes: Nach `sort_order` der Labels statt hardcoded SATB-Reihenfolge

---

## Phase 5: Frontend — Recording-Modal & Upload

### Schritt 5.1: RecordingModal anpassen
**Datei:** `frontend/src/components/ui/RecordingModal.tsx`
- `VOICES`-Import durch `voiceLabels` aus Store ersetzen
- Dynamische Stimmen-Chips wie im RenameModal

### Schritt 5.2: ImportModal — Fuzzy Auto-Labeling
**Datei:** `frontend/src/components/ui/ImportModal.tsx`
- Neuer Utility `matchVoiceLabels(filename, voiceLabels[])`:
  1. Exakter Shortcode-Match am Dateianfang: "S-..." → Sopran
  2. Kombinierte Shortcodes: "SA-..." → Sopran + Alt
  3. Name als Prefix/Substring: "sopran-..." → Sopran
  4. Alias-Match: "soprano-..." → Sopran
  5. Case-insensitive
- Erkannte Labels im Import-Modal anzeigen (User kann vor Upload aendern)
- Nach Upload: Erkannte Labels automatisch als Assignments setzen

### Schritt 5.3: Fuzzy-Match Utility erstellen
**Datei:** `frontend/src/utils/matchVoiceLabels.ts` (NEU)
- `matchVoiceLabels(filename: string, labels: Label[]): Label[]`
- Match-Logik wie oben beschrieben
- Wird von ImportModal und optional von VoicePill (fuer Dateien ohne Assignment) genutzt

---

## Phase 6: Registrierung & Profil

### Schritt 6.1: RegisterPage dynamisieren
**Datei:** `frontend/src/pages/RegisterPage.tsx`
- `VOICE_PARTS`-Konstante entfernen
- Stimmen-Labels zur Laufzeit laden (oeffentlicher Endpoint oder nach Registrierung)
- Oder: Stimmenauswahl aus Registrierung entfernen und in Profil-Einstellungen verschieben

### Schritt 6.2: SettingsPage anpassen
**Datei:** `frontend/src/pages/SettingsPage.tsx`
- Stimmenauswahl: Labels mit category="stimme" aus Store laden
- Dynamische Chips statt hardcoded Optionen

### Schritt 6.3: Admin UsersPage
**Datei:** `frontend/src/pages/admin/UsersPage.tsx`
- Stimmen-Anzeige: Label-Name statt roher `voice_part`-String

---

## Phase 7: Cleanup — Hardcoded Voice-Code entfernen

### Schritt 7.1: voiceColors.ts refactoren oder entfernen
**Datei:** `frontend/src/utils/voiceColors.ts`
- `VOICE_COLORS`, `VOICE_BG`, `VOICE_FULL` Mappings entfernen
- Farben kommen jetzt aus dem `color`-Feld der Labels
- Helper-Funktionen ggf. behalten aber auf Label-Daten umstellen

### Schritt 7.2: parseTrackFilename.ts anpassen
**Datei:** `frontend/src/utils/parseTrackFilename.ts`
- `VOICE_RE = /^[SATB]+$/` durch dynamisches Pattern ersetzen (aus Label-Shortcodes gebaut)
- `VOICE_ORDER` durch Label-sort_order ersetzen
- Backward-Kompatibilitaet: SATB-Parsing weiterhin unterstuetzen fuer bestehende Dateien

### Schritt 7.3: buildBatchGrid.ts anpassen
**Datei:** `frontend/src/utils/buildBatchGrid.ts`
- `voiceSortKey()`, `voiceColorClass()`, `voiceLabel()` auf Label-Daten umstellen

### Schritt 7.4: BatchGrid.tsx anpassen
**Datei:** `frontend/src/components/ui/BatchGrid.tsx`
- Voice-Header und -Zellen: Label-basierte Farben und Namen

### Schritt 7.5: PlayerPage und SectionEditorPage
**Dateien:** `frontend/src/pages/PlayerPage.tsx`, `frontend/src/pages/SectionEditorPage.tsx`
- Voice-Farben aus Label-Daten statt aus voiceColors.ts

---

## Betroffene Dateien (Zusammenfassung)

### Backend (4 Dateien)
| Datei | Aenderung |
|-------|-----------|
| `backend/models/label.py` | +shortcode, +aliases Felder |
| `backend/seed.py` | Default-Stimmen-Labels mit shortcode/aliases |
| `backend/api/labels.py` | Berechtigungen pro Kategorie |
| `backend/api/auth.py` | VALID_VOICE_PARTS entfernen |

### Frontend — Core (5 Dateien)
| Datei | Aenderung |
|-------|-----------|
| `frontend/src/types/index.ts` | Label-Type erweitern |
| `frontend/src/hooks/useLabels.ts` | voiceLabels/generalLabels Getter |
| `frontend/src/utils/filename.ts` | VOICES entfernen, buildFilename anpassen |
| `frontend/src/utils/voiceColors.ts` | Refactoren auf Label-Daten |
| `frontend/src/utils/matchVoiceLabels.ts` | NEU: Fuzzy-Matching |

### Frontend — Komponenten (5 Dateien)
| Datei | Aenderung |
|-------|-----------|
| `frontend/src/components/ui/VoiceIcon.tsx` | → VoicePill, label-basiert |
| `frontend/src/components/ui/RenameModal.tsx` | Dynamische Stimmen-Chips |
| `frontend/src/components/ui/RecordingModal.tsx` | Dynamische Stimmen-Chips |
| `frontend/src/components/ui/ImportModal.tsx` | Fuzzy Auto-Labeling |
| `frontend/src/components/ui/BatchGrid.tsx` | Label-basierte Farben |

### Frontend — Pages (6 Dateien)
| Datei | Aenderung |
|-------|-----------|
| `frontend/src/pages/BrowsePage.tsx` | VoicePill statt VoiceIcon |
| `frontend/src/pages/FavoritesPage.tsx` | VoicePill statt VoiceIcon |
| `frontend/src/pages/PlayerPage.tsx` | Label-basierte Farben |
| `frontend/src/pages/RegisterPage.tsx` | Dynamische Stimmenauswahl |
| `frontend/src/pages/SettingsPage.tsx` | Dynamische Stimmenauswahl |
| `frontend/src/pages/admin/UsersPage.tsx` | Label-Name statt voice_part |

### Frontend — Utils (2 Dateien)
| Datei | Aenderung |
|-------|-----------|
| `frontend/src/utils/parseTrackFilename.ts` | Dynamisches Voice-Pattern |
| `frontend/src/utils/buildBatchGrid.ts` | Label-basierte Sort/Color |

---

## Empfohlene Reihenfolge

Die Phasen sind so geordnet, dass die App nach jeder Phase lauffaehig bleibt:

1. **Phase 1** (Backend): Model erweitern, Seed anpassen — bestehende Funktionalitaet bleibt
2. **Phase 2** (Frontend Types): Types + Store erweitern — abwaertskompatibel
3. **Phase 3** (Dateiliste): VoicePill einbauen — sichtbarste Aenderung
4. **Phase 4** (Rename-Modal): Dynamische Stimmenauswahl
5. **Phase 5** (Upload): Auto-Labeling beim Import
6. **Phase 6** (Registrierung/Profil): Dynamisieren
7. **Phase 7** (Cleanup): Alten hardcoded Code entfernen

Jede Phase kann als eigener Commit deployed werden.

---

## Offene Entscheidungen

1. **User.voice_part Feld**: Behalten (fuer Profil-Anzeige) oder durch Label-Association ersetzen?
2. **Registrierung**: Stimmenauswahl bei Registrierung behalten oder in Profil verschieben?
3. **Multi-Stimmen im Dateinamen**: "SA" weiterhin als kombinierter Shortcode unterstuetzen?
4. **Rueckwaertskompatibilitaet**: Bestehende SATB-Dateinamen weiter parsen oder nur neue Labels?
