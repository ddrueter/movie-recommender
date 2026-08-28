import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import {
  formatRatingValue,
  getCommunityTone,
  formatMatchScore,
  ratingOptions,
} from './lib/ratingMap';
import {
  fetchHomeData,
  fetchRecommendations,
  fetchUserRatings,
  saveRating,
  searchMovies,
} from './lib/api';
import {
  getDemoSession,
  onAuthStateChanged,
  signInWithFirebasePopup,
  signOutFirebase,
} from './lib/auth';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const SEARCH_INITIAL_RESULT_COUNT = 24;

// User-facing fallbacks for common API failures. Raw server error text can be
// long and technical; announcements should stay short and actionable.
const ERROR_HINTS = {
  'too many requests': 'The server is busy right now. Please try again in a moment.',
  timeout: 'The request timed out. Please check your connection and try again.',
  'failed to fetch': 'Network error — please check your connection.',
  network: 'Network error — please check your connection and try again.',
  'not signed in': 'Please sign in to continue.',
  unauthorized: 'Your session expired. Please sign back in.',
  401: 'Your session expired. Please sign back in.',
  403: "You don't have permission to do that.",
  404: "That wasn't found — it may have moved.",
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'The server hit an error. Please try again shortly.',
};

function friendlyError(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return 'Something went wrong. Please try again.';
  const lower = text.toLowerCase();
  const numbered = lower.match(/\b(4\d\d|5\d\d)\b/)?.[1];
  const key = numbered || Object.keys(ERROR_HINTS).find((k) => lower.includes(k));
  return ERROR_HINTS[key] || text;
}

// Touch/tablet pointers have no hover to reveal the poster rating controls —
// the first tap on the poster must reveal them instead of navigating away.
const COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
    : false;

function RatingIcon({ kind }) {
  switch (kind) {
    case 'thumb-up':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10v11" />
          <path d="M15 5.9 14 10h6a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.6 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 3a3.13 3.13 0 0 1 3 2.9Z" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z" />
        </svg>
      );
    case 'thumb-down':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V3" />
          <path d="M9 18.1 10 14H5a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 7.4 2h12.6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 21a3.13 3.13 0 0 1-3-2.9Z" />
        </svg>
      );
    case 'meh':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.8" />
          <circle cx="8.9" cy="10.6" r="1" fill="currentColor" stroke="none" />
          <circle cx="15.1" cy="10.6" r="1" fill="currentColor" stroke="none" />
          <path d="M9.2 15.2h5.6" />
        </svg>
      );
    case 'hide':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.2" />
          <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
        </svg>
      );
    default:
      return null;
  }
}

function formatYear(value) {
  if (!value) return 'Unknown year';
  const text = String(value);
  return text.length >= 4 ? text.slice(0, 4) : text;
}

/**
 * Radar-style match gauge. Presentational only.
 * The accent arc sweeps to the match percentage on a circular radar track.
 */
function MatchGauge({ score, label }) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const r = 20;
  const tone = clamped >= 75 ? 'high' : clamped >= 50 ? 'medium' : 'low';
  const total = 100;

  return (
    <div className={`match-gauge match-gauge--${tone}`} role="img" aria-label={`${label || 'Match'}: ${clamped}%`} title={`${clamped}% match`}>
      <svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true" focusable="false">
        <circle
          className="match-gauge__track"
          cx="24"
          cy="24"
          r={r}
          pathLength={total}
          strokeDasharray={`${total} ${total}`}
        />
        <circle
          className="match-gauge__arc"
          cx="24"
          cy="24"
          r={r}
          pathLength={total}
          strokeDasharray={`${clamped} ${total}`}
        />
      </svg>
      <span className="match-gauge__value">
        {clamped}%
        <small>match</small>
      </span>
    </div>
  );
}

/**
 * Themed fallback shown when a poster image is unavailable.
 */
function PosterFallback({ title }) {
  return (
    <div className="poster-fallback" role="img" aria-label={`${title} poster unavailable`}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="M3 9h18" />
        <path d="M8 4l1.5 5" />
        <path d="M16 4l-1.5 5" />
        <path d="M8 9l3 4" />
        <path d="M16 9l-3 4" />
      </svg>
      <span>No poster</span>
    </div>
  );
}

/**
 * Radiogroup keyboard support shared by the poster and spotlight rating rows.
 * Arrow keys rove focus between options, Home/End jump, and the currently
 * focused option is where Enter/Space/click commits. Options are queried within
 * the same radiogroup as the focused radio.
 */
