import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';

const TMDB_TRENDING_URL = 'https://api.themoviedb.org/3/trending/movie/week';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TRENDING_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Trending changes slowly (weekly); cache the raw TMDB list so repeated home
// loads don't pay a network round-trip every time.
let trendingCache = { pages: [], fetchedAt: 0 };

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const section = url.searchParams.get('section'); // 'trending' | 'popular' | 'topRated' — single-section mode
  const limit = Math.min(Number(url.searchParams.get('limit') || 0) || 0, 100); // 0 = default

  // Home page does not require auth — shows trending/popular/top-rated movies to everyone
  const supabase = createSupabaseClient();

  // --- 1. Fetch TMDB trending (cached for 10 min) ---
  let trendingRaw = [];
  const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (tmdbToken) {
    const cacheFresh = Date.now() - trendingCache.fetchedAt < TRENDING_CACHE_TTL_MS;
    if (cacheFresh && trendingCache.pages.length > 0) {
      trendingRaw = trendingCache.pages;
    } else {
      // Fetch up to 3 pages of trending when limit > 20
      const trendingPages = (limit > 0 && limit > 20) ? Math.min(3, Math.ceil(limit / 20)) : 1;
      const fetched = [];
      for (let page = 1; page <= trendingPages; page += 1) {
        try {
          const tmdbUrl = new URL(TMDB_TRENDING_URL);
          tmdbUrl.searchParams.set('language', 'en-US');
          tmdbUrl.searchParams.set('page', String(page));
          const tmdbResponse = await fetch(tmdbUrl, {
            headers: { Authorization: `Bearer ${tmdbToken}`, Accept: 'application/json' },
          });
          if (tmdbResponse.ok) {
            const payload = await tmdbResponse.json();
            if (Array.isArray(payload.results)) {
              fetched.push(...payload.results);
            }
            if (!payload.results || payload.results.length < 20) break;
          }
        } catch (err) {
          console.error(`[home] TMDB trending page ${page} failed:`, err.message);
        }
      }
      if (fetched.length > 0) {
        trendingCache = { pages: fetched, fetchedAt: Date.now() };
        trendingRaw = fetched;
      }
    }
  }

  // --- 2. Fetch popular & top-rated from our Supabase cache ---
  const dbLimit = section && limit > 0 ? limit : (section ? 100 : 18);
  const topRatedDbLimit = section && limit > 0 ? limit : (section ? 200 : 50);

  const needPopular = !section || section === 'popular';
  const needTopRated = !section || section === 'topRated';

  const [popularResult, topRatedResult] = await Promise.all([
    needPopular
      ? supabase.from('movie_metadata').select('*').order('popularity', { ascending: false }).limit(dbLimit)
      : { data: [] },
    needTopRated
      ? supabase.from('movie_metadata').select('*').order('vote_count', { ascending: false }).limit(topRatedDbLimit)
      : { data: [] },
  ]);

  // --- 3. Enrich trending movies with our cached metadata ---
  const trendingIds = (section === 'trending' || !section) ? trendingRaw.map((m) => String(m.id)) : [];
  const trendingMetaById = new Map();

  if (trendingIds.length > 0) {
    const BATCH_SIZE = 20;
    for (let i = 0; i < trendingIds.length; i += BATCH_SIZE) {
      const batch = trendingIds.slice(i, i + BATCH_SIZE);
      const { data } = await supabase
        .from('movie_metadata')
        .select('*')
        .in('tmdb_id', batch);
      for (const row of data || []) {
        trendingMetaById.set(String(row.tmdb_id), row);
      }
    }
  }

  // --- 4. Load user's personal ratings for annotation (optional auth) ---
  let ratingsByTmdbId = new Map();
  try {
    const token = getBearerToken(request);
    if (token) {
      const decoded = await verifyFirebaseToken(token);
      const userId = String(decoded?.uid || '').trim();
      if (userId) {
        const ratingsResult = await supabase
          .from('ratings')
          .select('tmdb_id, rating')
          .eq('user_id', userId);
        const userRatings = ratingsResult.data || [];
        ratingsByTmdbId = new Map(userRatings.map((r) => [String(r.tmdb_id), r.rating]));
      }
    }
  } catch {
    // Auth is optional; proceed without personal ratings
  }

  function annotateWithPersonalRating(movie) {
    const rating = ratingsByTmdbId.get(String(movie.tmdb_id));
    return { ...movie, personal_rating: rating ?? null };
  }

  // Build trending: use cached metadata when available, fall back to minimal TMDB data
  const trending = trendingRaw
    .map((tmdbMovie) => {
      const meta = trendingMetaById.get(String(tmdbMovie.id));
      if (meta) {
        // The cache may predate a recent release's votes (cached when
        // vote_count was still 0). Prefer the fresh TMDB payload's rating
        // when the cached one is missing/stale so it never shows "NR".
        const staleVotes = meta.vote_average == null || Number(meta.vote_count) <= 0;
        return annotateWithPersonalRating({
          ...meta,
          vote_average: staleVotes && tmdbMovie.vote_average != null ? tmdbMovie.vote_average : meta.vote_average,
          vote_count: staleVotes && tmdbMovie.vote_count != null ? tmdbMovie.vote_count : meta.vote_count,
        });
      }

      return {
        tmdb_id: String(tmdbMovie.id),
        title: tmdbMovie.title || tmdbMovie.original_title || 'Untitled',
        year: (tmdbMovie.release_date || '').slice(0, 4) || '',
        release_date: tmdbMovie.release_date || '',
        poster_path: tmdbMovie.poster_path || null,
        poster_url: tmdbMovie.poster_path ? `${TMDB_IMAGE_BASE}${tmdbMovie.poster_path}` : null,
        vote_average: tmdbMovie.vote_average ?? null,
        vote_count: tmdbMovie.vote_count ?? 0,
        popularity: tmdbMovie.popularity ?? 0,
        overview: tmdbMovie.overview || '',
        genres: [],
        directors: [],
        actors: [],
        keywords: [],
        personal_rating: ratingsByTmdbId.get(String(tmdbMovie.id)) ?? null,
      };
    })
    .slice(0, limit > 0 ? limit : 20);

  const popular = (popularResult.data || []).map(annotateWithPersonalRating).slice(0, limit > 0 ? limit : 16);

  // Bayesian-inspired weighted rating: sqrt(vote_count) * vote_average
  // Stable sort: secondary on vote_count, tertiary on tmdb_id for deterministic order
  const topRated = (topRatedResult.data || [])
    .map((m) => ({
      ...m,
      weighted_rating: Math.sqrt(Math.max(0, Number(m.vote_count ?? 0))) * Number(m.vote_average ?? 0),
    }))
    .sort((a, b) => b.weighted_rating - a.weighted_rating
      || (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0)
      || String(a.tmdb_id).localeCompare(String(b.tmdb_id)))
    .map(annotateWithPersonalRating)
    .slice(0, limit > 0 ? limit : 16);

  // If TMDB was unreachable, fall back to the cached popular list so all
  // three home sections still render.
  const trendingFinal = trending.length > 0 ? trending : popular;

  if (section) {
    const sectionData = { trending: trendingFinal, popular, topRated };
    return response.status(200).json({ results: sectionData[section] || [] });
  }

  response.status(200).json({ trending: trendingFinal, popular, topRated });
}