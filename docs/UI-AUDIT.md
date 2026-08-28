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
| B5 | `--color-active/--color-negative/--color-muted` legacy aliases and `--ch-*` raw palette: verify they are all still referenced before pruning. | 🎯 |
| B6 | `.home-hero__inner` max-width 720px while lede uses `max-width: 58ch` — intentional; verify hero doesn't stray from grid alignment at ≥1600px. | 🎯 |

## C. Accessibility

| # | Issue | Status |
|---|-------|--------|
| C1 | `MovieCard` is `role="link"` opening a new tab — validate SR announcement "opens in new tab" is implied by the unlock message/context. Consider `aria-describedby` hint. | 🎯 |
| C2 | `.header-search__field` input lacks `aria-controls`/result association; results grid has `aria-label="Search results"` — acceptable, review live-region announcements. | 🎯 |
| C3 | Theme toggle announces mode change only via `aria-label` swap — no live region; confirm acceptable. | 🎯 |
| C4 | Reduced-motion global override kills stagger/fade animations (`0.01ms`) — confirm no `forwards`-fill flicker (state end is fine). | ✅ reviewed |

## D. Responsive / device edge cases

| # | Issue | Status |
|---|-------|--------|
| D1 | Poster rating buttons on coarse pointers become 17.5%-wide bars with rounded 12px radius while spotlight buttons stay circles — verify visual family coherence; consider same radius family. | 🎯 |
| D2 | `.spotlight-card` single-column ≤720px: poster is `max-width: 220px` and left-aligned in a full-width track — verify it centers nicely. | ✅ |
| D3 | Ultra-narrow ≤400px: nav pill flexes; verify caret + padding still breathe. | 🎯 |
| D4 | Very wide ≥2150px: max-width cap 1760 centers content; hero FX rings pinned near right edge (88%) may look detached on ultrawide. | 🎯 |
| D5 | Back-to-top threshold fixed at 720px scroll — fine on all pages? Verify on short pages (search with few results). | 🎯 |

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