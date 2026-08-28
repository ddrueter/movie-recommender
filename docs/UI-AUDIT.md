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
| A6 | `toggleHeaderSearch` uses stale `searchIsOpen` closure to focus the input post-toggle, and the search field has no Escape-to-close. | ✅ |
| A7 | Header "Search" toggle is text-only while other header controls carry an icon; the field's ✕ close uses a raw text glyph instead of the SVG icon family. | ✅ |
| A8 | Mid-width header (≈700–1080px) with search open risks overflow/wrap jitter: search input is a fixed 280px. Needs a mid-breakpoint cap. | ✅ |
| A9 | Double-fetch on Discover and refetch-on- resize: the fetcher callbacks change identity with the measured column count (page size), re-running the data effect. | ✅ |
| A17 | Home page prefetched recommendations even though home never renders the recs grid — a wasted network call plus a spurious "Loaded N recommendations." announcement on a page that shows none. | ✅ — home/trending/popular/topRated only load home data; recommendations are fetched only when the Discover tab (browse or spotlight) is shown |
| A18 | Landing directly on `/search` with an empty query rendered a blank content area (`renderSearchBody` returned null). | ✅ — empty-query shows a friendly "Search the whole catalog" prompt instead of a blank page |
| A19 | Recommendations browse used a "Load more" button adding a full page each click; wanted column-aware loading + auto-load as you reach the end. | ✅ — browse grid now uses infinite scroll via an IntersectionObserver sentinel that appends the next column-aware page (columns × 4) as you scroll |
| A20 | Spotlight ("Your Next Pick") had a redundant section header above the single featured card, where the card itself is the focus. | ✅ — header removed; the card sits alone as the focal point |
| A21 | Recommendation diagnostics rendered prominently on the discover page during normal (non-error) use. | ✅ — diagnostics now render only when the recommendation engine errors |
| A22 | Recommendation loading vignette was a fixed 520px bordered card box. | ✅ — vignette is now a full-width, borderless ambient band that spans the content column |
| A23 | `.btn-primary` / `.btn-soft` / `.subtle-button` were three identical flat pills with no visual hierarchy. | ✅ — primary is now a solid accent fill + dark ink; soft/subtle stay outline pills (clear primary vs. secondary) |
| A24 | Single recommendation card had dead empty space at its bottom because the body didn't fill the card height. | ✅ — card `align-items: stretch` + body `height:100%`, so the rating row pins to the bottom |
| A25 | Back-to-top arrow was not centered in its fixed 46px circle — the global button padding pushed it off-center. | ✅ — `padding:0` + `line-height:0` on the bubble centers the arrow icon |
| A26 | "One at a time" label for switching the recommendations grid back to the spotlight was unclear and only rendered as a tiny subtitle-style header link, easy to miss. | ✅ — renamed to a prominent "Switch to Spotlight" pill button in the section header |
| A27 | Hover highlighting lagged under fast cursor movement — card + poster hover used slow 320ms durations and an expensive `filter` on the image, and the rating fan-out stagger was long. | ✅ — card/poster hover are now fast transform-only (120–140ms, no filter), and the rating rack fan-out uses a short 12ms stagger with no frosted blur |
| A28 | Rating reveal was anchored in the bottom-left corner; bottom-right is more pleasing. | ✅ — re-anchored to the bottom-right corner, fanning leftward |
| A29 | History had no way to sort or filter, making a long scent trail painful to navigate. | ✅ — added a sort control (recent / rating high-low / low-high / title) and rating filter chips (All / Love / Like / Meh / Dislike), with an empty state when nothing matches |
| A30 | Error state-cards (home, search, recommendations, history) showed raw server error text, while the live-region announcements used friendly messages — inconsistent. | ✅ — all four error cards now render the friendly, humanized message too |
| A31 | The solid `.btn-primary` button used the accent-colored global focus outline, which is nearly invisible against its accent fill. | ✅ — `.btn-primary:focus-visible` now uses the high-contrast `--accent-ink` outline |
| A32 | Spotlight card broken by an aggressive stretch: forcing the body `height:100%` + stretching the grid distorted the poster (broke its 2:3 aspect) and the card looked clearly wrong. | ✅ — poster is `align-self:start` (keeps its aspect); body relies on grid stretch + `margin-top:auto` for the bottom-pinned rating; no explicit height |
| A33 | The spotlight action buttons were inconsistent (one filled `btn-primary`, one outline `btn-soft`, with mismatched heights) and could render as tall/vertical pills. | ✅ — both action buttons are now the same outline `btn-soft` style with an explicit `height: 2.5rem` + horizontal-only padding, so they're a short, matched, horizontal pill pair |
| A34 | The home loading skeleton always rendered 10 cards regardless of the column count, producing a non-integer (e.g. 1.4) row. | ✅ — skeleton now renders exactly `columns × rows` cards (homeColumns × 2), always full rows |
| A35 | Full-page section (Trending/Popular/Most Acclaimed) used a centered "Loading…" card while loading — inconsistent with the home page's grid skeleton. | ✅ — now renders a matching full-row card skeleton grid |
| A36 | Mobile nav pill (≤720px) was forced full-width and left-aligned, so the pill background spanned the row with tabs hugging one side. | ✅ — mobile nav stays shrink-wrapped and centered (fit-content + centered) |
| A37 | Long section-header actions (e.g. the "Switch to Spotlight" pill) could crowd/overflow next to the title on narrow screens. | ✅ — header row wraps gracefully (flex-wrap) so the title and action stack on small widths |
| A38 | A filter that matched nothing rendered an empty grid with a state card after it (odd). | ✅ — when a filter yields nothing, show only the friendly empty state (no empty grid) |
| A39 | History "Dislike" filter also included "Hidden" (don't-recommend) — two distinct meanings lumped together. | ✅ — Dislike (=-2) and Hidden (=-1) are now separate filters |
| A40 | History sort lacked descending / Oldest options; "Oldest" had no code path so it repeated "Most recent". | ✅ — split into sort **type** (Most recent / Rating / Title / Release year) + **order** toggle; release-year sort added |
| A41 | A few recommendation cards could stretch across the whole row into oversized artworks, or auto-fill left empty trailing track space between items. | ✅ — grid uses fixed modest `--card-size` tracks (auto-fill, centered), so light content never balloons and full rows tile cleanly |
| A45 | Sorting "Oldest" did nothing (it re-used server order / same as most recent). | ✅ — fixed via the sort-type + direction split; also fixed the inverted recency comparator so the default (desc) shows most recent first |
| A42 | Loading states for search / recommendations / history were boxes (StateCard); user wants full-width loaders. | ✅ — replaced with a full-width labeled shimmer band (FullWidthLoading) |
| A43 | The recommendation loading "vignette" read as a static row of cards and could visually "end"; wanted a continuous, movie-poster carousel surface. | ✅ — now a continuous 3D wheel of real poster thumbnails orbiting a radar core (seamless, endless) |
| A46 | The rec-loading 3D wheel showed blank faces / no posters and felt uncanny against the page. | ✅ — removed the stage `overflow:hidden` that was flattening the `preserve-3d` (hiding faces), made poster imgs eager-load, and added a dark translucent backdrop so the spinning wheel reads as a carousel receding into darkness |
| A47 | On a fresh reload to Recommendations the carousel had no posters (only placeholders), because home/history data wasn't loaded yet. | ✅ — the spotlight branch now also preloads the home catalogs so the carousel has real posters even on a cold load |
| A48 | Poster faces receding to the back of the 3D wheel looked the same brightness as the front — weak depth cue. | ✅ — added a foreground "spotlight" overlay so only the face at front-center is lit and receding faces fall into shadow |
| A49 | With a short filtered history, vertical space stretched between the tab/menu bar, the page title, and the filters (instead of pooling at the bottom). | ✅ — `.app-main` is now `align-content: start` so leftover space pools only at the bottom before the footer |
| A50 | Movie cards stretched to equal row height, leaving excessive blank space inside shorter cards while the cards felt under-width. | ✅ — grid uses `align-items: start` so each card takes its natural height with no internal whitespace; card width left modest & fixed |
| A51 | On a cold reload the loading carousel still showed no posters — the home-catalog poster source raced with, and was abandoned by, the engine fetch. | ✅ — `loadSpotlightPick` now fetches home data in parallel and awaits it, so the vignette always has real posters on a cold load |
| A52 | The carousel's dark-ground-plane overlay lost visual cohesion and didn't actually darken the far-side faces. | ✅ — removed the heavy global overlay; kept a subtle edge vignette, and added per-face depth shading so faces on the far side of the wheel are gently darker |
| A53 | On narrow screens the 3D wheel's 190px radius could exceed the content width, letting poster faces bleed past the page (horizontal scroll). | ✅ — added a ≤560px override that shrinks the wheel radius + poster size to stay within the viewport |
| A44 | After the bottom-right anchor change, Love sat on the right; user want it back on the left. | ✅ — rack order restored (Love left → Don't-recommend right) while anchored bottom-right |
| A10 | Browse dropdown uses `role="menu"` with buttons but no arrow/nav key support; focus is not moved into the menu when opened. | ✅ |
| A11 | Dead unused `plus`/`minus` branches in `RatingIcon` (rating options are thumb/down, meh, heart, hide). | ✅ |
| A12 | Search input used `type="text"`; switch to `type="search"` + `enterKeyHint="search"` for mobile, hiding the native clear button we duplicate. | ✅ |
| A13 | A chosen rating was invisible without hover — the active rating button was `opacity:0` like the others. | ✅ — active rating control stays visible and interactive |
| A14 | Rating controls were spread flat across the poster bottom at a fixed slot; when a film was rated, the chosen icon sat in its lane with no relationship to the reveal. | ✅ — corner-anchored, staggered left→right fan-out with the chosen rating carried into its lane |
| A15 | Poster rating is a `radiogroup` but had no keyboard support — no arrow-key roving, no Escape; only bare tab focus. | ✅ — arrow-key roving (←/↑/→/↓, Home/End) without mutating ratings; Escape closes and returns focus to the card |
| A16 | SpotlightCard rating is also a `radiogroup` but lacked keyboard support. | ✅ — shared `radioGroupKeyDown` helper now gives the spotlight rating the same arrow-key roving / Home / End behaviour as the poster rating |

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
| C2 | `.header-search__field` input lacks `aria-controls`/result association; results grid has `aria-label="Search results"` — acceptable, review live-region announcements. | ✅ — input now has `aria-controls="search-results"` + `aria-expanded`; the results grid is a `aria-live="polite"` region so result announcements are screen-reader friendly |
| C3 | Theme toggle announces mode change only via `aria-label` swap — no live region; confirm acceptable. | ✅ |
| C4 | Reduced-motion global override kills stagger/fade animations (`0.01ms`) — confirm no `forwards`-fill flicker (state end is fine). | ✅ reviewed |
| C5 | No "skip to content" affordance — keyboard users must tab through the sticky header + nav before reaching content. | ✅ |
| C6 | The `aria-live` region only announced when the text actually changed — setting the same announcement back-to-back was silently skipped by SRs. | ✅ |
| C7 | Tab navigation left screen-reader focus unchanged; no announcement of the destination section or focus move into content. | ✅ |
| C8 | Route-change focus-move regression (from R4): typing in search navigates to `/search`, and the focus-move-to-main effect yanked focus out of the search input mid-typing. | ✅ |
| C9 | `document.title` never updated per route — stayed the generic homepage title on every tab; no help for bookmarks or SR users. | ✅ — route-aware titles (Home / Search / Recommendations / Your Ratings / Trending / Popular / Most Acclaimed) |
| A11 | Dead `plus`/`minus` rating-icon branches in `RatingIcon` — never referenced (rating options are thumb-up/down, meh, heart, hide). | ✅ |
| A12 | Search input used `type="text"`; switch to `type="search"` for semantics + mobile `Go`/`Search` keyboard, suppressing the native clear button we duplicate. | ✅ |

## D. Responsive / device edge cases

| # | Issue | Status |
|---|-------|--------|
| D1 | Poster rating buttons on coarse pointers become 17.5%-wide bars with rounded 12px radius while spotlight buttons stay circles — verify visual family coherence; consider same radius family. | ✅ — coarse-pointer poster buttons are now pills (999px) matching the app's pill-button language |
| D2 | `.spotlight-card` single-column ≤720px: poster is `max-width: 220px` and left-aligned in a full-width track — verify it centers nicely. | ✅ |
| D3 | Ultra-narrow ≤400px: nav pill flexes; verify caret + padding still breathe. | ✅ reviewed + add ≤560px tagline hide to stop header overflow on phones |
| D4 | Very wide ≥2150px: max-width cap 1760 centers content; hero FX rings pinned near right edge (88%) may look detached on ultrawide. | ✅ reviewed — FX contained inside the capped hero container, not detached |
| D5 | Back-to-top threshold fixed at 720px scroll — fine on all pages? Verify on short pages (search with few results). | ✅ reviewed — appears only after substantial scroll, never on short pages (correct) |
| D6 | Grid left a dead half-column on the right when a row had fewer items than columns (e.g. 7 movies, 7.5 columns of space, always left-aligned). | ✅ — `auto-fit` tracks stretch to `1fr` so surviving columns fill the row on every window/screen |
| D7 | Homepage vertical rhythm inconsistent: header rows hugged their grids (0.15rem gap) while sections were far apart; the reveal spacing varied. | ✅ — uniform `.section-header-row` margin (0.5rem above, 1rem below) across all pages |
| D8 | Home loading skeleton used fixed-size tracks while the real grid stretches (`auto-fit, minmax(card, 1fr)`); a layout shift spate when skeletons swapped for real cards. | ✅ — skeleton grid now matches the results grid exactly |

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
- **Round 5 (R5):** Fixed a regression from R4 (C8) — the route-change focus move
  to `<main>` stole focus from the search input mid-typing (typing pushes the
  path to `/search`); the search route now announces but skips the focus move.
  Hid the nowrap brand tagline on phones (≤560px) to stop header overflow (D3).
- **Round 6 (R6):** Removed dead `plus`/`minus` rating-icon branches (A11). The
  search input is now `type="search"` with `enterKeyHint="search"` for a better
  mobile keyboard and semantics; the native clear button is hidden since we ship
  our own (A12). ESLint clean.
- **Round 7 (R7, user feedback):** A rated movie no longer hides its rating — the
  active rating control stays visible and interactive on the poster without hover
  (A13). Grid columns now stretch to `1fr` via `auto-fit`, so a partial row never
  leaves an awkward half-column of dead space (D6). Section headers get a uniform,
  comfortable gap above & below on every page, fixing erratic header↔section
  spacing on the homepage and elsewhere (D7).
- **Round 8 (R8):** Home loading skeleton now uses the same `auto-fit,
  minmax(card, 1fr)` grid as the real result grid, so there is no layout/shift
  jump when the skeleton swaps for real movie cards (D8). ESLint clean.
- **Round 9 (R9):** The document `<title>` is now route-aware (updates to
  "Recommendations — CineHound", "Your Ratings — CineHound", etc. on each tab)
  instead of staying static on every route (C9). ESLint clean.
- **Round 10 (R10, user feedback):** Recommendations page polish — the primary
  CTA is no longer a loud green→orange gradient; it now uses the site's soft
  accent-pill language like every other button (Item 1). "Browse all {N}
  matches" is now simply "View all recommendations" — no awkward count wording
  (Item 2). Movie cards no longer reserve two full title lines, removing blank
  space at the bottom of short-titled cards and tightening overall spacing
  (Items 3–4). Header: the nav pill now shrink-wraps its items instead of
  spanning the empty middle column (Other 1). The right-side auth/theme controls
  are consolidated into one Account dropdown (trigger + theme toggle + Your
  Ratings + Sign in/out/Demo) with full keyboard nav, replacing the old separate
  theme-toggle and session chip (Other 2). ESLint clean.
- **Round 11 (R11, user feedback):** Rating-reveal choreography — a rated film's
  chosen icon now sits alone in the poster's bottom-left corner; opening the
  rating rack (hover/focus/tap) fans the four options + don't-recommend out from
  that corner to their lanes as a left→right staggered sweep. Each control drops
  into its slot / is "left behind" as the sweep passes, and the active choice is
  carried from the corner into its lane. Replaced fixed inline slot positions
  with CSS `--slot`/`--i` stagger (A14). ESLint clean.
- **Round 12 (R12):** Copy consistency — the "load more" buttons now all say
  "Loading…" (search, expanded sections, recommendations) instead of mixing
  "Processing…" and "Loading…" for the same in-flight state. ESLint clean.
- **Round 13 (R13):** The poster rating controls exposed a `radiogroup` role but
  had no keyboard support. Added arrow-key roving (←/↑/→/↓, Home/End) that moves
  focus between the rating options without mutating the rating, and Escape that
  closes the rack and returns focus to the card. Focus remains on the chosen
  control; rating is still committed by Enter/Space/click. ESLint clean.
- **Round 14 (R14):** Extracted the radiogroup roving into a shared
  `radioGroupKeyDown` helper and applied it to the SpotlightCard rating row too,
  so both rating radiogroups (poster compact + spotlight featured) offer
  identical arrow-key / Home / End keyboard support. ESLint clean.
- **Round 15 (R15):** Search a11y (C2) — the header search input now points
  `aria-controls="search-results"` (with `aria-expanded`), and the results grid
  is an `aria-live="polite"` region, so screen readers announce result updates.
  ESLint clean.
- **Round 16 (R16):** The home/trending/popular/topRated tabs no longer prefetch
  the recommendations engine — those pages never render the recs grid, so this
  was a wasted fetch plus a spurious "Loaded N recommendations." announcement
  on a page showing none (A17). Recommendations load only when the Discover tab
  is shown. ESLint clean.
- **Round 17 (R17):** Landing directly on `/search` with an empty query was a
  blank content area. It now shows a friendly "Search the whole catalog" prompt
  instead (A18). ESLint clean.
- **Round 18 (R18, user feedback):** Recommendations browse now loads via
  **infinite scroll** — an IntersectionObserver sentinel appends the next
  column-aware page (columns × 4 rows) as you reach the bottom, instead of
  requiring a "Load more" click (A19). Removed the redundant "Your Next Pick"
  header above the spotlight card (A20). Recommendation diagnostics are now
  hidden in normal use and appear only when the engine errors (A21). ESLint
  clean.
- **Round 19 (R19, user feedback):** Button hierarchy — `.btn-primary` is now a
  solid accent fill + dark ink, clearly distinct from the outline `btn-soft` /
  `subtle-button` secondary pills (A23). The single recommendation card fills
  its own height so the rating row pins to the bottom — no dead empty pad
  inside (A24). The recommendation loading vignette is now a full-width,
  borderless ambient band instead of a fixed 520px card (A22). ESLint
  clean.
- **Round 20 (R20, user feedback):** Fixed the back-to-top arrow being off-center
  in its circle (was the global button padding; now `padding:0`, A25).
  Renamed the unclear "One at a time" switch label to a prominent **"Switch to
  Spotlight"** pill button so it reads as a real control, not a footnote
  (A26). ESLint clean.
- **Round 21 (R21, user feedback):** Performance — hover feedback is now fast
  and GPU-cheap (transform-only, 120–140ms, no per-frame filter) so it no
  longer lags under quick cursor movement (A27). The rating reveal is
  re-anchored to the **bottom-right corner** and fans leftward with a snappier
  short stagger and no frosted-blur cost (A27/A28). **History is now sortable
  and filterable** — sort by recent / rating / title and filter chips for
  All / Love / Like / Meh / Dislike, with an empty state (A29). ESLint clean.
- **Round 22b (R22):** Consistency — the four error state-cards (home, search,
  recommendations, history) now render the friendly humanized message like the
  live-region announcements already did, instead of raw server text (A30).
  ESLint clean.
- **Round 24b (R24, user feedback):** Fixed a regression that broke the
  spotlight recommendation card — the previous round's aggressive
  `align-items:stretch` + body `height:100%` distorted the poster (broke its
  2:3 aspect). The poster is now `align-self:start` (keeps its natural aspect),
  and the body fills via grid stretch with the rating `margin-top:auto` pinned
  to the bottom (A32). The two action buttons were inconsistent (filled
  `btn-primary` vs outline `btn-soft`, unequal height) — both now use the same
  soft pill style with equal `min-height` (A33). ESLint clean.
- **Round 25 (R25, user feedback):** The home loading skeleton always rendered
  10 cards regardless of columns, producing a partial (1.4) row. It now renders
  exactly `columns × 2` cards (homeColumns × homeRows) so it's always full rows
  (A34). ESLint clean.
- **Round 26 (R26):** The full-page Trending/Popular/Most Acclaimed loading
  state used a centered "Loading…" card, inconsistent with the home page's grid
  skeleton; it now shows a matching full-row card skeleton grid (A35). ESLint
  clean.
- **Round 27 (R27):** On mobile (≤720px) the nav pill was forced full-width and
  left-aligned, so its background spanned the whole row. It now stays
  shrink-wrapped and centered (A36). ESLint clean.
- **Round 28 (R28):** Section-header rows now wrap gracefully on narrow screens
  so a title and its action pill (e.g. "Switch to Spotlight") stack instead of
  crowding/overflowing (A37). ESLint clean.
- **Round 29 (R29):** When a history filter matched nothing, the page rendered
  an empty grid plus an empty-state card below; it now shows only the friendly
  empty state (no stray empty grid) (A38). ESLint clean.
- **Round 30 (R30, user feedback):** History "Dislike" now excludes "Hidden";
  added a separate Hidden filter plus Oldest / Title (Z–A) sort options (A39,
  A40). Cards are bounded by a finite `--card-max` so a few results never
  balloon (A41). Search / recommendations / history loading states are now
  full-width shimmer bands, not boxes (A42). The recommendation loading
  vignette is a continuous 3D wheel of real poster thumbnails orbiting a radar
  core — seamless and endless — instead of a static flat line (A43). The
  open rating rack restored Love to the left (A44). ESLint clean.
- **Round 31 (R31):** Fixed a card grid regression that the prior `auto-fit` /
  `min(1fr, card)` formula caused — every row collapsed to one oversized card.
  Replaced with `auto-fill, minmax(card-size, 1fr)` so full rows show several
  normal equal cards without ballooning; the home skeleton matches. The
  spotlight action buttons ("Show me another" / "View all recommendations") are
  - **Round 31 (R31):** Fixed a card grid regression that the prior `auto-fit` /
  `min(1fr, card)` formula caused — every row collapsed to one oversized card.
  Replaced with `auto-fill, minmax(card-size, 1fr)` so full rows show several
  normal equal cards without ballooning; the home skeleton matches. The
  spotlight action buttons ("Show me another" / "View all recommendations") are
  now a matched pair of compact outline pills — both `btn-soft` with an explicit
  `height: 2.5rem` + horizontal-only padding (A33). ESLint clean.
- **Round 32 (R32, user feedback):** History sorting became a clean two-control
  split — a sort **type** (Most recent / Rating / Title / Release year, adding a
  release-year sort) plus an **order** toggle (Newest↓ / Oldest↑). This fixes
  "Oldest" silently doing nothing (it previously had no code path) (A40/A45).
  The results grid now uses `auto-fit` + a capped `--card-max`, so when a filter
  leaves few movies the cards collapse to bounded tracks with no ballooning and
  no empty trailing-track dead space between items (A41). ESLint clean.
- **Round 35 (R35, user feedback):** The loading carousel now gets real posters on
  a fresh page reload — the spotlight branch also preloads the home catalogs, so
  a cold load to Recommendations isn't left with placeholder slabs (A47). Added a
  foreground "spotlight-lighting" overlay over the 3D wheel so the face passing
  front-center is lit and the receding back faces fall darker — a much stronger
  depth cue (A48). ESLint clean.
- **Round 36 (R36):** Cleanup — removed a leftover unused `--card-max` on the
  search grid. ESLint clean.
- **Round 37 (R37, user feedback):** Short pages (e.g. filtered history with few
  movies) were stretching vertical space between the header, title, and filters;
  `.app-main` is now `align-content: start` so leftover space pools at the
  bottom before the footer (A49). Movie cards no longer stretch to equal row
  height (`align-items: start`), removing the blank space inside shorter cards
  (A50). The formatted action buttons below were left untouched. ESLint clean.
- **Round 38 (R38, user feedback):** Cold-reload posters — `loadSpotlightPick`
  now fetches home data in parallel and awaits it so the carousel always has real
  posters instead of placeholder slabs (A51). Removed the heavy global overlay
  that broke page cohesion and added subtle per-face depth shading so the far
  side of the wheel is gently darker (A52). ESLint clean.
- **Round 39 (R39):** Narrow-screen polish — the 3D wheel's 190px radius could
  overflow a phone's content width (horizontal bleed/scroll); a ≤560px override
  now shrinks the wheel radius and poster size to stay within the viewport (A53).
  ESLint clean.
- **Round 33 (R33, user feedback):** The recommendations 3D loading wheel was
  showing blank faces and looked uncanny. Removed the stage `overflow:hidden`
  that was flattening the wheel's `preserve-3d` (which hid the poster faces),
  made the carousel poster images eager-load instead of lazy (so they decode
  inside the animated 3D element), and added a dark translucent ground plane so
  the spinning posters read as a carousel receding into darkness (A46). ESLint
  clean.
- **Round 34 (R34, user feedback):** History sort direction buttons relabeled to
  "Descending ↓" / "Ascending ↑" (no more context-specific "Newest/Oldest"); the
  sort `select` is now styled as a pill like the site's other dropdowns. Fixed
  the inverted recency comparator so the default (descending) actually shows
  **most recent first** — it had silently shown oldest first. Cards are back to
  fixed modest `--card-size` tracks (auto-fill, centered), so home/history rows
  no longer balloon into huge cards (A40/A41/A45). ESLint clean.