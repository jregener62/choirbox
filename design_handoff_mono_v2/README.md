# Handoff: CantaBox Mono v2 Redesign

## Overview

This package contains a visual redesign of CantaBox (formerly ChoirBox) in a **Swiss minimalist / editorial mono** direction. It replaces the current blue-purple indigo system with a **restrained black-and-white + orange-red accent** aesthetic, using **Helvetica Neue** paired with **monospace for metadata**. The voice-color system (SATB) is preserved but rendered as thin outline chips instead of filled badges.

The redesign covers **all core screens as Light/Dark pairs**:

- Login
- Onboarding (voice selection)
- Browse / Repertoire list
- Player (text viewer with A/B loop markers)
- Recorder (with waveform visualization)
- Settings / Profile
- Admin (member list with voice distribution)
- Empty state
- Error state

## About the Design Files

The files in this bundle are **design references created in HTML/React**. They are prototypes showing the intended look and behavior — **not production code to copy directly**.

Your task is to **recreate these designs in the existing CantaBox codebase** (`frontend/` — React + TypeScript + Vite with CSS custom properties in `tokens.css`), using its established patterns, component structure, and routing. The HTML prototypes use simplified inline React components for speed; you'll reimplement them using the real app's components (`AppShell`, `GlobalPlayerBar`, etc.) and real data flow.

**Branch strategy:** Create a new branch `design/mono-v2` from the current default branch and apply these changes there so the user can test the redesign in isolation.

## Fidelity

**High-fidelity.** Pixel-accurate mockups with final colors, typography, spacing, radius, and SATB chip treatments. Recreate the visual treatment precisely. Layout/interactions can adapt to the existing codebase's patterns — what matters is the **visual system** (tokens, typography pairing, chip style, mini-player treatment, filter-tab pattern).

---

## Design System

### Color Tokens (replace `frontend/src/styles/tokens.css`)

The existing `tokens.css` has both light + dark themes via `[data-theme="dark"]` — **keep that structure**, just replace the color values. SATB voice colors and radius/spacing tokens stay exactly as they are.

**Light theme:**
```css
--bg-primary:    #FAFAFA;  /* was #F0F2F6 */
--bg-secondary:  #FFFFFF;  /* was #FFFFFF */
--bg-tertiary:   #F5F5F5;  /* was #E4E7EE */
--bg-elevated:   #FFFFFF;
--text-primary:  #0A0A0A;  /* was #1A1F2E */
--text-secondary:#525252;  /* was #4A5064 */
--text-muted:    #737373;  /* was #6E7486 */
--border:        rgba(10,10,10,0.1);
--accent:        #FF3B00;  /* was #6366f1 — orange-red */
--accent-hover:  #CC2F00;
--player-bg:     #0A0A0A;  /* was #2A3348 — solid black mini-player */
--player-text:   #FAFAFA;
```

**Dark theme:**
```css
--bg-primary:    #0A0A0A;  /* was #1E2538 */
--bg-secondary:  #111111;  /* was #2A3348 */
--bg-tertiary:   #1A1A1A;  /* was #354050 */
--bg-elevated:   #1A1A1A;
--text-primary:  #FAFAFA;
--text-secondary:#A3A3A3;
--text-muted:    #737373;
--border:        rgba(250,250,250,0.12);
--accent:        #FF3B00;
--accent-hover:  #FF5A2A;
--player-bg:     #FAFAFA;  /* inverse: light mini-player on dark page */
--player-text:   #0A0A0A;
```

**Keep unchanged:** `--sopran`, `--alt`, `--tenor`, `--bass`, `--satb`, `--piano`, `--marker`, `--playback`, all `--v-note-*`, radius scale, spacing scale.

### Typography

Add to `tokens.css`:
```css
:root {
  --font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}
```

**Usage rules:**
- **Body / titles / UI:** `--font-sans` at tight letter-spacing for titles (`-0.6` to `-1px`), normal for body
- **Metadata, timestamps, bar numbers, dB readouts, role labels, kbd-style info:** `--font-mono` at uppercase with `letter-spacing: 1–2px`, sizes 9–11px
- **Section labels above groups** (e.g. "KONTO", "APP", "CHOR"): `--font-mono` uppercase, 9px, color `--text-muted`, letter-spacing 2px