function radioGroupKeyDown(event) {
  const radios = Array.from(
    event.currentTarget.parentElement.querySelectorAll('[role="radio"]:not([disabled])'),
  );
  if (radios.length === 0) return;

  let nextIndex = -1;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (radios.indexOf(event.currentTarget) - 1 + radios.length) % radios.length;
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (radios.indexOf(event.currentTarget) + 1) % radios.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = radios.length - 1;
  }

  if (nextIndex >= 0) {
    event.preventDefault();
    radios[nextIndex].focus();
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getMovieKey(movie) {
  const key = movie?.tmdb_id ?? movie?.id ?? null;
  return key == null ? null : String(key);
}

function makePosterUrl(posterPath) {
  return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
}

function getSearchScore(movie, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const searchFields = [normalizeText(movie?.title), normalizeText(movie?.original_title ?? movie?.title)].filter(Boolean);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  let bestScore = 0;

  for (const field of searchFields) {
    const words = field.split(' ').filter(Boolean);
    let score = 0;

    if (field === normalizedQuery) score += 5000;
    if (field.startsWith(normalizedQuery)) score += 2400;
    if (words.some((word) => word === normalizedQuery)) score += 1800;
    if (words.some((word) => word.startsWith(normalizedQuery))) score += 1200;
    if (field.includes(` ${normalizedQuery}`)) score += 900;
    if (field.includes(normalizedQuery)) score += 500;
    if (normalizedQuery.length <= 2 && field.startsWith(normalizedQuery)) score += 300;

    if (tokens.length > 1) {
      const matchedTokens = tokens.filter((token) => words.some((word) => word.includes(token))).length;
      score += matchedTokens * 350;

      if (matchedTokens === tokens.length) {
        score += 450;
      }
    }

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function getEngagementScore(movie) {
  const popularity = Math.max(0, Number(movie?.popularity ?? 0));
  const voteAverage = Math.max(0, Number(movie?.vote_average ?? 0));
  const voteCount = Math.max(0, Number(movie?.vote_count ?? 0));

  return Math.log1p(voteCount) * 220 + Math.log1p(popularity) * 120 + voteAverage * 40;
}

function sortSearchResults(results, query) {
  return [...results].sort((a, b) => {
    const relevanceDiff = getSearchScore(b, query) - getSearchScore(a, query);
    if (relevanceDiff !== 0) return relevanceDiff;

    const engagementDiff = getEngagementScore(b) - getEngagementScore(a);
    if (engagementDiff !== 0) return engagementDiff;

    const voteAverageDiff = Number(b?.vote_average ?? 0) - Number(a?.vote_average ?? 0);
    if (voteAverageDiff !== 0) return voteAverageDiff;

    return String(a?.title ?? '').localeCompare(String(b?.title ?? ''));
  });
}

function mergeUniqueMovies(existing, incoming) {
  const seen = new Set(existing.map((movie) => getMovieKey(movie)).filter(Boolean));
  const merged = [...existing];

  for (const movie of incoming) {
    const key = getMovieKey(movie);
    if (key && seen.has(key)) {
      continue;
    }

    if (key) {
      seen.add(key);
    }

    merged.push(movie);
  }

  return merged;
}

function MovieCard({
  movie,
  mode,
  selected,
  badgeText,
  badgeTone = 'nr',
  ratingValue,
  authEnabled,
  savingRating,
  expandedRatingMovieId,
  onRate,
  onCloseRating,
}) {
  const movieKey = getMovieKey(movie);
  const posterUrl = movie.poster_url || makePosterUrl(movie.poster_path);
  const ratingPanelId = movieKey ? `rating-panel-${movieKey}` : `rating-panel-${movie.title}`;
  const isRatingOpen = expandedRatingMovieId === movieKey;
  // Track focus-within so rating buttons are keyboard-reachable only while this
  // card (or one of its children) has focus — keeps the tab order tidy.
  const [panelFocused, setPanelFocused] = useState(false);

  const tmdbUrl = movie.tmdb_id ? `https://www.themoviedb.org/movie/${movie.tmdb_id}` : null;

  const handleCardClick = (event) => {
    // Don't navigate if the click was on a rating button or its children
    if (event.target.closest('.poster-rating__option')) return;
    // On touch devices the rating controls appear only after the card takes
    // focus, so a tap on the poster must reveal them — not open TMDB. The
    // poster is the rating surface; the title row below still opens TMDB.
    if (COARSE_POINTER && event.target.closest('.poster')) return;
    if (tmdbUrl) {
      window.open(tmdbUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Radiogroup keyboard support: roving arrow keys plus Escape to close the rack
  // and return focus to the card. (Shared roving logic lives in radioGroupKeyDown.)
  const handleRatingKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCloseRating(movieKey);
      event.currentTarget.closest('.movie-card')?.focus();
      return;
    }
    radioGroupKeyDown(event);
  };

  return (
    <article
      className={[
        'movie-card',
        'target-card',
        `movie-card--${mode}`,
        selected ? 'movie-card--selected' : '',
        isRatingOpen ? 'movie-card--rating-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="link"
      tabIndex={0}
      aria-label={`View ${movie.title} on TMDB (opens in a new tab)`}
      onClick={handleCardClick}
      onFocus={() => setPanelFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPanelFocused(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Let the rating buttons handle their own Enter/Space activation.
        if (event.target.closest('.poster-rating__option')) return;
        event.preventDefault();
        handleCardClick(event);
      }}
    >
      <div className="poster">
        <div className="poster-media">
          {posterUrl ? (
            <img src={posterUrl} alt={`${movie.title} poster`} loading="lazy" decoding="async" />
          ) : (
            <PosterFallback title={movie.title} />
          )}
        </div>

        {authEnabled ? (
          <div
            className={[
              'poster-rating',
              isRatingOpen ? 'is-open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                onCloseRating(movieKey);
              }
            }}
          >
            <div className="poster-rating__menu" id={ratingPanelId} role="radiogroup" aria-orientation="horizontal" aria-label={`Rate ${movie.title}`}>
              {/* Rating options: Love → Like → Meh → Dislike left to right */}
              {/* Click active rating to clear it (toggle behavior) */}
              {ratingOptions.slice().reverse().map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  className={[
                    'poster-rating__option',
                    ratingValue === option.value ? 'active' : '',
                    `poster-rating__option--${option.label.toLowerCase()}`,
                  ].filter(Boolean).join(' ')}
                  style={{ ['--i']: index }}
                  aria-checked={ratingValue === option.value}
                  aria-label={option.label}
                  disabled={savingRating}
                  tabIndex={panelFocused || isRatingOpen ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    // Toggle: if already selected, clear the rating
                    if (ratingValue === option.value) {
                      onRate(movie, null);
                      onCloseRating(movieKey);
                    } else {
                      onRate(movie, option.value);
                    }
                  }}
                  onKeyDown={handleRatingKeyDown}
                >
                  <RatingIcon kind={option.icon} />
                  <span className="sr-only">{option.label}</span>
                </button>
              ))}

              {/* Don't recommend this button — far right */}
              <button
                type="button"
                role="radio"
                className={[
                  'poster-rating__option',
                  'poster-rating__option--hide',
                  ratingValue === -1 ? 'active' : '',
                ].filter(Boolean).join(' ')}
                style={{ ['--i']: 4 }}
                aria-label={`Don't recommend ${movie.title}`}
                aria-checked={ratingValue === -1}
                disabled={savingRating}
                tabIndex={panelFocused || isRatingOpen ? 0 : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  // Toggle: if already hidden, clear it; otherwise hide
                  if (ratingValue === -1) {
                    onRate(movie, null);
                  } else {
                    onRate(movie, -1);
                  }
                  onCloseRating(movieKey);
                }}
                onKeyDown={handleRatingKeyDown}
              >
                <RatingIcon kind="hide" />
                <span className="sr-only">Don't recommend</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="movie-meta">
        <div className="movie-title-row">
          <div>
            <h3>{movie.title}</h3>
            <p>{formatYear(movie.year || movie.release_date)}</p>
          </div>
          {badgeText ? <span className={`score-pill score-pill--${badgeTone}`}>{badgeText}</span> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Loading skeleton for the home page — placeholder hero + shimmering
 * poster cards shown while data streams in. Presentational only.
 */
function HomeSkeleton({ columns = 6, rows = 2 } = {}) {
  const count = Math.max(1, Math.round(columns)) * Math.max(1, Math.round(rows));
  return (
    <div className="home-skeleton" aria-hidden="true">
      <div className="home-skeleton__hero" />
      <div className="home-skeleton__grid">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="home-skeleton__card" />
        ))}
      </div>
    </div>
  );
}

function StateCard({ title, message, tone = 'neutral', children }) {
  return (
    <div className={`state-card state-card--${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {children}
    </div>
  );
}

function SectionHeader({ title, onViewMore, viewMoreLabel, viewMoreVariant = 'link' }) {
  return (
    <div className="section-header-row">
      <h2 className="section-header">
        <span className="section-header__radar" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" focusable="false">
            <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
            <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.4" />
            <line x1="12" y1="12" x2="12" y2="2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="2.8" r="1.7" fill="currentColor" />
          </svg>
        </span>
        {title}
      </h2>
      {onViewMore ? (
        <button
          type="button"
          className={
            viewMoreVariant === 'pill'
              ? 'section-header__action view-more-link view-more-link--pill'
              : 'view-more-link'
          }
          onClick={onViewMore}
        >
          {viewMoreLabel || 'View all →'}
        </button>
      ) : null}
    </div>
  );
}

function SpotlightCard({ movie, ratingValue, authEnabled, savingRating, onRate }) {
  const posterUrl = movie.poster_url || makePosterUrl(movie.poster_path);
  const tmdbUrl = movie.tmdb_id ? 'https://www.themoviedb.org/movie/' + movie.tmdb_id : null;

  const metaParts = [
    movie.genres && movie.genres.length ? movie.genres.join(', ') : null,
    movie.directors && movie.directors.length ? 'Directed by ' + movie.directors.join(', ') : null,
  ].filter(Boolean);

  const cast = movie.actors && movie.actors.length ? movie.actors.slice(0, 4).join(', ') : null;

  return (
    <article className="spotlight-card target-card">
      {posterUrl ? (
        <div className="spotlight-card__backdrop" aria-hidden="true">
          <img src={posterUrl} alt="" loading="lazy" decoding="async" />
        </div>
      ) : null}
      <a
        className="spotlight-card__poster"
        href={tmdbUrl || undefined}
        target={tmdbUrl ? '_blank' : undefined}
        rel={tmdbUrl ? 'noopener noreferrer' : undefined}
        aria-label={'View ' + movie.title + ' on TMDB (opens in a new tab)'}
      >
        {posterUrl ? (
          <img src={posterUrl} alt={movie.title + ' poster'} loading="lazy" decoding="async" />
        ) : (
          <PosterFallback title={movie.title} />
        )}
      </a>

      <div className="spotlight-card__body">
        <div className="spotlight-card__header">
          <div>
            <h3 className="spotlight-card__title">{movie.title}</h3>
            <p className="spotlight-card__year">{formatYear(movie.year || movie.release_date)}</p>
          </div>
          <MatchGauge score={movie.score} label="Match" />
        </div>

        {movie.overview ? <p className="spotlight-card__overview">{movie.overview}</p> : null}

        {metaParts.length > 0 ? <p className="spotlight-card__meta">{metaParts.join(' · ')}</p> : null}
        {cast ? <p className="spotlight-card__cast">Starring {cast}</p> : null}

        {authEnabled ? (
          <div className="spotlight-card__rating" role="radiogroup" aria-orientation="horizontal" aria-label={'Rate ' + movie.title}>
            {ratingOptions.slice().reverse().map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                className={[
                  'spotlight-rating__option',
                  'spotlight-rating__option--' + option.label.toLowerCase(),
                  ratingValue === option.value ? 'active' : '',
                ].filter(Boolean).join(' ')}
                aria-checked={ratingValue === option.value}
                aria-label={option.label}
                disabled={savingRating}
                onKeyDown={radioGroupKeyDown}
                onClick={() => onRate(movie, ratingValue === option.value ? null : option.value)}
              >
                <RatingIcon kind={option.icon} />
                <span className="sr-only">{option.label}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              className={[
                'spotlight-rating__option',
                'spotlight-rating__option--hide',
                ratingValue === -1 ? 'active' : '',
              ].filter(Boolean).join(' ')}
              aria-label={"Don't recommend " + movie.title}
              aria-checked={ratingValue === -1}
              disabled={savingRating}
              onKeyDown={radioGroupKeyDown}
              onClick={() => onRate(movie, ratingValue === -1 ? null : -1)}
            >
              <RatingIcon kind="hide" />
              <span className="sr-only">Don't recommend</span>
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Animated loading vignette shown while the engine picks your next film.
 * Purely presentational — a film-reel of stylized poster slides scrolls past
 * a sweeping radar ping so wait time feels intentional.
 */
function RecommendationVignette() {
  return (
    <div className="rec-vignette" role="status" aria-live="polite" aria-label="Generating your recommendation">
      <div className="rec-vignette__stage" aria-hidden="true">
        <div className="rec-vignette__reel">
          {/* Two identical copies so the -50% scroll loop is seamless. */}
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="rec-vignette__slide" style={{ ['--i']: i % 10 }} />
          ))}
        </div>
        <div className="rec-vignette__sweep" />
        <div className="rec-vignette__core">
          <svg viewBox="0 0 64 64" width="36" height="36">
            <circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.7" />
            <circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
            <line x1="32" y1="32" x2="32" y2="11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="32" cy="11" r="3" fill="currentColor" />
          </svg>
        </div>
      </div>
      <p className="rec-vignette__label">Sniffing out your next film…</p>
    </div>
  );
}

/**
 * Hook: measure a grid container's width and return how many card columns fit.
 * Card min-width for home grids is ~160px (from CSS --card-size clamp).
 */
function useGridColumns(containerRef, selector = '.results-grid--home') {
  const [columns, setColumns] = useState(6);
  const [gridObserved, setGridObserved] = useState(false);

  const readColumns = useCallback(() => {
    const grid = document.querySelector(selector);
    if (!grid) return null;
    const style = getComputedStyle(grid);
    const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
    return cols > 0 ? cols : null;
  }, [selector]);

  // Measure before paint so the very first frame already slices the right
  // number of movies per section instead of guessing 6, then correcting.
  // Once a grid is observed the layout pass bails out immediately and the
  // Resize/Mutation observers below keep the count in sync.
  useLayoutEffect(() => {
    if (gridObserved) return;
    const cols = readColumns();
    if (cols != null) {
      setColumns(cols);
      setGridObserved(true);
    }
  }, [gridObserved, readColumns]);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      const cols = readColumns();
      if (cols != null) {
        setColumns(cols);
        setGridObserved(true);
      }
    };

    // Coalesce bursts of DOM/resize events into one measurement per frame.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();

    const el = containerRef.current;
    const resizeObserver = el ? new ResizeObserver(schedule) : null;
    const mutationObserver = el ? new MutationObserver(schedule) : null;

    if (resizeObserver) resizeObserver.observe(el);
    if (mutationObserver) mutationObserver.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [containerRef, readColumns]);

  return columns;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive active tab from URL path
  const activeTab = location.pathname === '/recommendations' ? 'discover'
    : location.pathname === '/history' ? 'history'
    : location.pathname === '/trending' ? 'trending-full'
    : location.pathname === '/popular' ? 'popular-full'
    : location.pathname === '/most-acclaimed' ? 'topRated-full'
    : location.pathname === '/search' ? 'search'
    : 'home';

  const setActiveTab = useCallback((tab) => {
    const path = tab === 'discover' ? '/recommendations'
      : tab === 'history' ? '/history'
      : tab === 'trending-full' ? '/trending'
      : tab === 'popular-full' ? '/popular'
      : tab === 'topRated-full' ? '/most-acclaimed'
      : '/';
    navigate(path);
  }, [navigate]);

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('cinehound-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      // First visit: respect the OS color-scheme preference
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [searchIsOpen, setSearchIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [draftRatings, setDraftRatings] = useState({});
  const [authSession, setAuthSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recsOffset, setRecsOffset] = useState(0);
  const [recsTotalAvailable, setRecsTotalAvailable] = useState(0);
  const [recommendationState, setRecommendationState] = useState({ status: 'idle', message: '', error: '', debug: null });
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recsViewMode, setRecsViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('cinehound-recs-view');
      return saved === 'browse' ? 'browse' : 'spotlight';
    } catch {
      return 'spotlight';
    }
  });
  const [spotlightPick, setSpotlightPick] = useState(null);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [homeData, setHomeData] = useState(null);
  const [homeDataLoading, setHomeDataLoading] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [userRatingsHistory, setUserRatingsHistory] = useState([]);
  const [userRatingsLoading, setUserRatingsLoading] = useState(false);
  const [userRatingsError, setUserRatingsError] = useState('');
  const [historySort, setHistorySort] = useState('recent');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [savingRatingMovieId, setSavingRatingMovieId] = useState(null);
  const [expandedRatingMovieId, setExpandedRatingMovieId] = useState(null);
  const [expandedSectionData, setExpandedSectionData] = useState(null);
  const [expandedSectionLoading, setExpandedSectionLoading] = useState(false);
  const [expandedHasMore, setExpandedHasMore] = useState(true);
  const [announcement, setAnnouncementRaw] = useState({ text: '', seq: 0 });
  const announceSeq = useRef(0);
  // Wrap the setter so the live region re-announces even when the same text
  // is set back-to-back (identical text alone wouldn't remount the node).
  const setAnnouncement = useCallback((text) => {
    announceSeq.current += 1;
    setAnnouncementRaw({ text, seq: announceSeq.current });
  }, []);
  const [showBackTop, setShowBackTop] = useState(false);
  const [heroVisible, setHeroVisible] = useState(() => {
    try { return localStorage.getItem('cinehound-hero-hidden') !== '1'; } catch { return true; }
  });
  const [browseOpen, setBrowseOpen] = useState(false);
  const browseRef = useRef(null);
  const browseMenuItemsRef = useRef([]);
  const browseCloseTimer = useRef(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const accountMenuItemsRef = useRef([]);
  const searchTimer = useRef(null);
  const searchSequence = useRef(0);
  const recommendationsSequence = useRef(0);
  const recsInflightRef = useRef(false);
  const homeSequence = useRef(0);
  const searchInputRef = useRef(null);
  const recsOffsetRef = useRef(0);
  const recsSentinelRef = useRef(null);
  const mainElRef = useRef(null);

  // Measured grid column counts. Declared before the callbacks that use them.
  const homeColumns = useGridColumns(mainElRef);
  const discoverColumns = useGridColumns(mainElRef, '.results-grid--discover');
  const homeRows = 2; // compact: 2 rows per section on home page
  // Browse page step = full rows of the visible grid (never leaves a short row).
  const recsPageSize = Math.max(4, discoverColumns) * 4;

  const authToken = authSession?.token ?? '';
  const authLabel = authSession?.label ?? authSession?.email ?? authSession?.uid ?? '';
  const authEnabled = Boolean(authToken);
  const searchHasMore = searchPage > 0 && searchPage < searchTotalPages;
  const hasSearchResults = searchResults.length > 0;
  const hasRecommendations = recommendations.length > 0;
  const recsHasMore = recsOffset + recsPageSize < recsTotalAvailable;

  // Persistent auth: Firebase onAuthStateChanged survives page refreshes
  useEffect(() => {
    let unsubscribe;
    let mounted = true;

    onAuthStateChanged((session) => {
      if (!mounted) return;
      setAuthSession(session);
    }).then((unsub) => {
      if (mounted) unsubscribe = unsub;
      else unsub?.();
    }).catch(() => {});

    return () => {
      mounted = false;
      unsubscribe?.();
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, []);

  // Sync theme to <html> data attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('cinehound-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // Persist the recommendation view-mode preference across sessions
  useEffect(() => {
    try { localStorage.setItem('cinehound-recs-view', recsViewMode); } catch { /* ignore */ }
  }, [recsViewMode]);

  // Reveal a back-to-top control once the page scrolls substantially
  useEffect(() => {
    const onScroll = () => {
      setShowBackTop(window.scrollY > 720);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const scrollToTop = () => {
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  const dismissHero = () => {
    setHeroVisible(false);
    try { localStorage.setItem('cinehound-hero-hidden', '1'); } catch { /* ignore */ }
  };

  // Close the Browse menu on outside click or Escape
  useEffect(() => {
    if (!browseOpen) {
      browseMenuItemsRef.current = [];
      return undefined;
    }
    const onDoc = (event) => {
      if (browseRef.current && !browseRef.current.contains(event.target)) {
        if (browseCloseTimer.current) clearTimeout(browseCloseTimer.current);
        setBrowseOpen(false);
      }
    };
    const onKey = (event) => { if (event.key === 'Escape') setBrowseOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      if (browseCloseTimer.current) clearTimeout(browseCloseTimer.current);
    };
  }, [browseOpen]);

  // When opened via keyboard, focus the first menu item so arrow keys work
  // immediately (pointer users can just click the item they want).
  useEffect(() => {
    if (!browseOpen) return;
    const wasKeyboard = browseRef.current?.matches(':focus-within');
    const first = browseMenuItemsRef.current[0];
    if (wasKeyboard && first) {
      const handle = requestAnimationFrame(() => first.focus());
      return () => cancelAnimationFrame(handle);
    }
  }, [browseOpen]);

  // Account / profile dropdown: close on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) {
      accountMenuItemsRef.current = [];
      return undefined;
    }
    const onDoc = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  // Account menu keyboard nav: arrow keys cycle, Home/End jump. Only auto-focus
  // the first item when opened via keyboard so pointer users keep their focus;
  // the container onKeyDown is shared by the trigger and the items.
  useEffect(() => {
    if (!accountOpen) return;
    const wasKeyboard = accountRef.current?.matches(':focus-within');
    if (wasKeyboard) {
      const handle = requestAnimationFrame(() => {
        accountMenuItemsRef.current[0]?.focus();
      });
      return () => cancelAnimationFrame(handle);
    }
  }, [accountOpen]);

  const handleAccountKeyDown = (event) => {
    const items = accountMenuItemsRef.current;
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }
    if (nextIndex >= 0) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  };

  // On tab navigation, move keyboard focus to the content area and announce
  // the destination so screen-reader users aren't left where they were.
  useEffect(() => {
    const sectionNames = {
      home: 'Home',
      search: 'Search',
      discover: 'Recommendations',
      history: 'History',
      'trending-full': 'Trending',
      'popular-full': 'Popular',
      'topRated-full': 'Most Acclaimed',
    };
    const name = sectionNames[activeTab];
    if (!name) return;
    setAnnouncement(name);
    // Keep the browser tab / window title in sync with the current section —
    // useful for bookmarking, and for SR users in an unlabelled tab.
    const titles = {
      home: 'CineHound — Sniff out your next favorite film',
      search: 'Search — CineHound',
      discover: 'Recommendations — CineHound',
      history: 'Your Ratings — CineHound',
      'trending-full': 'Trending — CineHound',
      'popular-full': 'Popular — CineHound',
      'topRated-full': 'Most Acclaimed — CineHound',
    };
    document.title = titles[activeTab] || titles.home;
    // Don't hijack focus on the search route: typing pushed the path to /search
    // on the first keystroke, and stealing focus to <main> would interrupt
    // continued typing. The search input manages its own focus.
    if (activeTab === 'search') return;
    requestAnimationFrame(() => mainElRef.current?.focus({ preventScroll: true }));
  }, [activeTab, setAnnouncement]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // Announce the change so screen-reader users aren't left guessing.
    setAnnouncement(`${next === 'dark' ? 'Dark' : 'Light'} mode enabled.`);
  };

  const loadHomeData = useCallback(async () => {
    const requestId = ++homeSequence.current;
    setHomeDataLoading(true);
    setHomeError('');

    try {
      const data = await fetchHomeData(authToken);
      if (homeSequence.current === requestId) {
        setHomeData(data);
      }
    } catch (error) {
      if (homeSequence.current === requestId) {
        setHomeError(error.message);
        setAnnouncement(`Home data failed. ${friendlyError(error.message)}`);
      }
    } finally {
      if (homeSequence.current === requestId) {
        setHomeDataLoading(false);
      }
    }
  }, [authToken, setAnnouncement]);

  const loadRecommendations = useCallback(async (append = false) => {
    if (!authToken) {
      setRecommendations([]);
      setRecommendationState({ status: 'idle', message: '', error: '', debug: null });
      return;
    }

    // Align "load more" to full rows of the visible grid (columns × rows) so
    // the last row is never left partially filled.
    const pageSize = recsPageSize;

    const requestId = ++recommendationsSequence.current;
    const offset = append ? recsOffsetRef.current : 0;

    recsInflightRef.current = true;
    setRecommendationsLoading(true);
    if (!append) {
      setRecommendationState({ status: 'loading', message: '', error: '', debug: null });
    }

    try {
      const data = await fetchRecommendations(authToken, append ? offset : undefined, pageSize);

      if (recommendationsSequence.current !== requestId) {
        return;
      }

      let nextRecommendations = data.results ?? [];
      const total = data.totalAvailable ?? nextRecommendations.length;

      if (append) {
        // Append mode — add new items beyond current list
        recsOffsetRef.current += pageSize;
        setRecsOffset(recsOffsetRef.current);
        setRecommendations((prev) => [...prev, ...nextRecommendations]);
      } else {
        recsOffsetRef.current = pageSize;
        setRecsOffset(pageSize);
        setRecsTotalAvailable(total);
        setRecommendations(nextRecommendations);

        if (nextRecommendations.length > 0) {
          setRecommendationState({ status: 'ready', message: '', error: '', debug: data.debug ?? null });
          setAnnouncement(`Loaded ${nextRecommendations.length} recommendations.`);
        } else {
          setRecommendationState({ status: 'empty', message: '', error: '', debug: data.debug ?? null });
        }
      }
    } catch (error) {
      if (recommendationsSequence.current !== requestId) {
        return;
      }

      if (!append) {
        setRecommendations([]);
        setRecommendationState({ status: 'error', message: '', error: error.message, debug: null });
        setAnnouncement(`Recommendations failed. ${friendlyError(error.message)}`);
      }
    } finally {
      recsInflightRef.current = false;
      if (recommendationsSequence.current === requestId) {
        setRecommendationsLoading(false);
      }
    }
  }, [authToken, recsPageSize, setAnnouncement]);

  const loadSpotlightPick = useCallback(async () => {
    if (!authToken) {
      setSpotlightPick(null);
      setRecommendationState({ status: 'idle', message: '', error: '', debug: null });
      return;
    }

    setSpotlightLoading(true);
    try {
      const data = await fetchRecommendations(authToken, undefined, undefined, 'weighted');
      const picked = data.results && data.results.length > 0 ? data.results[0] : null;
      setSpotlightPick(picked);
      setRecsTotalAvailable(data.totalAvailable ?? (picked ? 1 : 0));
      setRecommendationState({ status: picked ? 'ready' : 'empty', message: '', error: '', debug: data.debug ?? null });
    } catch (error) {
      setSpotlightPick(null);
      setRecommendationState({ status: 'error', message: '', error: error.message, debug: null });
    } finally {
      setSpotlightLoading(false);
    }
  }, [authToken]);

  const loadUserRatings = useCallback(async () => {
    if (!authToken) {
      setUserRatingsHistory([]);
      setUserRatingsError('');
      return;
    }

    setUserRatingsLoading(true);
    setUserRatingsError('');
    try {
      const data = await fetchUserRatings(authToken);
      setUserRatingsHistory(data.results ?? []);
    } catch (error) {
      setUserRatingsError(error.message);
      setAnnouncement(`Could not load ratings history. ${friendlyError(error.message)}`);
    } finally {
      setUserRatingsLoading(false);
    }
  }, [authToken, setAnnouncement]);

  // Latest-ref pattern: the data effects below must re-run only when the
  // tab / view mode / session changes. Keying them on the loader callbacks
  // directly made every column-count change (page size) retrigger fetches —
  // an extra fetch on first load and on each window resize.
  const dataLoaderRef = useRef({ loadHomeData, loadRecommendations, loadSpotlightPick });
  dataLoaderRef.current = { loadHomeData, loadRecommendations, loadSpotlightPick };

  useEffect(() => {
    const { loadHomeData, loadRecommendations, loadSpotlightPick } = dataLoaderRef.current;
    if (activeTab === 'home' || activeTab === 'trending-full' || activeTab === 'popular-full' || activeTab === 'topRated-full') {
      // The home page never renders the recommendations grid, so fetching
      // them here would be a wasted network call that also fires a spurious
      // "Loaded N recommendations." announcement visible nowhere on the page.
      // Recommendations (browse or spotlight) load only when the Discover tab
      // is actually shown.
      void loadHomeData();
    } else if (activeTab === 'discover') {
      if (recsViewMode === 'spotlight') {
        void loadSpotlightPick();
      } else {
        void loadRecommendations();
      }
    }
  }, [activeTab, recsViewMode, authToken]);

  useEffect(() => {
    if (activeTab === 'history') {
      void loadUserRatings();
    }
  }, [activeTab, loadUserRatings]);

  // Infinite scroll for the recommendations browse grid: when the sentinel
  // comes into view (and there is more to load and we aren't already loading),
  // fetch the next page instead of requiring a click.
  useEffect(() => {
    if (!(activeTab === 'discover' && recsViewMode === 'browse' && recsHasMore)) {
      return undefined;
    }
    const loadNext = () => {
      if (!recommendationsLoading && !recsInflightRef.current) {
        void loadRecommendations(true);
      }
    };
    const el = recsSentinelRef.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadNext();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, recsViewMode, recsHasMore, recommendationsLoading, loadRecommendations]);

  const handleSearchChange = (value) => {
    setQuery(value);
    setSearchError('');
    if (value.trim()) {
      setSearchIsOpen(true);
      if (location.pathname !== '/search') {
        navigate('/search', { replace: true });
      }
    }

    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }

    const requestId = ++searchSequence.current;

    searchTimer.current = setTimeout(async () => {
      const trimmed = value.trim();

      if (!trimmed) {
        setSearchResults([]);
        setSearchPage(0);
        setSearchTotalPages(0);
        setSelectedMovieId(null);
        setExpandedRatingMovieId(null);
        if (location.pathname === '/search') {
          navigate('/', { replace: true });
        }
        return;
      }

      try {
        setSearchLoading(true);
        const data = await searchMovies(trimmed, authToken, 1);

        if (searchSequence.current !== requestId) {
          return;
        }

        const nextResults = sortSearchResults(data.results ?? [], trimmed);
        setSearchResults(nextResults.slice(0, SEARCH_INITIAL_RESULT_COUNT));
        setSearchPage(data.page ?? 1);
        setSearchTotalPages(data.totalPages ?? 1);
        setSelectedMovieId(getMovieKey(nextResults[0]) ?? null);
        setExpandedRatingMovieId(null);

        if (nextResults.length > 0) {
          setAnnouncement(`Loaded ${Math.min(nextResults.length, SEARCH_INITIAL_RESULT_COUNT)} search results.`);
        } else {
          setAnnouncement('No search results found.');
        }
      } catch (error) {
        if (searchSequence.current === requestId) {
          setSearchError(error.message);
          setAnnouncement(`Search failed. ${friendlyError(error.message)}`);
        }
      } finally {
        if (searchSequence.current === requestId) {
          setSearchLoading(false);
        }
      }
    }, 240);
  };

  const handleLoadMoreSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed || !searchHasMore || searchLoading) {
      return;
    }

    const nextPage = searchPage + 1;
    const requestId = ++searchSequence.current;

    try {
      setSearchLoading(true);
      const data = await searchMovies(trimmed, authToken, nextPage);

      if (searchSequence.current !== requestId) {
        return;
      }

      const nextResults = sortSearchResults(data.results ?? [], trimmed);
      setSearchResults((current) => mergeUniqueMovies(current, nextResults));
      setSearchPage(data.page ?? nextPage);
      setSearchTotalPages(data.totalPages ?? nextPage);
      setAnnouncement('Loaded more search results.');
    } catch (error) {
      if (searchSequence.current === requestId) {
        setSearchError(error.message);
        setAnnouncement(`Search failed. ${friendlyError(error.message)}`);
      }
    } finally {
      if (searchSequence.current === requestId) {
        setSearchLoading(false);
      }
    }
  };

  const handleQuickRate = async (movie, rating) => {
    const movieKey = getMovieKey(movie);
    if (!movieKey) return;

    // If rating is null, delete the rating — send to API as delete
    if (rating === null) {
      setDraftRatings((current) => {
        const next = { ...current };
        delete next[movieKey];
        return next;
      });
      setSelectedMovieId(movieKey);
      setExpandedRatingMovieId(null);
      setSavingRatingMovieId(movieKey);

      try {
        await saveRating({
          tmdbId: movieKey,
          rating: null,
          authToken,
        });

        const clearPersonalRating = (items) =>
          items.map((item) => (getMovieKey(item) === movieKey ? { ...item, personal_rating: null } : item));

        setSearchResults((current) => clearPersonalRating(current));
        setRecommendations((current) => clearPersonalRating(current));
        setHomeData((current) => {
          if (!current) return current;
          return {
            ...current,
            trending: clearPersonalRating(current.trending || []),
            popular: clearPersonalRating(current.popular || []),
            topRated: clearPersonalRating(current.topRated || []),
          };
        });
        setUserRatingsHistory((current) => current.filter((r) => getMovieKey(r) !== movieKey));
        setAnnouncement(`Removed rating for ${movie.title}.`);
      } catch (error) {
        setAnnouncement(`Could not remove rating. ${friendlyError(error.message)}`);
      } finally {
        setSavingRatingMovieId(null);
      }
      return;
    }

    setDraftRatings((current) => ({ ...current, [movieKey]: rating }));
    setSelectedMovieId(movieKey);
    setExpandedRatingMovieId(movieKey);
    setSavingRatingMovieId(movieKey);

    try {
      await saveRating({
        tmdbId: movieKey,
        rating,
        authToken,
      });

      const updatePersonalRating = (items) =>
        items.map((item) => (getMovieKey(item) === movieKey ? { ...item, personal_rating: rating } : item));

      setSearchResults((current) => updatePersonalRating(current));
      setRecommendations((current) => updatePersonalRating(current));
      setHomeData((current) => {
        if (!current) return current;
        return {
          ...current,
          trending: updatePersonalRating(current.trending || []),
          popular: updatePersonalRating(current.popular || []),
          topRated: updatePersonalRating(current.topRated || []),
        };
      });
      setUserRatingsHistory((current) => {
        const existing = current.find((r) => getMovieKey(r) === movieKey);
        if (existing) {
          return current.map((r) => (getMovieKey(r) === movieKey ? { ...r, personal_rating: rating } : r));
        }
        return [{ ...movie, personal_rating: rating }, ...current];
      });
      setExpandedRatingMovieId(null);
      setAnnouncement(`Saved ${formatRatingValue(rating)} for ${movie.title}.`);

      if (activeTab === 'home' || activeTab === 'discover') {
        if (recsViewMode === 'spotlight') {
          void loadSpotlightPick();
        } else {
          void loadRecommendations();
        }
      }
    } catch (error) {
      setAnnouncement(`Could not save rating. ${friendlyError(error.message)}`);
    } finally {
      setSavingRatingMovieId(null);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setAuthLoading(true);
      const session = await getDemoSession();
      setAuthSession(session);
      setAnnouncement(`Signed in as ${session.label}.`);
    } catch (error) {
      setAnnouncement(`Demo auth failed. ${friendlyError(error.message)}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFirebaseLogin = async () => {
    try {
      setAuthLoading(true);
      const session = await signInWithFirebasePopup();
      setAuthSession(session);
      setAnnouncement(`Signed in as ${session.label}.`);
    } catch (error) {
      setAnnouncement(`Firebase login failed. ${friendlyError(error.message)}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthLoading(true);
      await signOutFirebase();
    } catch (error) {
      setAnnouncement(`Sign out failed. ${friendlyError(error.message)}`);
      return;
    } finally {
      setAuthLoading(false);
    }

    setAuthSession(null);
    setRecommendations([]);
    setRecommendationState({ status: 'idle', message: '', error: '', debug: null });
    setExpandedRatingMovieId(null);
    setAnnouncement('Signed out.');
  };

  const toggleHeaderSearch = () => {
    const willOpen = !searchIsOpen;
    setSearchIsOpen((prev) => !prev);
    if (willOpen) {
      // Focus the input once the field is mounted (next frame).
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  const closeHeaderSearch = () => {
    setSearchIsOpen(false);
    setQuery('');
    setSearchResults([]);
    setSearchPage(0);
    setSearchTotalPages(0);
    if (activeTab === 'search') {
      setActiveTab('home');
    }
  };

  const renderSearchBody = () => {
    if (searchLoading && searchResults.length === 0) {
      return <StateCard title="Searching…" tone="loading" />;
    }

    if (searchError && searchResults.length === 0) {
      return <StateCard title="Search error" message={friendlyError(searchError)} tone="error" />;
    }

    if (!query.trim()) {
      return (
        <StateCard
          title="Search the whole catalog"
          message="Type a title, actor, or director above and CineHound will sniff out matching films from the entire TMDB universe."
          tone="neutral"
        />
      );
    }

    if (!hasSearchResults) {
      return <StateCard title="No results found" message="Try a different search." tone="neutral" />;
    }

    return (
      <>
        <SectionHeader title={`Results for “${query.trim()}”`} />
        <div className={`results-grid results-grid--search${searchResults.length <= 1 ? ' results-grid--single' : ''}`} id="search-results" aria-label="Search results" aria-live="polite">
          {searchResults.map((movie) => {
            const movieKey = getMovieKey(movie);
            const currentRating = movieKey ? draftRatings[movieKey] ?? movie.personal_rating ?? null : movie.personal_rating ?? null;
            const isSelected = selectedMovieId === movieKey;
            const communityTone = getCommunityTone(movie.vote_average, movie.vote_count);

            return (
              <MovieCard
                key={movieKey ?? movie.title}
                movie={movie}
                mode="search"
                selected={isSelected}
                badgeText={communityTone.label}
                badgeTone={communityTone.tone}
                ratingValue={currentRating}
                authEnabled={authEnabled}
                savingRating={savingRatingMovieId === movieKey}
                expandedRatingMovieId={expandedRatingMovieId}
                onRate={handleQuickRate}
                onCloseRating={(key) => setExpandedRatingMovieId((current) => (current === key ? null : current))}
              />
            );
          })}
        </div>

        <div className="results-footer">
          {searchHasMore ? (
            <button type="button" className="subtle-button" onClick={handleLoadMoreSearch} disabled={searchLoading}>
              {searchLoading ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      </>
    );
  };

  const fullPageSection = activeTab === 'trending-full' ? 'trending'
    : activeTab === 'popular-full' ? 'popular'
    : activeTab === 'topRated-full' ? 'topRated'
    : null;

  // Load expanded section data when a section is expanded
  useEffect(() => {
    if (!fullPageSection) {
      setExpandedSectionData(null);
      return;
    }

    let cancelled = false;
    const expandedRows = 4;
    const loadLimit = homeColumns * expandedRows;

    setExpandedSectionLoading(true);
    setExpandedHasMore(true);
    fetchHomeData(authToken, fullPageSection, loadLimit)
      .then((data) => {
        if (!cancelled) {
          const results = data.results || [];
          setExpandedSectionData(results);
          setExpandedHasMore(results.length >= loadLimit);
          setExpandedSectionLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setExpandedSectionLoading(false);
      });

    return () => { cancelled = true; };
  }, [fullPageSection, homeColumns, authToken]);

  const handleLoadMoreExpanded = useCallback(async () => {
    if (!fullPageSection || expandedSectionLoading) return;
    const existing = expandedSectionData || [];
    const loadLimit = existing.length + homeColumns * 4;

    setExpandedSectionLoading(true);
    try {
      const data = await fetchHomeData(authToken, fullPageSection, loadLimit);
      const fresh = data.results || [];
      // Merge: keep existing items in place, append only new unique ones
      const existingIds = new Set(existing.map((m) => String(m.tmdb_id)));
      const newItems = fresh.filter((m) => !existingIds.has(String(m.tmdb_id)));
      setExpandedSectionData([...existing, ...newItems]);
      setExpandedHasMore(newItems.length > 0 && fresh.length >= loadLimit);
    } catch (err) {
      console.error('Failed to load more:', err.message);
    } finally {
      setExpandedSectionLoading(false);
    }
  }, [fullPageSection, expandedSectionLoading, expandedSectionData, homeColumns, authToken]);

  const renderHomeBody = () => {
    if (homeDataLoading && !homeData) {
      return <HomeSkeleton columns={homeColumns} rows={homeRows} />;
    }

    if (homeError && !homeData) {
      return (
        <StateCard title="Couldn't load home" message={friendlyError(homeError)} tone="error">
          <div className="state-card__actions">
            <button type="button" onClick={loadHomeData}>Retry</button>
          </div>
        </StateCard>
      );
    }

    const trending = homeData?.trending ?? [];
    const popular = homeData?.popular ?? [];
    const topRated = homeData?.topRated ?? [];

    const sectionKeys = {
      trending: { key: 'trending', data: trending, title: 'Trending Now' },
      popular: { key: 'popular', data: popular, title: 'Popular' },
      topRated: { key: 'topRated', data: topRated, title: 'Most Acclaimed' },
    };

    const activeSectionKey = fullPageSection;
    const activeSection = activeSectionKey ? sectionKeys[activeSectionKey] : null;

    // When a section is expanded, show only that section with paginated results
    if (activeSection) {
      const movies = expandedSectionData || [];
      return (
        <div>
          <SectionHeader
            title={activeSection.title}
            onViewMore={() => navigate('/')}
            viewMoreLabel="← Back"
          />
          {expandedSectionLoading && movies.length === 0 ? (
            <StateCard title="Loading…" tone="loading" />
          ) : (
            <>
              <div className="results-grid results-grid--home" aria-label={activeSection.title}>
                {movies.map((movie) => {
                  const movieKey = getMovieKey(movie);
                  const currentRating = draftRatings[movieKey] ?? movie.personal_rating ?? null;
                  const isSelected = selectedMovieId === movieKey;
                  const communityTone = getCommunityTone(movie.vote_average, movie.vote_count);

                  return (
                    <MovieCard
                      key={movieKey ?? movie.title}
                      movie={movie}
                      mode="home"
                      selected={isSelected}
                      badgeText={communityTone.label}
                      badgeTone={communityTone.tone}
                      ratingValue={currentRating}
                      authEnabled={authEnabled}
                      savingRating={savingRatingMovieId === movieKey}
                      expandedRatingMovieId={expandedRatingMovieId}
                      onRate={handleQuickRate}
                      onCloseRating={(key) => setExpandedRatingMovieId((current) => (current === key ? null : current))}
                    />
                  );
                })}
              </div>
              {expandedHasMore ? (
                <div className="results-footer">
                  <button type="button" className="subtle-button" onClick={handleLoadMoreExpanded} disabled={expandedSectionLoading}>
                    {expandedSectionLoading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </>
          )}
          </div>
        );
      }

      // Compact home view: dynamic columns × fixed rows per section
      const limit = homeColumns * homeRows;

      const sectionRoutes = { trending: '/trending', popular: '/popular', topRated: '/most-acclaimed' };

      const renderMovieSection = (movies, title, sectionKey) => {
        if (movies.length === 0) return null;
        const visible = movies.slice(0, Math.max(1, limit));
        const viewAllPath = sectionRoutes[sectionKey] || '/';

        return (
          <div>
            <SectionHeader
              title={title}
              onViewMore={() => navigate(viewAllPath)}
              viewMoreLabel="View all"
            />
            <div className="results-grid results-grid--home" aria-label={title}>
            {visible.map((movie) => {
              const movieKey = getMovieKey(movie);
              const currentRating = draftRatings[movieKey] ?? movie.personal_rating ?? null;
              const isSelected = selectedMovieId === movieKey;
              const communityTone = getCommunityTone(movie.vote_average, movie.vote_count);

              return (
                <MovieCard
                  key={movieKey ?? movie.title}
                  movie={movie}
                  mode="home"
                  selected={isSelected}
                  badgeText={communityTone.label}
                  badgeTone={communityTone.tone}
                  ratingValue={currentRating}
                  authEnabled={authEnabled}
                  savingRating={savingRatingMovieId === movieKey}
                  expandedRatingMovieId={expandedRatingMovieId}
                  onRate={handleQuickRate}
                  onCloseRating={(key) => setExpandedRatingMovieId((current) => (current === key ? null : current))}
                />
              );
            })}
          </div>
          </div>
        );
      };

    return (
      <div>
        {heroVisible ? (
        <section className="home-hero" aria-label="About CineHound">
          {/* Decorative radar FX — presentational, ignored by screen readers */}
          <button type="button" className="home-hero__dismiss" onClick={dismissHero} aria-label="Hide intro">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="home-hero__fx" aria-hidden="true">
            <span className="home-hero__ring home-hero__ring--1" />
            <span className="home-hero__ring home-hero__ring--2" />
            <span className="home-hero__ring home-hero__ring--3" />
            <span className="home-hero__cross home-hero__cross--h" />
            <span className="home-hero__cross home-hero__cross--v" />
          </div>
          <div className="home-hero__inner">
            <div className="home-hero__mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" focusable="false" width="20" height="20">
                <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
                <circle cx="32" cy="32" r="16" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
                <line x1="32" y1="32" x2="32" y2="6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <circle cx="32" cy="6" r="3.2" fill="currentColor" />
                <circle cx="48" cy="16" r="2.4" fill="currentColor" opacity="0.7" />
              </svg>
              <span>Recommendation Engine</span>
            </div>
            <h2 className="home-hero__title">Your next favorite film, <em>already sniffed out.</em></h2>
            <p className="home-hero__lede">
              Rate what you love and CineHound builds a taste profile from your history,
              then surfaces the movies you're most likely to adore — powered by collaborative filtering.
            </p>
          </div>
        </section>
        ) : null}
        <div className="home-sections">
          {renderMovieSection(trending, 'Trending Now', 'trending')}
          {renderMovieSection(popular, 'Popular', 'popular')}
          {renderMovieSection(topRated, 'Most Acclaimed', 'topRated')}
        </div>
      </div>
    );
  };

  const renderRecommendationsBody = () => {
    if (!authEnabled) {
      return (
        <StateCard
          title="Sign in to unlock recommendations"
          message="CineHound builds a taste profile from the films you rate, then surfaces your next favorites. Sign in or jump into the Demo session to try it instantly."
          tone="neutral"
        >
          <div className="state-card__actions">
            <button type="button" className="btn-primary" onClick={handleFirebaseLogin} disabled={authLoading}>Sign in with Google</button>
            <button type="button" className="subtle-button" onClick={handleDemoLogin} disabled={authLoading}>Try Demo</button>
          </div>
        </StateCard>
      );
    }

    if (recsViewMode === 'spotlight') {
      if (spotlightLoading && !spotlightPick) {
        return <RecommendationVignette />;
      }

      if (recommendationState.status === 'error' && !spotlightPick) {
        return (
          <StateCard title="Recommendations unavailable" message={recommendationState.error ? friendlyError(recommendationState.error) : 'Something went wrong while generating your recommendations.'} tone="error">
            <div className="state-card__actions">
              <button type="button" onClick={loadSpotlightPick} disabled={spotlightLoading}>Retry</button>
            </div>
          </StateCard>
        );
      }

      if (!spotlightPick) {
        return <StateCard title="No recommendations yet" message="Rate a few films to establish your taste profile, then CineHound will surface your next favorites." tone="neutral" />;
      }

      const pickKey = getMovieKey(spotlightPick);
      const pickRating = spotlightPick.personal_rating ?? null;

      return (
        <>
          <SpotlightCard
            movie={spotlightPick}
            ratingValue={pickRating}
            authEnabled={authEnabled}
            savingRating={savingRatingMovieId === pickKey}
            onRate={handleQuickRate}
          />
          <div className="spotlight__actions">
            <button type="button" className="btn-soft" onClick={loadSpotlightPick} disabled={spotlightLoading}>
              {spotlightLoading ? 'Picking…' : 'Show me another'}
            </button>
            {recsTotalAvailable > 1 ? (
              <button type="button" className="btn-soft" onClick={() => setRecsViewMode('browse')}>
                View all recommendations
              </button>) : null}
          </div>
        </>
      );
    }

    if (recommendationsLoading && recommendations.length === 0) {
      return <StateCard title="Building your recommendations…" tone="loading" />;
    }

    if (recommendationState.status === 'error') {
      return (
        <StateCard title="Recommendations unavailable" message={recommendationState.error ? friendlyError(recommendationState.error) : 'Something went wrong while generating your recommendations.'} tone="error">
          <div className="state-card__actions">
            <button type="button" onClick={() => loadRecommendations()} disabled={recommendationsLoading}>Retry</button>
          </div>
        </StateCard>
      );
    }

    if (!hasRecommendations) {
      return <StateCard title="No recommendations yet" message="Rate a few films to establish your taste profile, then CineHound will surface your next favorites." tone="neutral" />;
    }

    return (
      <>
        <SectionHeader
          title="Target Lock"
          onViewMore={() => setRecsViewMode('spotlight')}
          viewMoreLabel="Switch to Spotlight"
          viewMoreVariant="pill"
        />
        <div className="results-grid results-grid--discover" aria-label="Recommendation results">
          {recommendations.map((movie) => {
            const movieKey = getMovieKey(movie);
            const currentRating = movie.personal_rating ?? null;
            const isSelected = selectedMovieId === movieKey;
            const matchScore = formatMatchScore(movie.score);

            return (
              <MovieCard
                key={movieKey ?? movie.title}
                movie={movie}
                mode="discover"
                selected={isSelected}
                badgeText={matchScore.label}
                badgeTone={matchScore.tone}
                ratingValue={currentRating}
                authEnabled={authEnabled}
                savingRating={savingRatingMovieId === movieKey}
                expandedRatingMovieId={expandedRatingMovieId}
                onRate={handleQuickRate}
                onCloseRating={(key) => setExpandedRatingMovieId((current) => (current === key ? null : current))}
              />
            );
          })}
        </div>

        <div
          ref={recsSentinelRef}
          className="results-footer results-footer--sentinel"
          aria-hidden="true"
        >
          {recommendationsLoading ? <span className="results-footer__loading">Loading…</span> : <span className="results-footer__spacer" />}
        </div>
        {recommendationState.status === 'error' ? renderRecommendationDiagnostics() : null}
      </>
    );
  };

  const renderHistoryBody = () => {
    if (!authEnabled) {
      return (
        <StateCard
          title="Sign in to view your ratings"
          message="Your scent trail — every film you've rated — lives here. Sign in or jump into the Demo session to see it."
          tone="neutral"
        >
          <div className="state-card__actions">
            <button type="button" className="btn-primary" onClick={handleFirebaseLogin} disabled={authLoading}>Sign in with Google</button>
            <button type="button" className="subtle-button" onClick={handleDemoLogin} disabled={authLoading}>Try Demo</button>
          </div>
        </StateCard>
      );
    }

    if (userRatingsLoading && userRatingsHistory.length === 0) {
      return <StateCard title="Loading your ratings…" tone="loading" />;
    }

    if (userRatingsError) {
      return (
        <StateCard title="Couldn't load your ratings" message={friendlyError(userRatingsError)} tone="error">
          <div className="state-card__actions">
            <button type="button" onClick={loadUserRatings}>Retry</button>
          </div>
        </StateCard>
      );
    }

    if (userRatingsHistory.length === 0) {
      return <StateCard title="No ratings yet" message="Rate films to populate your scent trail, and they'll show up here." tone="neutral" />;
    }

    // Sort: by rating recency (server order) or by the rating value itself.
    const sorted = [...userRatingsHistory];
    if (historySort === 'rating-high') {
      sorted.sort((a, b) => (b.personal_rating ?? -99) - (a.personal_rating ?? -99));
    } else if (historySort === 'rating-low') {
      sorted.sort((a, b) => (a.personal_rating ?? -99) - (b.personal_rating ?? -99));
    } else if (historySort === 'title') {
      sorted.sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')));
    }

    // Filter by rating tone (Love / Like / Meh / Dislike / Hidden).
    const filtered =
      historyFilter === 'all'
        ? sorted
        : sorted.filter((movie) => {
            const v = movie.personal_rating;
            if (historyFilter === 'love') return v === 2;
            if (historyFilter === 'like') return v === 1;
            if (historyFilter === 'meh') return v === 0;
            if (historyFilter === 'dislike') return v === -2 || v === -1;
            return true;
          });

    const filterOptions = [
      { value: 'all', label: 'All' },
      { value: 'love', label: 'Love' },
      { value: 'like', label: 'Like' },
      { value: 'meh', label: 'Meh' },
      { value: 'dislike', label: 'Dislike' },
    ];

    return (
      <>
        <SectionHeader title={`Your Ratings (${filtered.length}/${userRatingsHistory.length})`} />
        <div className="history-controls" aria-label="Sort and filter your ratings">
          <label className="history-control">
            <span>Sort</span>
            <select value={historySort} onChange={(e) => setHistorySort(e.target.value)}>
              <option value="recent">Most recent</option>
              <option value="rating-high">Rating: high → low</option>
              <option value="rating-low">Rating: low → high</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </label>
          <div className="history-control" role="group" aria-label="Filter by rating">
            <span>Filter</span>
            <div className="history-filter">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={historyFilter === opt.value}
                  className={historyFilter === opt.value ? 'is-active' : ''}
                  onClick={() => setHistoryFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="results-grid results-grid--history" aria-label="Your rated movies">
          {filtered.map((movie) => {
            const movieKey = getMovieKey(movie);
            const currentRating = movie.personal_rating ?? null;
            const isSelected = selectedMovieId === movieKey;
            const communityTone = getCommunityTone(movie.vote_average, movie.vote_count);
            // Show community rating badge
            const badgeText = communityTone.label;
            const badgeTone = communityTone.tone;

            return (
              <MovieCard
                key={movieKey ?? movie.title}
                movie={movie}
                mode="history"
                selected={isSelected}
                badgeText={badgeText}
                badgeTone={badgeTone}
                ratingValue={currentRating}
                authEnabled={authEnabled}
                savingRating={savingRatingMovieId === movieKey}
                expandedRatingMovieId={expandedRatingMovieId}
                onRate={handleQuickRate}
                onCloseRating={(key) => setExpandedRatingMovieId((current) => (current === key ? null : current))}
              />
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <StateCard title="Nothing here" message="Try a different filter or sort." tone="neutral" />
        ) : null}
      </>
    );
  };

  const renderRecommendationDiagnostics = useCallback(() => {
    const debug = recommendationState.debug;
    if (!debug) return null;

    const rows = [
      ['User ID', debug.userId ?? authSession?.uid ?? '—'],
      ['Ratings', debug.ratingsCount ?? '—'],
      ['User ratings', debug.userRatingsCount ?? '—'],
      ['Metadata rows', debug.metadataCount ?? '—'],
      ['Matrix', debug.matrixLoaded ? 'Loaded' : 'Missing'],
      ['Primary results', debug.primaryCount ?? '—'],
      ['Fallback results', debug.fallbackCount ?? '—'],
      ['Returned', debug.resultCount ?? '—'],
    ];

    return (
      <details className="debug-panel" open>
        <summary>Recommendation diagnostics</summary>
        <dl className="debug-panel__grid">
          {rows.map(([label, value]) => (
            <div key={label} className="debug-panel__row">
              <dt>{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
          {debug.matrixPath ? (
            <div className="debug-panel__row debug-panel__row--full">
              <dt>Matrix path</dt>
              <dd>{debug.matrixPath}</dd>
            </div>
          ) : null}
          {Array.isArray(debug.notes) && debug.notes.length > 0 ? (
            <div className="debug-panel__row debug-panel__row--full">
              <dt>Notes</dt>
              <dd>{debug.notes.join(' • ')}</dd>
            </div>
          ) : null}
        </dl>
      </details>
    );
  }, [recommendationState.debug, authSession?.uid]);

  return (
    <div className="app-shell">
      {/* Keyboard users can jump past the sticky header + nav straight to content. */}
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="brand-block">
          <button type="button" className="brand-block__link" onClick={() => setActiveTab('home')} aria-label="CineHound home">
          <svg className="brand-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="chRadarMark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00ff77" />
                <stop offset="55%" stopColor="#38d889" />
                <stop offset="100%" stopColor="#ff9a3d" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="15" fill="var(--surface-raised)" />
            <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.5" />
            <circle cx="32" cy="32" r="19.5" fill="none" stroke="url(#chRadarMark)" strokeWidth="2.2" opacity="0.9" />
            <circle cx="32" cy="32" r="13" fill="none" stroke="url(#chRadarMark)" strokeWidth="1.8" opacity="0.55" />
            <circle cx="32" cy="32" r="6.5" fill="none" stroke="url(#chRadarMark)" strokeWidth="1.5" opacity="0.35" />
            <line x1="32" y1="32" x2="32" y2="12.5" stroke="url(#chRadarMark)" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
            <circle cx="32" cy="12.5" r="2.6" fill="url(#chRadarMark)" />
            <circle cx="42.5" cy="22.5" r="2" fill="url(#chRadarMark)" opacity="0.7" />
            <circle cx="24.5" cy="41.5" r="1.6" fill="url(#chRadarMark)" opacity="0.5" />
            <circle cx="43" cy="39" r="1.4" fill="url(#chRadarMark)" opacity="0.4" />
          </svg>
          <div className="brand-text">
            <h1>
              CineHound
              <span aria-hidden="true">™</span>
            </h1>
            <p className="brand-tagline">Tactical Recommendation Engine</p>
          </div>
          </button>
        </div>

        <nav className="app-nav" aria-label="Main navigation">
          <div
            className="nav-browse"
            ref={browseRef}
            onMouseEnter={() => { if (browseCloseTimer.current) clearTimeout(browseCloseTimer.current); setBrowseOpen(true); }}
            onMouseLeave={() => {
              if (browseCloseTimer.current) clearTimeout(browseCloseTimer.current);
              browseCloseTimer.current = setTimeout(() => setBrowseOpen(false), 160);
            }}
            onKeyDown={(event) => {
              // If the menu isn't open yet and we're on the trigger, ArrowDown
              // opens it and drops focus onto the first item.
              if (!browseOpen && (event.key === 'ArrowDown' || event.key === 'ArrowRight')) {
                event.preventDefault();
                setBrowseOpen(true);
                return;
              }
              const items = browseMenuItemsRef.current;
              if (items.length === 0) return;
              const currentIndex = items.indexOf(document.activeElement);

              let nextIndex = -1;
              if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
              } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
              } else if (event.key === 'Home') {
                nextIndex = 0;
              } else if (event.key === 'End') {
                nextIndex = items.length - 1;
              } else if (event.key === 'Escape') {
                setBrowseOpen(false);
                browseRef.current?.querySelector('.nav-tab')?.focus();
                return;
              }

              if (nextIndex >= 0) {
                event.preventDefault();
                items[nextIndex].focus();
              }
            }}
          >
            <button
              type="button"
              className={['nav-tab', activeTab === 'home' || activeTab === 'trending-full' || activeTab === 'popular-full' || activeTab === 'topRated-full' ? 'nav-tab--active' : ''].filter(Boolean).join(' ')}
              onClick={() => { setBrowseOpen((o) => !o); if (activeTab !== 'home') setActiveTab('home'); }}
              aria-haspopup="true"
              aria-expanded={browseOpen}
            >
              Home
              <svg className="nav-caret" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {browseOpen ? (
              <div className="nav-browse__menu" role="menu">
                {[
                  { label: 'Trending Now', go: () => setActiveTab('trending-full') },
                  { label: 'Popular', go: () => setActiveTab('popular-full') },
                  { label: 'Most Acclaimed', go: () => setActiveTab('topRated-full') },
                ].map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="nav-browse__item"
                    ref={(el) => { browseMenuItemsRef.current[index] = el; }}
                    onClick={() => { setBrowseOpen(false); item.go(); }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={activeTab === 'discover' ? 'nav-tab nav-tab--active' : 'nav-tab'}
            onClick={() => setActiveTab('discover')}
          >
            Recommendations
          </button>
          <button
            type="button"
            className={activeTab === 'history' ? 'nav-tab nav-tab--active' : 'nav-tab'}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </nav>

        <div className="header-auth" aria-label="Identity and session controls">
          <div className="header-search">
            {searchIsOpen ? (
              <div
                className="header-search__field"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeHeaderSearch();
                }}
              >
                <svg className="header-search__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7.5" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search movies…"
                  aria-label="Search movies"
                  aria-controls="search-results"
                  aria-expanded={hasSearchResults ? 'true' : 'false'}
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <button
                  type="button"
                  className="header-search__close"
                  onClick={closeHeaderSearch}
                  aria-label="Close search"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            ) : (
              <button type="button" className="header-search__toggle" onClick={toggleHeaderSearch}>
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7.5" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
                Search
              </button>
            )}
          </div>

          <div
            className="account-menu"
            ref={accountRef}
            onKeyDown={handleAccountKeyDown}
          >
            <button
              type="button"
              className={['account-menu__trigger', accountOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
              onClick={() => setAccountOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              aria-label="Account and settings menu"
            >
              {authSession ? (
                <span className="account-menu__label" title={authLabel}>{authLabel}</span>
              ) : (
                <span className="account-menu__label">Account</span>
              )}
              <svg className="nav-caret" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {accountOpen ? (
              <div className="account-menu__dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="account-menu__item"
                  ref={(el) => { accountMenuItemsRef.current[0] = el; }}
                  onClick={() => { toggleTheme(); }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {theme === 'dark' ? (
                      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
                    ) : (
                      <path d="M20.4 14.2A8.2 8.2 0 0 1 9.8 3.6 8.5 8.5 0 1 0 20.4 14.2Z" />
                    )}
                  </svg>
                  <span>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </button>

                {authSession ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="account-menu__item"
                      ref={(el) => { accountMenuItemsRef.current[1] = el; }}
                      onClick={() => { setAccountOpen(false); setActiveTab('history'); }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l2.5 2.5" /><circle cx="12" cy="12" r="8.5" /></svg>
                      <span>Your Ratings</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="account-menu__item account-menu__item--danger"
                      ref={(el) => { accountMenuItemsRef.current[2] = el; }}
                      onClick={() => { setAccountOpen(false); void handleSignOut(); }}
                      disabled={authLoading}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                      <span>Sign out</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="account-menu__item"
                      ref={(el) => { accountMenuItemsRef.current[1] = el; }}
                      onClick={() => { setAccountOpen(false); void handleFirebaseLogin(); }}
                      disabled={authLoading}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>
                      <span>Sign in</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="account-menu__item"
                      ref={(el) => { accountMenuItemsRef.current[2] = el; }}
                      onClick={() => { setAccountOpen(false); void handleDemoLogin(); }}
                      disabled={authLoading}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
                      <span>Try Demo</span>
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-main" ref={mainElRef} id="main-content" tabIndex={-1}>
        {(activeTab === 'home' || activeTab === 'trending-full' || activeTab === 'popular-full' || activeTab === 'topRated-full') ? (
          <section className="content-section" aria-label="Home">
            {renderHomeBody()}
          </section>
        ) : null}

        {activeTab === 'search' ? (
          <section className="content-section" aria-label="Search">
            {renderSearchBody()}
          </section>
        ) : null}

        {activeTab === 'discover' ? (
          <section className="content-section" aria-label="Recommendations">
            {renderRecommendationsBody()}
          </section>
        ) : null}

        {activeTab === 'history' ? (
          <section className="content-section" aria-label="History">
            {renderHistoryBody()}
          </section>
        ) : null}

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          <span key={announcement.seq}>{announcement.text}</span>
        </div>
      </main>

      <footer className="app-footer">
        <div className="app-footer__brand">
          <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true" focusable="false">
            <rect width="64" height="64" rx="15" fill="var(--surface-raised)" />
            <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.85" />
            <line x1="32" y1="32" x2="32" y2="13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="32" cy="13" r="2.4" fill="currentColor" />
          </svg>
          <span>CineHound</span>
        </div>
        <p className="app-footer__note">
          Imagery and movie data courtesy of{' '}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </footer>

      <button
        type="button"
        className={'back-top' + (showBackTop ? ' is-visible' : '')}
        onClick={scrollToTop}
        aria-label="Back to top"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}

export default App;
