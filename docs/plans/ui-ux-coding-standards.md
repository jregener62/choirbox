# UI/UX Coding Standards for React/TypeScript Mobile-First Web Apps

Researched March 2025. Focused on practical, checkable standards for ChoirBox.

---

## 1. Component Architecture Standards

### 1.1 Atomic Design Methodology

| Level | Definition | ChoirBox Examples |
|-------|-----------|------------------|
| **Atoms** | Smallest indivisible UI elements. Single-responsibility, no business logic. | Button, Icon, Badge, Input, Label |
| **Molecules** | Functional groups of atoms. Accept data via props, no internal fetching. | TrackBadges, VoiceIcon + Label, SearchInput |
| **Organisms** | Complex components composed of molecules/atoms. May own local state. | SectionLane, PlayerControlsBar, GlobalPlayerBar |
| **Templates** | Page-level layouts that define content zones (slots). No data. | AppShell (already exists) |
| **Pages** | Route components that connect data to templates. | Browse, Favorites, Settings |

**Checkable standards:**
- [ ] Atoms accept only primitive props + callbacks (no objects, no business logic)
- [ ] Molecules compose atoms; no direct DOM manipulation of child atoms
- [ ] Organisms may have local state but fetch no data themselves (pages or hooks do)
- [ ] Every component lives at exactly one level; no level-skipping imports (atom importing organism)

### 1.2 Compound Component Pattern

Use when a component has multiple related sub-parts that share implicit state:

```tsx
// Good: compound — consumer controls structure
<Player>
  <Player.Timeline />
  <Player.Controls />
  <Player.Lyrics />
</Player>

// Avoid: prop soup — parent controls everything
<Player showTimeline showControls showLyrics lyricsPosition="bottom" />
```

**When to use:**
- Component has 3+ visual sub-parts
- Consumers need to reorder, omit, or wrap sub-parts
- Internal state must be shared without prop drilling

**When NOT to use:**
- Simple components with 1-2 props
- Adds indirection without clear consumer benefit

**Checkable standards:**
- [ ] Components with 5+ boolean "show" props are candidates for compound pattern
- [ ] Compound components use React Context internally (not React.Children.map)
- [ ] TypeScript enforces valid children via static sub-component types

### 1.3 Composition over Configuration

- Prefer `children` and render props over config objects
- Prefer slot props (`header`, `footer`) over deeply nested option trees
- Keep prop count under 7 for any component; above that, refactor into composition

### 1.4 Container/Presentational Split

- **Presentational components:** Pure rendering, receive all data via props. Easy to test, reuse, style.
- **Container components (or hooks):** Handle data fetching, state, side effects. Pass results down.
- In modern React, custom hooks largely replace container components: `useTrackData()` instead of `<TrackDataContainer>`.

**Checkable standards:**
- [ ] No `fetch()` or API calls inside `components/ui/` files
- [ ] Data fetching lives in pages or dedicated hooks
- [ ] Components in `components/ui/` are reusable without specific page context

---

## 2. CSS/Styling Standards

### 2.1 Design Tokens

Tokens are named CSS custom properties that encode design decisions. Three layers:

| Layer | Purpose | Example |
|-------|---------|---------|
| **Primitive** | Raw values | `--blue-500: #3b82f6` |
| **Semantic** | Purpose-based mapping | `--color-accent: var(--blue-500)` |
| **Component** | Scoped overrides | `--button-bg: var(--color-accent)` |

**ChoirBox already has semantic tokens** (e.g., `--accent`, `--bg-primary`). Missing:
- [ ] Spacing tokens
- [ ] Typography tokens
- [ ] Shadow tokens
- [ ] Border-radius tokens
- [ ] Transition/animation tokens

### 2.2 Spacing Scale (4px Base Grid)

Every spacing value should come from a predefined scale, not arbitrary pixel values.

```css
:root {
  --space-0: 0;
  --space-1: 4px;    /* tight: icon gaps */
  --space-2: 8px;    /* compact: inline spacing */
  --space-3: 12px;   /* default: list item padding */
  --space-4: 16px;   /* standard: card padding */
  --space-5: 20px;   /* comfortable: section gaps */
  --space-6: 24px;   /* generous: page margins */
  --space-8: 32px;   /* large: section separators */
  --space-10: 40px;  /* extra-large */
  --space-12: 48px;  /* touch target minimum */
}
```