**Type scale** (restrained — typo_scale=3):
- Hero titles: 26–28px, weight 700, letter-spacing -0.8 to -1
- Screen titles: 20–24px, weight 700, letter-spacing -0.5
- Body: 14–15px, weight 400
- Meta (mono): 9–11px, uppercase, letter-spacing 1–2
- Max title stays under 28px — no magazine-cover scale

### Border Radius

Keep `--radius-*` tokens; the Mono aesthetic uses **radius 0 by default** (hard square corners) but exposes a tweak (0/4/8). Start with 0 for chips, buttons, cards. Mini-player play-button stays circular (use `--radius-full`).

### SATB Voice Chips

Replace any filled badge treatment with **outline chip**:
```css
.voice-chip {
  display: inline-block;
  padding: 2px 7px;
  border: 1px solid var(--voice-color);
  color: var(--voice-color);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  border-radius: 0;
  background: transparent;
}
```
Where `--voice-color` is `--sopran`, `--alt`, `--tenor`, `--bass`, or `--satb` depending on the piece.

---

## Screens

Each screen is designed at **320×652px** (iPhone mini-scale). All dimensions below are from that base.

### 1. Login
- **Layout:** Single centered column, 24px horizontal padding, vertical flex
- **Top:** Small wordmark "CANTABOX" — 11px mono-ish uppercase, letter-spacing 3, weight 700, black
- **Hero:** "Willkommen zurück." — 26px, weight 700, letter-spacing -0.8
- **Subtitle:** "Melde dich mit deinen Zugangsdaten an." — 13px, muted
- **Fields:** Underline-only inputs (no box). Label above field (9px mono, uppercase, letter-spacing 2, muted). Value sits on a 1px bottom border. Active field: solid black border. Password field: right-aligned "Vergessen?" link in accent color.
- **CTA:** Full-width black pill/block "ANMELDEN" — 12px uppercase, letter-spacing 2, weight 700, 15px vertical padding
- **Footer:** Centered 11px "Noch kein Konto? Einladungslink" (accent)

### 2. Onboarding (Voice Selection)
- **Layout:** Top progress indicator ("Schritt 2 / 3" in mono uppercase), title "Welche Stimme singst du?" (22px), subtitle
- **Options:** 4 rows (Sopran/Alt/Tenor/Bass) separated by 1px borders. Each row: checkbox square (22×22, filled black when picked) + name (16px, weight 600 when picked) + tiny 6px voice-color dot on right
- **Footer:** 2-column layout — "Zurück" (outline) + "Weiter" (black, 2× width)

### 3. Browse / Repertoire
- **Header:** Wordmark left ("CANTABOX" 11px letter-spacing 3), icons right (search, 22px round avatar with initial)
- **Title block:** Small mono label "Requiem · Fauré" / big number/opus "Op. 48" (28px, letter-spacing -1), stats row in mono (`7 STÜCKE · 3 GEÜBT · 43%`), thin 2px progress bar (orange-red fill on `--border` track)
- **Tabs:** 3 horizontal tabs with 2px accent underline on active ("Alle" / "Meine (Sopran)" / "Offen")
- **List rows:**
  - Left: 2-digit mono number (01, 02, ...) in muted color
  - Middle: piece name (15px, weight 600) + meta line in mono (`3:15 · HEUTE`)
  - Right: voice chip
  - Completed pieces: name is strikethrough + muted color
  - 1px border between rows
- **Bottom:** Mini-player (black on light / inverted on dark) — 32px square orange play/pause button, "Pie Jesu" + mono timestamp, collapsed expand arrow on right

