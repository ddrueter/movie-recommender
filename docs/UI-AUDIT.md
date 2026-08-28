# CineHound — UI/UX Audit & Overhaul Tracker

> Living document for the brand-overhaul goal. Each round: inspect, fix, verify,
> update statuses. Categories keep the work auditable across sessions.

## Brand identity (source of truth)

- **Product:** CineHound — a "tactical" movie-recognition engine (radar / hound /
  sniff motif). Tagline: _Sniff out your next favorite film._
- **Palette (dark):** green radar `#00ff77` (primary) · orange `#ff9a3d`
  (secondary) · crimson danger `#ff3366`. Light theme flips primary/secondary:
  orange primary · green secondary.
- **Type:** Space Grotesk (headings) · Inter (body) · JetBrains Mono (data).
- **Voice:** tactical, short, confident; rating verbs: Love / Like / Meh / Dislike
  (+ Don't recommend = hide). 0–100 "% Match".
- **Radar motifs:** match gauge (circular sweep), section headers, hero FX,
  loading vignette, favicon, brand mark. Any new UI must reuse these tokens, never
  introduce ad-hoc colors/fonts.

## Legend for status

- ✅ done · 🔧 being fixed · ⬜ pending · 🎯 planned/backlog

---

## A. Interactions & behavior

| # | Issue | Status |
|---|-------|--------|
| A1 | Nav "Home" dropdown caret never rotates: CSS hooks `.nav-browse[aria-expanded="true"]` but the `aria-expanded` attribute lives on the inner button, not the wrapper div — `transform: rotate(180deg)` never matches. | ✅ |
| A2 | On coarse-pointer (touch) devices the whole card is a TMDB link: the first tap both focuses the card (reveals the poster rating buttons via `:focus-within`) **and** fires `window.open(TMDB)` — users trying to rate get hijacked to TMDB. | ✅ |
| A3 | Loading vignette film-reel loops with a visible seam: 10 slides translate −50%, but the flex `gap` makes one set ≠ half the strip, and there is no duplicated copy — a gap flashes at loop end. | ✅ |
| A4 | `useGridColumns` measures only in `useEffect` (post-paint): first paint shows a guessed column count (6), then content count jumps. Should measure as early as layout pass. | ✅ |
| A5 | Auth-gate CTAs inconsistent between tabs: Recommendations offers "Sign in with Google" + "Try Demo", History offers only "Try Demo". | ✅ |
| A6 | `toggleHeaderSearch` uses stale `searchIsOpen` closure to decide focusing the input, and the search field has no Escape-to-close. | ✅ |
| A7 | Header "Search" toggle is text-only while every other header control carries an icon; the field's ✕ close uses a raw text glyph instead of the SVG icon family. | ✅ |
| A8 | Mid-width header (≈700–1080px) with search open risks overflow/wrap jitter: search input is a fixed 280px. Needs a mid-breakpoint cap. | ✅ |
| A9 | Double-fetch on Discover and refetch-on-resize: data effects keyed on loader callbacks whose identity changes with the measured column count (page size). | ✅ |
| A10 | Browse dropdown uses `role="menu"` with buttons but no arrow-key navigation; focus is not moved into the menu when opened. (Polish.) | ✅ |

## B. Theming / tokens / consistency

| # | Issue | Status |
|---|-------|--------|
| B1 | `.section-header__radar` declares `background` twice (first value dead — replaced by the gradient). Cosmetic cleanup. | ✅ |
| B2 | Scan theme-dependent hardcoded colors: `.btn-primary` text `#06120b` (verify both themes), brand SVG `#0c0f16` chip (intentional app-icon). | ✅ |
| B3 | `@keyframes score-fade` defined but unused (`.score-pill` uses `score-count-up`). Dead keyframe. | ✅ |
| B4 | OG/Twitter image is an SVG — many scrapers ignore SVG `og:image`. Should export a PNG when branding warms up. | 🎯 |
| B5 | `--color-active/--color-negative/--color-muted` legacy aliases and `--ch-*` raw palette: verify they are all still referenced before pruning. | ✅ removed the three unused `--color-*` aliases (dark + light); `--ch-*` kept as canonical brand palette (abyss/slate still feed canvas/surface, radar/crimson/signal/amber remain for reference) |
| B6 | `.home-hero__inner` max-width 720px while lede uses `max-width: 58ch` — intentional; verify hero doesn't stray from grid alignment at ≥1600px. | ✅ reviewed — hero & FX are contained inside a max-width 1760 container so nothing detaches on ultrawide |
| B7 | Header `.brand-icon` chip hardcoded `fill:#0c0f16` while footer brand chip uses themed `var(--surface-raised)` — header stayed dark in light theme. | ✅ |

## C. Accessibility

| # | Issue | Status |
|---|-------|--------|
| C1 | `MovieCard` is `role="link"` opening a new tab — validate SR announcement "opens in new tab" is implied by the unlock message/context. | ✅ — both MovieCard & SpotlightCard aria-labels now say "(opens in a new tab)" (R2) |
| C2 | `.header-search__field` input lacks `aria-controls`/result association; results grid has `aria-label="Search results"` — acceptable, review live-region announcements. | 🎯 |
| C3 | Theme toggle announces mode change only via `aria-label` swap — no live region; confirm acceptable. | ✅ |
| C4 | Reduced-motion global override kills stagger/fade animations (`0.01ms`) — confirm no `forwards`-fill flicker (state end is fine). | ✅ reviewed |
| C5 | No "skip to content" affordance — keyboard users must tab through the sticky header + nav before reaching content. | ✅ |
| C6 | The `aria-live` region only announced when the text actually changed — setting the same announcement back-to-back was silently skipped by SRs. | ✅ |
| C7 | Tab navigation left screen-reader focus unchanged; no announcement of the destination section or focus move into content. | ✅ |

## D. Responsive / device edge cases

| # | Issue | Status |
|---|-------|--------|
| D1 | Poster rating buttons on coarse pointers become 17.5%-wide bars with rounded 12px radius while spotlight buttons stay circles — verify visual family coherence; consider same radius family. | ✅ — coarse-pointer poster buttons are now pills (999px) matching the app's pill-button language |
| D2 | `.spotlight-card` single-column ≤720px: poster is `max-width: 220px` and left-aligned in a full-width track — verify it centers nicely. | ✅ |
| D3 | Ultra-narrow ≤400px: nav pill flexes; verify caret + padding still breathe. | 🎯 |
| D4 | Very wide ≥2150px: max-width cap 1760 centers content; hero FX rings pinned near right edge (88%) may look detached on ultrawide. | ✅ reviewed — FX contained inside the capped hero container, not detached |
| D5 | Back-to-top threshold fixed at 720px scroll — fine on all pages? Verify on short pages (search with few results). | ✅ reviewed — appears only after substantial scroll, never on short pages (correct) |

## E. Copy / labels

| # | Issue | Status |
|---|-------|--------|
| E1 | "Sign in to unlock recommendations" vs "Sign in to view your ratings" gates — copy consistent with feature names ("Target Lock", "Scent Trail"). | ✅ reviewed |
| E2 | Announcements concatenate raw API errors (`Could not save rating. <raw>`) — possibly long/technical; consider sanitizing for users. | ✅ |
| E3 | `formatYear` slices first 4 chars of any string — fine for `YYYY-MM-DD`, degrades gracefully elsewhere. | ✅ reviewed |

---

## Round log

- **Round 1 (R1):** Full static audit (App.jsx 1958 lines, App.css 1764, index.css,
  lib/*). ESLint clean. Vite build blocked by sandbox (esbuild child-process pipes)
  — verification is by review. Fixes landed: A1 caret selector, A2 touch rating
  hijack, A3 vignette reel seam, A4 pre-paint column measure, A5 auth-gate CTA
  parity, A6 search toggle open-focus + Escape close, A7 search icon + SVG close
  icon, A8 mid-width input cap, A9 loader latest-ref (no more resize refetch),
  B1 duplicate background. Audit tracker created at docs/UI-AUDIT.md.
- **Round 2 (R2):** Keyboard navigation for the Browse dropdown (A10): Arrow
  up/down/left/right, Home/End, Escape-to-close + refocus trigger; ArrowDown on the
  trigger opens and focuses the first item. Extracted `--accent-ink` token for the
  CTA gradient text in both themes (B2). Removed dead `@keyframes score-fade`
  (B3). Centered the highlight poster on single-column ≤720px (D2). Added
  `friendlyError()` to humanize announcement error text across home/recs/history/
  search/rating/auth paths (E2). IM card aria-labels now announce "opens in a new
  tab" for both MovieCard and SpotlightCard (C1). ESLint clean throughout.
- **Round 3 (R3):** Theming consistency — header brand chip now uses themed
  `var(--surface-raised)` like the footer chip instead of a hardcoded dark fill
  that stayed dark in light mode (B7). Removed the three unused
  `--color-active/negative/muted` legacy aliases (B5). Theme toggle now announces
  the change via the live region for screen readers (C3). Loading state copy is
  contextual — "Searching…", "Building your recommendations…", "Loading your
  ratings…" — instead of a bare "Loading" (polish). Coarse-pointer poster rating
  buttons are now pills (999px) to match the app's pill-button language (D1).
  Reviewed-and-closed B6, D4, D5 (containers keep hero FX/back-to-top correct).
  ESLint clean throughout.
- **Round 4 (R4):** Accessibility depth. Added a "Skip to content" link (C5) that
  slides in on focus and jumps to `#main-content` (also made main focusable).
  The live region now re-announces even identical back-to-back announcements via
  a monotonic sequence key (C6). Tab navigation now announces the destination
  section and moves keyboard focus into the content area (C7). Fixed an impure
  setState-in-updater in `toggleTheme` (StrictMode double-fire). ESLint clean.