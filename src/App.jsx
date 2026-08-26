import { useCallback, useEffect, useRef, useState } from 'react';
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
const RECS_PER_PAGE = 24;

function RatingIcon({ kind }) {
  switch (kind) {
    case 'thumb-up':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M10 22H7.5c-.8 0-1.5-.7-1.5-1.5v-7.8c0-.7.4-1.3 1-1.6l4.5-2.1V7.7c0-2.1 1.7-3.8 3.8-3.8h.3c.9 0 1.7.7 1.8 1.6l.6 4.4h2.6c1.6 0 2.8 1.3 2.7 2.9l-.5 5.2c-.1 1.4-1.3 2.5-2.7 2.5h-6.1l-1.1 1.7c-.3.5-.9.8-1.5.8zm1.2-2.2h.6l1.1-1.7c.3-.4.7-.7 1.2-.7h6.4c.2 0 .4-.2.4-.4l.5-5.2c0-.4-.3-.7-.7-.7h-3.6c-.6 0-1.1-.5-1.2-1.1l-.7-4.9c0-.3-.3-.5-.6-.5h-.3c-.9 0-1.6.7-1.6 1.6v2.4c0 .5-.3.9-.7 1.1l-5 2.3v6.9h2.5l.8-1.2c.2-.4.6-.6 1-.6zM3.5 11.4h2.3v8.4H3.5c-.8 0-1.5-.7-1.5-1.5v-5.4c0-.8.7-1.5 1.5-1.5z" />
        </svg>
      );
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M12 21s-7.2-4.5-9.8-9C.2 8.1 1.5 4.5 5 3.3c2.1-.7 4.5.1 5.9 1.9 1.4-1.8 3.8-2.6 5.9-1.9 3.5 1.2 4.8 4.8 2.8 8.7-2.6 4.5-9.8 9-9.8 9z" />
        </svg>
      );
    case 'thumb-down':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M14 2h2.5c.8 0 1.5.7 1.5 1.5v7.8c0 .7-.4 1.3-1 1.6l-4.5 2.1v.8c0 2.1-1.7 3.8-3.8 3.8h-.3c-.9 0-1.7-.7-1.8-1.6L6 13.6H3.4C1.8 13.6.6 12.3.7 10.7l.5-5.2C1.3 4.1 2.5 3 3.9 3h6.1l1.1-1.7c.3-.5.9-.8 1.5-.8zM12.8 4.2h-.6l-1.1 1.7c-.3.4-.7.7-1.2.7H3.5c-.2 0-.4.2-.4.4l-.5 5.2c0 .4.3.7.7.7h3.6c.6 0 1.1.5 1.2 1.1l.7 4.9c0 .3.3.5.6.5h.3c.9 0 1.6-.7 1.6-1.6v-2.4c0-.5.3-.9.7-1.1l5-2.3V5.2h-2.5l-.8 1.2c-.2.4-.6.6-1 .6zM20.5 14.6h-2.3V6.2h2.3c.8 0 1.5.7 1.5 1.5v5.4c0 .8-.7 1.5-1.5 1.5z" />
        </svg>
      );
    case 'meh':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M12 21a9 9 0 1 1 9-9 9 9 0 0 1-9 9zm0-16.2A7.2 7.2 0 1 0 19.2 12 7.2 7.2 0 0 0 12 4.8z" />
          <path d="M7.5 13.5c1.2-1 2.8-1 4 0s2.8 1 4 0" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M12 3.8a8.2 8.2 0 1 0 8.2 8.2A8.21 8.21 0 0 0 12 3.8zm0 14.7a6.5 6.5 0 1 1 6.5-6.5 6.51 6.51 0 0 1-6.5 6.5zm-.9-9.5h1.8V12h2.8v1.8h-2.8v2.8h-1.8v-2.8H8.3V12h2.8z" />
        </svg>
      );
    case 'minus':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M12 21a9 9 0 1 1 9-9 9 9 0 0 1-9 9zm0-16.2A7.2 7.2 0 1 0 19.2 12 7.2 7.2 0 0 0 12 4.8z" />
          <path d="M6.5 6.5l11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'hide':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="rating-icon">
          <path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5zm0 12.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z" />
          <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

  // 5 buttons evenly spaced across the poster bottom: Don't Recommend + 4 rating options
  // Each button is 15% of poster width. Left positions: 4%, 23%, 42%, 61%, 80%
  const ratingButtonPositions = [4, 23, 42, 61, 80];

  const tmdbUrl = movie.tmdb_id ? `https://www.themoviedb.org/movie/${movie.tmdb_id}` : null;

  const handleCardClick = (event) => {
    // Don't navigate if the click was on a rating button or its children
    if (event.target.closest('.poster-rating__option')) return;
    if (tmdbUrl) {
      window.open(tmdbUrl, '_blank', 'noopener,noreferrer');
    }
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
      aria-label={`View ${movie.title} on TMDB`}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleCardClick(event);
        }
      }}
    >
      <div className="poster">
        <div className="poster-media">
          {posterUrl ? (
            <img src={posterUrl} alt={`${movie.title} poster`} />
          ) : (
            <div className="poster-fallback" aria-label={`${movie.title} poster unavailable`}>
              No poster
            </div>
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
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onCloseRating(movieKey);
              }
            }}
          >
            <div className="poster-rating__menu" id={ratingPanelId} role="radiogroup" aria-label={`Rate ${movie.title}`}>
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
                  style={{
                    left: `${ratingButtonPositions[index]}%`,
                    width: '15%',
                  }}
                  aria-checked={ratingValue === option.value}
                  aria-label={option.label}
                  disabled={savingRating}
                  tabIndex={isRatingOpen ? 0 : -1}
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
                style={{
                  left: `${ratingButtonPositions[4]}%`,
                  width: '15%',
                }}
                aria-label={`Don't recommend ${movie.title}`}
                disabled={savingRating}
                tabIndex={isRatingOpen ? 0 : -1}
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