### 4. Player
- **Top bar:** back arrow "←", center title "Requiem" with kicker "Nº 01 / 07" above in mono, right "⋯"
- **Meta row:** Voice chip (S) + mono meta "D-DUR · 72 BPM"
- **Title:** "Pie Jesu." — 28px, weight 700, letter-spacing -1
- **Subtitle:** composer/opus — 12px muted
- **Text viewer:** Section label "TEXT" (mono, uppercase) then lyrics at 15px line-height 1.75. Currently-singing line gets 2px accent left border (offset so text stays aligned). Upcoming lines muted.
- **Progress row (over slider):** 4 mono timestamps: current time, "A · 0:32" (loop start, accent), "B · 2:14" (loop end, accent), total time
- **Slider:** Thin 2px track. Loop range rendered as 2px solid black segment between A and B markers (which are 8px vertical accent lines). Playhead = 10×10 black square.
- **Controls:** ±5s labels (mono, muted) on outside, center cluster: skip-back ⟲, big 56px black square play/pause, skip-fwd ⟳
- **Action strip:** 4 equal-width outline buttons (1px border, 9px padding, 10px mono text): LOOP (active — accent color + accent border), + MARKER, TEXT, AUFN. Inactive buttons use muted color + border.

### 5. Recorder
- **Top bar:** × close, center "Pie Jesu" with kicker "Aufnahme", no right action
- **Status:** Small 8px accent circle with CSS `pulse` animation + "AUFNAHME LÄUFT" mono label (accent color, 10px, letter-spacing 2, weight 700)
- **Timer:** 40px weight 700, tabular-nums, letter-spacing -1.5 ("00:42")
- **Max info:** "VON 03:15 MAX." — 11px mono muted, letter-spacing 1
- **Waveform:** Horizontal row of ~36 thin vertical bars, flex:1 each. Elapsed bars use accent color; upcoming bars use border color. Heights roughly sinusoidal for organic feel.
- **Labels below waveform:** 3-col mono row — `00:00` / `MIC · −12 dB` / `03:15`
- **Controls:** 3-button row, evenly spaced
  - "Neu" — 44px outline square with ⟲
  - "Stop" — 68px **accent-filled** square with white inner stop-square (20×20) — this is the only filled-accent control
  - "Fertig" — 44px outline square with ✓
  - Labels below each (9px mono, uppercase, letter-spacing 1)

### 6. Settings / Profile
- **Header block:** Kicker "PROFIL" (mono), name "Jonas Regener" (24px weight 700), row with voice chip + mono "PRO-MEMBER · CHOR: ST. MARIEN"
- **Sections:** 4 groups — "KONTO", "APP", "CHOR", "INFO"
  - Each section: 9px mono uppercase header, 22px horizontal padding
  - Rows: 14px label left, 12px value-or-link right with " ›" chevron. Last row in "INFO" is "Abmelden" with accent color.
  - 1px borders between rows; section borders at top/bottom
- **Standard rows (content):**
  - KONTO: Stimme (Sopran), Passwort (ändern), Anzeigename (jonas)
  - APP: Theme (Hell), Schriftgröße (Standard), Offline-Modus (An)
  - CHOR: Chor wechseln, Dropbox-Sync (Verbunden)
  - INFO: Über CantaBox (v2.4.1), Abmelden (accent)

### 7. Admin / Members
- **Top bar:** ← / "Mitglieder" with kicker "ADMIN" / + (add member)
- **Stats bar:** Large count "18" (20px weight 700) + voice breakdown on right (mono 10px): `● 6S  ● 5A  ● 4T  ● 3B` — dots in each voice color
- **Rows:**
  - Left: 28×28 outline circle with first-letter initial in voice color
  - Middle: full name (14px weight 500) + role/last-active in mono (10px, `ADMIN · VOR 1H`)
  - Right: voice chip
- **Bottom tabs:** 4-tab strip — "Users" / "Labels" / "Gäste" / "Data" — active tab has 2px accent top-border and bold text
- **Sample members:** Anna Mercier (S, Member), Bernd Klose (B, Admin), Clara Weiß (A, Member), David Lang (T, Member), Eva Hartmann (S, Guest), Frank Roth (B, Member)

### 8. Empty State (Favorites)
- **Centered column:** 56×56 outline star square → "Noch keine Favoriten" (20px weight 700) → 13px muted explanation "Markiere ein Stück mit ☆, um es hier wiederzufinden." (max-width 240) → outline CTA button "REPERTOIRE ÖFFNEN" (11px mono, letter-spacing 2, 1px black border)

