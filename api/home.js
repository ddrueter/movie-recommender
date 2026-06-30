import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';

const TMDB_TRENDING_URL = 'https://api.themoviedb.org/3/trending/movie/week';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('userId') || 'demo-user';
  const section = url.searchParams.get('section'); // 'trending' | 'popular' | 'topRated' — single-section mode
  const limit = Math.min(Number(url.searchParams.get('limit') || 0) || 0, 100); // 0 = default

  // Home page does not require auth — shows trending/popular/top-rated movies to everyone
  const supabase = createSupabaseClient();

  // --- 1. Fetch TMDB trending (real-time, from TMDB trending endpoint) ---
  let trendingRaw = [];
  const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (tmdbToken) {
    try {
      const tmdbUrl = new URL(TMDB_TRENDING_URL);
      tmdbUrl.searchParams.set('language', 'en-US');
      const tmdbResponse = await fetch(tmdbUrl, {
        headers: { Authorization: `Bearer ${tmdbToken}`, Accept: 'application/json' },
      });
      if (tmdbResponse.ok) {
        const payload = await tmdbResponse.json();
        trendingRaw = payload.results || [];
      }
    } catch (err) {
      console.error('[home] TMDB trending fetch failed:', err.message);
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

  // --- 4. Load user's personal ratings for annotation ---
  let ratingsByTmdbId = new Map();
  try {
    const token = getBearerToken(request);
    if (token) {
      await verifyFirebaseToken(token);
      const ratingsResult = await supabase
        .from('ratings')
        .select('tmdb_id, rating')
        .eq('user_id', userId);
      const userRatings = ratingsResult.data || [];
      ratingsByTmdbId = new Map(userRatings.map((r) => [String(r.tmdb_id), r.rating]));
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
      if (meta) return annotateWithPersonalRating(meta);

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
  const topRated = (topRatedResult.data || [])
    .map((m) => ({
      ...m,
      weighted_rating: Math.sqrt(Math.max(0, Number(m.vote_count ?? 0))) * Number(m.vote_average ?? 0),
    }))
    .sort((a, b) => b.weighted_rating - a.weighted_rating)
    .map(annotateWithPersonalRating)
    .slice(0, limit > 0 ? limit : 16);

  if (section) {
    const sectionData = { trending, popular, topRated };
    return response.status(200).json({ results: sectionData[section] || [], userId });
  }

  response.status(200).json({ trending, popular, topRated, userId });
}