**Checkable standards:**
- [ ] No magic pixel values in CSS; all spacing via `var(--space-*)` tokens
- [ ] Consistent page margins: `var(--space-4)` or `var(--space-6)`
- [ ] All gap/padding values are multiples of 4px

### 2.3 Typography Scale (Minor Third Ratio 1.2)

```css
:root {
  --font-xs: 0.694rem;    /* 11px — captions */
  --font-sm: 0.833rem;    /* 13px — secondary text */
  --font-base: 1rem;      /* 16px — body */
  --font-md: 1.2rem;      /* 19px — subheadings */
  --font-lg: 1.44rem;     /* 23px — headings */
  --font-xl: 1.728rem;    /* 28px — page titles */
  --font-2xl: 2.074rem;   /* 33px — hero (rarely needed) */

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
}
```

**Checkable standards:**
- [ ] Body text is 16px minimum (browser default, never smaller for mobile)
- [ ] Line height >= 1.4 for body text
- [ ] No more than 3-4 font sizes per page
- [ ] Font weight contrast between headings (600-700) and body (400-500)

### 2.4 CSS Custom Properties for Theming

ChoirBox already implements this well with `[data-theme="dark"]`. Standards to maintain:

- [ ] All color values use CSS custom properties, never hardcoded hex/rgb
- [ ] Theme switch is instantaneous (no flash-of-wrong-theme)
- [ ] Respect `prefers-color-scheme` for initial theme (96.7% browser support)
- [ ] Semantic token names describe purpose, not appearance (`--text-primary`, not `--dark-gray`)
- [ ] Dark mode maintains same contrast ratios as light mode

### 2.5 Mobile-First Responsive Patterns

```css
/* Base: mobile (no media query needed) */
.card { padding: var(--space-3); }

/* Tablet and up */
@media (min-width: 768px) { .card { padding: var(--space-4); } }

/* Desktop */
@media (min-width: 1024px) { .card { padding: var(--space-6); } }
```

**Checkable standards:**
- [ ] All media queries use `min-width` (mobile-first), never `max-width`
- [ ] Base styles (no media query) target smallest screens
- [ ] Touch styles are the default; hover states added via `@media (hover: hover)`
- [ ] Use `clamp()` for fluid typography: `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.2rem)`

---

## 3. Accessibility (a11y) Standards

### 3.1 WCAG 2.2 AA Requirements (Current Standard)

| Criterion | Requirement | Check |
|-----------|-------------|-------|
| **1.4.3 Contrast (Minimum)** | 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+) | Test all color token pairs |
| **1.4.11 Non-text Contrast** | 3:1 for UI components and graphical objects | Borders, icons, focus rings |
| **2.4.7 Focus Visible** | Focus indicator must be visible on all interactive elements | No `outline: none` without replacement |
| **2.4.11 Focus Appearance (AA)** | Focus indicator >= 2px, >= 3:1 contrast with adjacent colors | Measure ring width + color |
| **2.5.5 Target Size (Enhanced)** | Interactive targets >= 44x44 CSS pixels (AAA) | Minimum 24x24 for AA |
| **2.5.8 Target Size (Minimum)** | At least 24x24 CSS pixels with sufficient spacing | WCAG 2.2 new criterion |
| **1.3.1 Info and Relationships** | Semantic HTML conveys structure | Use `<nav>`, `<main>`, `<button>` |
| **4.1.2 Name, Role, Value** | All interactive elements have accessible names | `aria-label` for icon buttons |

### 3.2 Touch Target Sizes

| Standard | Minimum Size | Recommended For |
|----------|-------------|-----------------|
| WCAG 2.2 AA | 24x24 CSS px | Legal compliance floor |
| WCAG 2.2 AAA | 44x44 CSS px | Best practice for web |
| Apple HIG | 44x44 pt | iOS consistency |
| Material Design | 48x48 dp | Android consistency |

**ChoirBox recommendation:** 48px minimum for all interactive elements (buttons, links, controls).

**Checkable standards:**
- [ ] All buttons/links have min-height: 48px and min-width: 48px (or equivalent padding)
- [ ] Spacing between touch targets >= 8px to prevent mis-taps
- [ ] No interactive elements smaller than 24x24px under any circumstance

### 3.3 ARIA Patterns for Common Components