### 9. Error State (503)
- **Centered column (left-aligned):** Error code "ERROR · 503" (11px mono accent, letter-spacing 3, weight 700) → title "Dropbox nicht erreichbar." (28px weight 700, letter-spacing -1) → 13px muted description about offline fallback
- **Actions:** 2-button row — "SCHLIESSEN" (outline muted) + "ERNEUT" (black fill)
- **Footer:** Small timestamp "LAST SYNC · 22.APR 21:04" in mono, very muted

---

## Interactions & Behavior

- **Theme toggle:** Existing `[data-theme="dark"]` mechanism continues to work — just swap the token values.
- **Recorder pulse:** `@keyframes pulse { 0%,100% {opacity:1} 50% {opacity:0.3} }` applied to the 8px status dot, 1s infinite.
- **A/B loop:** Player slider renders 2 markers (8px vertical accent lines) at loop boundaries; filled track segment between them is solid `--text-primary`.
- **Active tab underline:** 2px bottom border in `--accent`, negative 1px margin to overlap the container border.
- **Strikethrough for completed pieces:** `text-decoration: line-through; text-decoration-thickness: 1px;` + `color: var(--text-muted)`.
- **Mini-player expand:** Tap/click expand arrow opens full Player screen.

## State / Data

No new state management needed — the redesign is **purely visual**. Existing routing, data fetching, auth, and audio playback logic stay untouched.

## Assets

No new assets required. All iconography uses:
- Unicode characters as placeholders (←, ⋯, ⟲, ⟳, ✓, ×, ☆, ›, ●)
- Simple inline SVGs for play/pause, shift, etc.

**Recommendation:** When implementing, swap Unicode icons for the app's existing icon library (lucide, heroicons, or custom SVG set) — keep strokes thin (1.5–2px) and square-cap to match the Mono aesthetic.

---

## Files in this Bundle

- `README.md` — this file
- `CantaBox Mono v2.html` — the canvas showing all 18 screens (9 views × light/dark)
- `mono/screens.jsx` — all 9 screen components with exact styling (source of truth for dimensions, colors, typography)
- `mono/design-canvas.jsx` — pan/zoom canvas harness (not needed for implementation; just viewer)

**How to view locally:** Open `CantaBox Mono v2.html` in a browser; pan with two-finger scroll, zoom with pinch/ctrl-scroll, click any artboard's label to focus it fullscreen.

---

## Implementation Checklist for Claude Code

1. **Create branch** `design/mono-v2` off current default (likely `main`)
2. **Update `frontend/src/styles/tokens.css`** with the color values above (keep voice colors, radius, spacing as-is); add `--font-sans` and `--font-mono` variables
3. **Create a `.voice-chip` utility class** in `index.css` or a new `components.css`
4. **Update each page component:**
   - `pages/LoginPage.tsx` — underline inputs, black CTA, restrained type
   - Onboarding page (create if not present, or integrate into sign-up flow)
   - Browse page — progress header, mono stats, filter tabs, new list row style, mini-player re-skin
   - Player page — text viewer, A/B loop slider, 4-button action strip
   - Recorder — waveform + 3-button control cluster
   - Settings — grouped sections with mono headers, `›` chevrons
   - Admin — stats bar, initial circles, tabs
   - Empty/Error components — unify pattern
5. **Re-skin `AppShell` / `GlobalPlayerBar`** to match the new mini-player treatment (solid accent button, mono timestamps)
6. **Visual QA** against each artboard in `CantaBox Mono v2.html` — open side by side during implementation
7. **Commit with prefix** `design(mono-v2): …` for easy review later
8. **Push branch and open draft PR** — do not merge; user will review and test first

## Questions / Edge Cases

- If `tokens.css` has color names that aren't shown here (e.g. `--marker`, `--playback`), keep their current values — Mono doesn't change them.
- If any existing component (e.g. `Modal`) doesn't have a direct mockup, apply the system by analogy: black text on white, 1px borders, mono uppercase labels, orange-red accent for primary action, zero radius by default.
- Font fallback: if Helvetica Neue isn't available on Linux dev machines, the fallback chain picks up Arial — acceptable for preview. In production, ship Helvetica Neue via a font CDN or system fallback (the app presumably runs on iOS/macOS devices mostly, so system fonts are fine).