function StateCard({ title, message, tone = 'neutral', children }) {
  return (
    <div className={`state-card state-card--${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {children}
    </div>
  );
}

function SectionHeader({ title, onViewMore, viewMoreLabel }) {
  return (
    <div className="section-header-row">
      <h2 className="section-header">{title}</h2>
      {onViewMore ? (
        <button type="button" className="view-more-link" onClick={onViewMore}>
          {viewMoreLabel || 'View all →'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Hook: measure a grid container's width and return how many card columns fit.
 * Card min-width for home grids is ~160px (from CSS --card-size clamp).
 */
function useGridColumns(containerRef) {
  const [columns, setColumns] = useState(6);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      // Measure the first results-grid--home to match CSS auto-fit exactly
      const grid = document.querySelector('.results-grid--home');
      if (!grid) return;
      const style = getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
      if (cols > 0) setColumns(cols);
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
  }, [containerRef]);

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
    try { return localStorage.getItem('cinehound-theme') || 'dark'; } catch { return 'dark'; }
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
  const [homeData, setHomeData] = useState(null);
  const [homeDataLoading, setHomeDataLoading] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [userRatingsHistory, setUserRatingsHistory] = useState([]);
  const [userRatingsLoading, setUserRatingsLoading] = useState(false);
  const [userRatingsError, setUserRatingsError] = useState('');
  const [savingRatingMovieId, setSavingRatingMovieId] = useState(null);
  const [expandedRatingMovieId, setExpandedRatingMovieId] = useState(null);
  const [expandedSectionData, setExpandedSectionData] = useState(null);
  const [expandedSectionLoading, setExpandedSectionLoading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const searchTimer = useRef(null);
  const searchSequence = useRef(0);
  const recommendationsSequence = useRef(0);
  const homeSequence = useRef(0);
  const searchInputRef = useRef(null);
  const recsOffsetRef = useRef(0);

  const authToken = authSession?.token ?? '';
  const authLabel = authSession?.label ?? authSession?.email ?? authSession?.uid ?? '';
  const authEnabled = Boolean(authToken);
  const searchHasMore = searchPage > 0 && searchPage < searchTotalPages;
  const hasSearchResults = searchResults.length > 0;
  const hasRecommendations = recommendations.length > 0;
  const recsHasMore = recsOffset + RECS_PER_PAGE < recsTotalAvailable;

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

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

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
        setAnnouncement(`Home data failed. ${error.message}`);
      }
    } finally {
      if (homeSequence.current === requestId) {
        setHomeDataLoading(false);
      }
    }
  }, [authToken]);

  const loadRecommendations = useCallback(async (append = false) => {
    if (!authToken) {
      setRecommendations([]);
      setRecommendationState({ status: 'idle', message: '', error: '', debug: null });
      return;
    }

    const requestId = ++recommendationsSequence.current;
    const offset = append ? recsOffsetRef.current : 0;

    setRecommendationsLoading(true);
    if (!append) {
      setRecommendationState({ status: 'loading', message: '', error: '', debug: null });
    }

    try {
      const data = await fetchRecommendations(authToken, append ? offset : undefined, RECS_PER_PAGE);

      if (recommendationsSequence.current !== requestId) {
        return;
      }

      let nextRecommendations = data.results ?? [];
      const total = data.totalAvailable ?? nextRecommendations.length;

      if (append) {
        // Append mode — add new items beyond current list
        recsOffsetRef.current += RECS_PER_PAGE;
        setRecsOffset(recsOffsetRef.current);
        setRecommendations((prev) => [...prev, ...nextRecommendations]);
      } else {
        recsOffsetRef.current = RECS_PER_PAGE;
        setRecsOffset(RECS_PER_PAGE);
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
        setAnnouncement(`Recommendations failed. ${error.message}`);
      }
    } finally {
      if (recommendationsSequence.current === requestId) {
        setRecommendationsLoading(false);
      }
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
      setAnnouncement(`Could not load ratings history. ${error.message}`);
    } finally {
      setUserRatingsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (activeTab === 'home' || activeTab === 'trending-full' || activeTab === 'popular-full' || activeTab === 'topRated-full') {
      void loadHomeData();
      void loadRecommendations();
    } else if (activeTab === 'discover') {
      void loadRecommendations();
    }
  }, [activeTab, loadHomeData, loadRecommendations]);

  useEffect(() => {
    if (activeTab === 'history') {
      void loadUserRatings();
    }
  }, [activeTab, loadUserRatings]);

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
          setAnnouncement(`Search failed. ${error.message}`);
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
        setAnnouncement(`Search failed. ${error.message}`);
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
        setAnnouncement(`Could not remove rating. ${error.message}`);
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
        void loadRecommendations();
      }
    } catch (error) {
      setAnnouncement(`Could not save rating. ${error.message}`);
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
      setAnnouncement(`Demo auth failed. ${error.message}`);
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
      setAnnouncement(`Firebase login failed. ${error.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthLoading(true);
      await signOutFirebase();
    } catch (error) {
      setAnnouncement(`Sign out failed. ${error.message}`);
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

  const handleLoadMoreRecs = () => {
    void loadRecommendations(true);
  };

  const toggleHeaderSearch = () => {
    setSearchIsOpen((prev) => !prev);
    if (!searchIsOpen) {
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
      return <StateCard title="Loading" tone="loading" />;
    }

    if (searchError && searchResults.length === 0) {
      return <StateCard title="Search error" message={searchError} tone="error" />;
    }

    if (!query.trim()) {
      return null;
    }

    if (!hasSearchResults) {
      return <StateCard title="No results found" message="Try a different search." tone="neutral" />;
    }

    return (
      <>
        <SectionHeader title={`Results for “${query.trim()}”`} />
        <div className={`results-grid results-grid--search${searchResults.length <= 1 ? ' results-grid--single' : ''}`} aria-label="Search results">
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
              {searchLoading ? 'Processing…' : 'Load more'}
            </button>
          ) : null}
        </div>
      </>
    );
  };

  const mainElRef = useRef(null);
  const homeColumns = useGridColumns(mainElRef);
  const homeRows = 2; // compact: 2 rows per section on home page

  // Derive expanded section key from state or route
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
    fetchHomeData(authToken, fullPageSection, loadLimit)
      .then((data) => {
        if (!cancelled) {
          setExpandedSectionData(data.results || []);
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
    } catch (err) {
      console.error('Failed to load more:', err.message);
    } finally {
      setExpandedSectionLoading(false);
    }
  }, [fullPageSection, expandedSectionLoading, expandedSectionData, homeColumns, authToken]);

  const renderHomeBody = () => {
    if (homeDataLoading && !homeData) {
      return <StateCard title="Loading" tone="loading" />;
    }

    if (homeError && !homeData) {
      return (
        <StateCard title="Couldn't load home" message={homeError} tone="error">
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
            <StateCard title="Loading" tone="loading" />
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
              <div className="results-footer">
                <button type="button" className="subtle-button" onClick={handleLoadMoreExpanded} disabled={expandedSectionLoading}>
                  {expandedSectionLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
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
        {renderMovieSection(trending, 'Trending Now', 'trending')}
        {renderMovieSection(popular, 'Popular', 'popular')}
        {renderMovieSection(topRated, 'Most Acclaimed', 'topRated')}
      </div>
    );
  };

  const renderRecommendationsBody = () => {
    if (recommendationsLoading && recommendations.length === 0) {
      return <StateCard title="Loading" tone="loading" />;
    }

    if (!authEnabled) {
      return (
        <StateCard
          title="Sign in to unlock recommendations"
          message="CineHound builds a taste profile from the films you rate, then surfaces your next favorites. Sign in or jump into the Demo session to try it instantly."
          tone="neutral"
        >
          <div className="state-card__actions">
            <button type="button" onClick={handleFirebaseLogin} disabled={authLoading}>Sign in with Google</button>
            <button type="button" className="subtle-button" onClick={handleDemoLogin} disabled={authLoading}>Try Demo</button>
          </div>
        </StateCard>
      );
    }

    if (recommendationState.status === 'error') {
      return (
        <StateCard title="Recommendations unavailable" message={recommendationState.error || 'Something went wrong while generating your recommendations.'} tone="error">
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
        <SectionHeader title="Target Lock" />
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

        <div className="results-footer">
          {recsHasMore ? (
            <button type="button" className="subtle-button" onClick={handleLoadMoreRecs} disabled={recommendationsLoading}>
              {recommendationsLoading ? 'Processing…' : 'Load more recommendations'}
            </button>
          ) : null}
        </div>
        {recommendationState.debug ? renderRecommendationDiagnostics() : null}
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
            <button type="button" onClick={handleDemoLogin} disabled={authLoading}>Try Demo</button>
          </div>
        </StateCard>
      );
    }

    if (userRatingsLoading && userRatingsHistory.length === 0) {
      return <StateCard title="Loading" tone="loading" />;
    }

    if (userRatingsError) {
      return (
        <StateCard title="Couldn't load your ratings" message={userRatingsError} tone="error">
          <div className="state-card__actions">
            <button type="button" onClick={loadUserRatings}>Retry</button>
          </div>
        </StateCard>
      );
    }

    if (userRatingsHistory.length === 0) {
      return <StateCard title="No ratings yet" message="Rate films to populate your scent trail, and they'll show up here." tone="neutral" />;
    }

    return (
      <>
        <SectionHeader title={`Your Ratings (${userRatingsHistory.length})`} />
        <div className="results-grid results-grid--history" aria-label="Your rated movies">
          {userRatingsHistory.map((movie) => {
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
      <details className="debug-panel" open={recommendationState.status === 'error'}>
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
  }, [recommendationState.debug, recommendationState.status, authSession?.uid]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <h1>CineHound</h1>
          <p className="brand-tagline" style={{ fontFamily: 'var(--font-data)', fontSize: '0.75rem', color: 'var(--ch-signal)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Tactical Recommendation Engine</p>
        </div>

        <nav className="app-nav" aria-label="Main navigation">
          <button
            type="button"
            className={activeTab === 'home' ? 'nav-tab nav-tab--active' : 'nav-tab'}
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>
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
              <div className="header-search__field">
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search movies…"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="header-search__close"
                  onClick={closeHeaderSearch}
                  aria-label="Close search"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button type="button" className="header-search__toggle" onClick={toggleHeaderSearch}>
                Search
              </button>
            )}
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {authSession ? (
            <div className="session-chip">
              <span className="session-chip__label" title={authLabel}>
                {authLabel}
              </span>
              <button
                type="button"
                className="subtle-button session-chip__action"
                onClick={handleSignOut}
                disabled={authLoading}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="auth-actions">
              <button type="button" onClick={handleFirebaseLogin} disabled={authLoading}>
                Sign in
              </button>
              <button type="button" className="subtle-button" onClick={handleDemoLogin} disabled={authLoading}>
                Demo
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main" ref={mainElRef}>
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
          {announcement}
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Imagery and movie data courtesy of{' '}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
            TMDB
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </footer>
    </div>
  );
}

export default App;