| Component | Required ARIA | Notes |
|-----------|--------------|-------|
| Icon button | `aria-label="Abspielen"` | Must have text alternative |
| Modal/Dialog | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` | Focus trap required |
| Tabs | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected` | Arrow key navigation |
| Toast/Alert | `role="alert"` or `aria-live="polite"` | Auto-announced by SR |
| Progress | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` | For seek bar, loading |
| Dropdown menu | `aria-expanded`, `aria-haspopup` | Escape to close |

**Checkable standards:**
- [ ] Every `<img>` has `alt` text (or `alt=""` + `aria-hidden="true"` for decorative)
- [ ] Every icon-only button has `aria-label`
- [ ] Modals trap focus and return focus to trigger on close
- [ ] Dynamic content changes use `aria-live` regions
- [ ] Use semantic HTML first; ARIA only when no native element exists

### 3.4 Focus Management in SPAs

- [ ] Route changes move focus to the new page's `<h1>` or `<main>`
- [ ] Modal open -> focus first focusable element inside
- [ ] Modal close -> return focus to the trigger button
- [ ] Keyboard navigation follows visual order (no CSS-reordered tab stops)
- [ ] All interactive elements reachable via Tab key
- [ ] Custom widgets support expected keyboard patterns (Arrow keys for tabs, Escape to close)
- [ ] Focus ring style: 2px solid, 3:1 contrast, offset from element border

### 3.5 Color Contrast Requirements

| Element | Minimum Ratio |
|---------|--------------|
| Normal text (< 18px bold / < 24px) | 4.5:1 |
| Large text (>= 18px bold / >= 24px) | 3:1 |
| UI components (borders, icons) | 3:1 |
| Focus indicators | 3:1 against adjacent colors |
| Placeholder text | 4.5:1 (treat as normal text) |

---

## 4. State Management Standards

### 4.1 UI State vs Server State

| Aspect | UI State | Server State |
|--------|----------|-------------|
| **Owned by** | Client | Remote server |
| **Examples** | Theme, sidebar open, current tab | Tracks, favorites, user profile |
| **Tool** | Zustand, useState, useReducer | TanStack Query, SWR |
| **Caching** | Not needed | Essential (stale-while-revalidate) |
| **Sync** | Instant | Async (loading/error states) |

**ChoirBox currently uses Zustand for everything.** The standard recommendation:
- Zustand for UI state (theme, player state, navigation)
- Consider TanStack Query for server state (API data, caching, deduplication)

**Checkable standards:**
- [ ] API response data is not manually stored in Zustand (use server-state library or clear cache pattern)
- [ ] No manual `isLoading`/`error` state for API calls (handled by data-fetching layer)
- [ ] Zustand stores are split by domain (auth, player, app), not monolithic

### 4.2 Loading / Error / Empty State Patterns

Every data-dependent view must handle four states:

| State | Pattern | Implementation |
|-------|---------|---------------|
| **Loading** | Skeleton screens (preferred) or spinner | Show content shape, not blank page |
| **Success** | Render data | Normal display |
| **Error** | Error message + retry action | "Fehler beim Laden. Erneut versuchen?" |
| **Empty** | Helpful empty state with action | "Noch keine Favoriten. Stoebre durch die Stuecke." |

**Checkable standards:**
- [ ] No raw `{data && <List />}` without loading/error/empty handling
- [ ] Skeleton screens match the layout of loaded content
- [ ] Error states include a retry mechanism (button or pull-to-refresh)
- [ ] Empty states guide the user to a next action
- [ ] Loading indicators appear within 200ms for slow operations

### 4.3 Optimistic Updates

Show the result immediately, roll back on failure.

**When to use:**
- Toggle favorite (star/unstar)
- Simple form submissions with high success rate
- Delete actions (with undo)

**When NOT to use:**
- Complex server validations
- Actions with irreversible side effects
- Network-dependent operations where failure is common

**Implementation standard (React 19+):**

```tsx
// React 19 useOptimistic hook
const [optimisticFavorites, setOptimistic] = useOptimistic(favorites);
```

Or with TanStack Query: `onMutate` -> snapshot + optimistic update -> `onError` -> rollback.

**Checkable standards:**
- [ ] Favorite toggle updates UI instantly without waiting for API response
- [ ] Failed optimistic updates roll back gracefully with user notification
- [ ] Optimistic state is visually indistinguishable from confirmed state

---

## 5. Code Organization Standards

### 5.1 Folder Structure (Type-Based with Feature Grouping)

ChoirBox's current structure is type-based and well-organized. Recommendations:

```
frontend/src/
  api/              # API client, endpoint functions
  components/
    layout/         # AppShell, BottomNav, GlobalPlayerBar
    ui/             # Reusable atoms + molecules (presentational)
  hooks/            # Custom hooks (usePlayer, useFavorites, etc.)
  pages/            # Route components (containers)
    admin/          # Admin-only pages
  stores/           # Zustand stores
  styles/           # Global CSS, tokens
  types/            # Shared TypeScript types
  constants/        # App-wide constants (routes, config, enums)
  utils/            # Pure utility functions
```

**Checkable standards:**
- [ ] Maximum 3 levels of nesting within `src/`
- [ ] No circular imports between directories
- [ ] Each directory has a clear single responsibility
- [ ] Related files are co-located (component + its CSS + its types in same dir)

### 5.2 Barrel Exports — Use With Caution

**2025 consensus: Avoid barrel files (index.ts re-exports) in application code.**

Problems:
- Bundle bloat: importing one component pulls in all siblings
- Slow dev server: Vite/webpack must process entire barrel on each HMR update
- Atlassian measured 75% faster builds after removing barrel files

**When barrels are acceptable:**
- Library entry points (not applicable to ChoirBox)
- Re-exporting a single default alongside types from the same module

**Checkable standards:**
- [ ] No `index.ts` files that re-export all sibling modules
- [ ] Import directly: `import { Button } from '@/components/ui/Button'`, not `from '@/components/ui'`
- [ ] Vite aliases configured for clean absolute imports

### 5.3 Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Components | PascalCase `.tsx` | `PlayerControlsBar.tsx` |
| Hooks | `use` + camelCase `.ts` | `usePlayer.ts` |
| Utilities | camelCase `.ts` | `formatDuration.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_BASE_URL` |
| Types/Interfaces | PascalCase | `Track`, `PlayerState` |
| CSS files | kebab-case `.css` | `player-controls.css` |
| Directories | kebab-case | `components/ui/` |
| Event handlers | `handle` + Event | `handleClick`, `handleSeek` |
| Boolean props | `is`/`has`/`should` prefix | `isPlaying`, `hasError` |

**Checkable standards:**
- [ ] All component files use PascalCase
- [ ] All hooks start with `use`
- [ ] Boolean variables/props use `is`/`has`/`should` prefix
- [ ] No mixed naming conventions within a directory
- [ ] TypeScript types use PascalCase, never `I` prefix for interfaces

### 5.4 Shared Constants/Config

- [ ] API endpoints centralized in one file (`api/endpoints.ts` or similar)
- [ ] Route paths defined as constants, not string literals in multiple files
- [ ] Magic numbers extracted to named constants with explanatory names
- [ ] Environment-dependent config uses import.meta.env, centralized in one config file

---

## 6. Performance Standards

### 6.1 Code Splitting

Split the bundle so users only download what they need.

```tsx
// Route-based splitting (highest impact)
const AdminPage = React.lazy(() => import('./pages/admin/AdminPage'));
const BrowsePage = React.lazy(() => import('./pages/BrowsePage'));

<Suspense fallback={<PageSkeleton />}>
  <Routes>
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/browse" element={<BrowsePage />} />
  </Routes>
</Suspense>
```

**Checkable standards:**
- [ ] All page-level routes use `React.lazy()` + `Suspense`
- [ ] Heavy libraries (PDF viewer, waveform) are lazy-loaded
- [ ] Admin pages are in a separate chunk (admin users are minority)
- [ ] Initial bundle < 200KB gzipped (target)

### 6.2 Lazy Loading

- [ ] Images below the fold use `loading="lazy"`
- [ ] Offscreen components defer rendering until visible (Intersection Observer)
- [ ] Modal/dialog content not rendered until opened

### 6.3 Memoization Patterns

**Use sparingly. Measure first.**

| Tool | When to Use | When NOT to Use |
|------|------------|----------------|
| `React.memo()` | Component re-renders with same props frequently | Simple/cheap components |
| `useMemo()` | Expensive computation (filtering large lists) | Simple value derivation |
| `useCallback()` | Callback passed to memoized child or dependency array | Inline handlers on native elements |

**Checkable standards:**
- [ ] No premature `React.memo` on every component (measure first)
- [ ] `useMemo`/`useCallback` used only when profiler shows unnecessary re-renders
- [ ] Expensive list filtering uses `useMemo` with proper dependency arrays
- [ ] No empty dependency arrays `[]` hiding stale closures

### 6.4 Image Optimization

- [ ] Use WebP/AVIF format where possible (70%+ smaller than JPEG)
- [ ] Responsive images with `srcset` and `sizes` attributes
- [ ] Lazy load all images except above-the-fold hero
- [ ] Set explicit `width` and `height` to prevent layout shift (CLS)
- [ ] SVG for icons (infinitely scalable, tiny file size)

---

## 7. UX Patterns for Mobile Web Apps

### 7.1 Skeleton Screens vs Spinners

| Pattern | When to Use | UX Impact |
|---------|------------|-----------|
| **Skeleton screen** | Page loads, list loads, content areas | Perceived 30-40% faster |
| **Spinner** | Button actions, short operations (< 2s) | Simple, expected |
| **Progress bar** | File uploads, known-duration tasks | Shows actual progress |
| **Inline indicator** | Saving, toggling, small updates | Non-disruptive |

**Checkable standards:**
- [ ] Full-page skeletons for route transitions
- [ ] Skeleton shape matches actual content layout
- [ ] Spinner for button actions with `disabled` state during loading
- [ ] No blank screens during data fetching

### 7.2 Pull-to-Refresh

- [ ] Disable native pull-to-refresh: `overscroll-behavior-y: contain`
- [ ] If implementing custom: visual indicator shows pull progress
- [ ] Maximum refresh rate limited (debounce, no duplicate requests)
- [ ] Available on list/browse pages, not on player/detail views

### 7.3 Infinite Scroll vs Pagination

| Pattern | Best For | Considerations |
|---------|---------|---------------|
| **Infinite scroll** | Social feeds, exploratory browsing | Hard to reach footer, accessibility issues |
| **"Load More" button** | Catalogues, search results | User controls loading, preserves scroll |
| **Pagination** | Admin tables, structured data | Predictable, accessible |

**ChoirBox recommendation:** "Load More" for browse (Dropbox folder contents are finite and structured).

**Checkable standards:**
- [ ] Infinite scroll (if used) has keyboard-accessible "load more" fallback
- [ ] Scroll position preserved when navigating back
- [ ] Loading indicator at list bottom, not blocking entire view

### 7.4 Gesture Support

**Use only standard, expected gestures:**
- Swipe left/right: navigate, delete with undo
- Pull down: refresh
- Long press: context menu / multi-select
- Pinch: zoom (PDF, images)

**Avoid custom/novel gestures** — Nielsen Norman Group found 50% accuracy with unfamiliar gestures.

**Checkable standards:**
- [ ] All gesture actions also available via button/tap (gesture is enhancement, not requirement)
- [ ] Swipe actions have visual affordance (edge peek, handle)
- [ ] Long-press actions discoverable via alternative UI (kebab menu)

### 7.5 Haptic Feedback (Vibration API)

The Vibration API (`navigator.vibrate()`) enables tactile feedback on Android.

**Limitation:** Not supported on iOS Safari (as of 2025).

**When to use:**
- Confirmation of destructive action (delete)
- Mode toggle (play/pause)
- Boundary hit (end of list)

**Checkable standards:**
- [ ] Feature-detect before using: `if ('vibrate' in navigator)`
- [ ] Short patterns only (10-50ms), never long vibrations
- [ ] Never block UI thread for haptic feedback
- [ ] Provide user setting to disable vibration

### 7.6 Safe Area Handling (Notch, Bottom Bar)

Required for modern phones with notch, dynamic island, or gesture bar.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Or for bottom navigation specifically */
.bottom-nav {
  padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
}
```

**Checkable standards:**
- [ ] `viewport-fit=cover` in meta viewport tag
- [ ] Bottom navigation accounts for `env(safe-area-inset-bottom)`
- [ ] Fixed headers account for `env(safe-area-inset-top)`
- [ ] Content not obscured by device notch or gesture bar
- [ ] Tested with iPhone (notch/dynamic island) and Android (gesture nav bar)

---

## Quick Reference: Priority for ChoirBox

Based on current codebase state, highest-impact improvements:

1. **Add spacing + typography tokens** (currently using magic pixel values)
2. **Touch target audit** (ensure 48px minimum on all interactive elements)
3. **Loading/error/empty states** for all data views
4. **Route-based code splitting** (lazy load pages)
5. **Safe area handling** (env() padding for notch devices)
6. **Focus management** on route changes
7. **aria-label on all icon buttons**
8. **Skeleton screens** for Browse page loading

---

## Sources

- [Atomic Design in React (Serif Colakel)](https://medium.com/@serifcolakel/atomic-design-in-react-and-react-native-building-scalable-ui-systems-e596892a3975)
- [Scalable Frontend with Atomic Design + Feature Slices](https://www.codewithseb.com/blog/from-components-to-systems-scalable-frontend-with-atomiec-design)
- [Compound Components Pattern (Patterns.dev)](https://www.patterns.dev/react/compound-pattern/)
- [Compound Components (Vercel Academy)](https://vercel.com/academy/shadcn-ui/compound-components-and-advanced-composition)
- [Compound Components Guide (pearpages)](https://pearpages.com/blog/2025/10/7/the-compound-component-pattern-in-react-a-complete-guide)
- [CSS Variables Guide: Design Tokens & Theming 2025](https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025)
- [Design Tokens and CSS Variables (Penpot)](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)
- [Dark Mode Implementation Guide 2025](https://medium.com/design-bootcamp/the-ultimate-guide-to-implementing-dark-mode-in-2025-bbf2938d2526)
- [Modern Web Typography 2025](https://www.frontendtools.tech/blog/modern-web-typography-techniques-2025-readability-guide)
- [Web Design Spacing Best Practices](https://www.conceptfusion.co.uk/post/web-design-spacing-and-sizing-best-practices)
- [WCAG 2.2 Complete Guide (AllAccessible)](https://www.allaccessible.org/blog/wcag-22-complete-guide-2025)
- [WCAG 2.2 Compliance Checklist 2025](https://www.allaccessible.org/blog/wcag-22-compliance-checklist-implementation-roadmap)
- [React Accessibility for WCAG-Compliant SPAs](https://www.allaccessible.org/blog/react-accessibility-best-practices-guide)
- [Mobile Accessibility Checklist (MDN)](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Mobile_accessibility_checklist)
- [Focus Management & WCAG (Accesify)](https://www.accesify.io/blog/keyboard-navigation-focus-wcag/)
- [WCAG 2.4.3 Focus Order Guide (TestParty)](https://testparty.ai/blog/wcag-2-4-3-focus-order-2025-guide)
- [Accessibility with Interactive Components (React Advanced)](https://www.infoq.com/news/2025/12/accessibility-ariakit-react/)
- [React State Management in 2025 (developerway)](https://www.developerway.com/posts/react-state-management-2025)
- [State Management in React 2026 (C# Corner)](https://www.c-sharpcorner.com/article/state-management-in-react-2026-best-practices-tools-real-world-patterns/)
- [State Management Trends: Zustand, Jotai, XState (Makers Den)](https://makersden.io/blog/react-state-management-in-2025)
- [React useOptimistic Hook (react.dev)](https://react.dev/reference/react/useOptimistic)
- [Optimistic Updates (TanStack Query)](https://tanstack.com/query/v4/docs/react/guides/optimistic-updates)
- [React Folder Structure in 5 Steps 2025 (Robin Wieruch)](https://www.robinwieruch.de/react-folder-structure/)
- [React Project Structure 2025 (Netguru)](https://www.netguru.com/blog/react-project-structure)
- [React Naming Conventions (Business Compass)](https://knowledge.businesscompassllc.com/react-naming-conventions-and-coding-standards-best-practices-for-scalable-frontend-development/)
- [Please Stop Using Barrel Files (TkDodo)](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- [75% Faster Builds by Removing Barrel Files (Atlassian)](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files)
- [React Performance Optimization 2025 (Growin)](https://www.growin.com/blog/react-performance-optimization-2025/)
- [React Performance: 15 Best Practices 2025](https://dev.to/alex_bobes/react-performance-optimization-15-best-practices-for-2025-17l9)
- [React Image Optimization 2025](https://convertertoolskit.com/blog/react-image-optimization-best-practices-for-2025)
- [PWA UX Tips 2025 (Lollypop)](https://lollypop.design/blog/2025/september/progressive-web-app-ux-tips-2025/)
- [PWA Design Tips (firt.dev)](https://firt.dev/pwa-design-tips/)
- [App Design (web.dev)](https://web.dev/learn/pwa/app-design)
- [Mobile Patterns that Break Accessibility (TestParty)](https://testparty.ai/blog/mobile-accessibility-patterns)
- [Vibration API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
- [Haptic Feedback for Web Apps (Vibration API)](https://blog.openreplay.com/haptic-feedback-for-web-apps-with-the-vibration-api/)
