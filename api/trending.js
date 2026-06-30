import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';
import { hydrateMovieDetails, buildCachedMetadataRow, buildSupabaseMetadataRow, upsertMovieMetadataRows } from './_lib/movie-metadata.js';

const TMDB_TRENDING_URL = 'https://api.themoviedb.org/3/trending/movie/week';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TRENDING_PAGES = 3; // 3 pages × 20 = up to 60 trending movies

/**
 * GET /api/trending
 *
 * Fetches the current trending movies from TMDB's trending endpoint,
 * enriches them with metadata from our Supabase cache, and falls back
 * to live TMDB details for any movies not yet in our database.
 *
 * Query params:
 *   userId  - (optional) Firebase user ID for personal rating annotation
 *   limit   - (optional) max results to return (default: 20)
 */
export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('userId') || 'demo-user';
  const limit = Math.min(Number(url.searchParams.get('limit') || 20), 60);

  const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!tmdbToken) {
    return response.status(500).json({ error: 'TMDB_READ_ACCESS_TOKEN not configured' });
  }

  const supabase = createSupabaseClient();

  // --- 1. Fetch trending movies from TMDB ---
  const trendingMovies = [];
  for (let page = 1; page <= TRENDING_PAGES; page += 1) {
    try {
      const tmdbUrl = new URL(TMDB_TRENDING_URL);
      tmdbUrl.searchParams.set('language', 'en-US');
      tmdbUrl.searchParams.set('page', String(page));

      const tmdbResponse = await fetch(tmdbUrl, {
        headers: {
          Authorization: `Bearer ${tmdbToken}`,
          Accept: 'application/json',
        },
      });

      if (!tmdbResponse.ok) {
        console.error(`[trending] TMDB trending page ${page} failed (${tmdbResponse.status})`);
        continue;
      }

      const payload = await tmdbResponse.json();
      if (Array.isArray(payload.results)) {
        trendingMovies.push(...payload.results);
      }

      // Stop early if TMDB returned fewer than 20 results
      if (!payload.results || payload.results.length < 20) break;
    } catch (err) {
      console.error(`[trending] TMDB trending page ${page} error:`, err.message);
    }
  }

  if (trendingMovies.length === 0) {
    return response.status(502).json({ error: 'Failed to fetch trending movies from TMDB' });
  }

  // --- 2. Load our cached metadata for these movies ---
  const tmdbIds = trendingMovies.map((m) => String(m.id));
  const metadataById = new Map();

  // Batch-load from Supabase
  const BATCH_SIZE = 50;
  const missingIds = [];

  for (let i = 0; i < tmdbIds.length; i += BATCH_SIZE) {
    const batch = tmdbIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('movie_metadata')
      .select('*')
      .in('tmdb_id', batch);

    if (error) {
      console.error('[trending] metadata batch query failed:', error.message);
      // Treat all in batch as missing
      for (const id of batch) missingIds.push(id);
      continue;
    }

    const foundIds = new Set((data || []).map((r) => String(r.tmdb_id)));
    for (const row of data || []) {
      metadataById.set(String(row.tmdb_id), row);
    }
    for (const id of batch) {
      if (!foundIds.has(id)) missingIds.push(id);
    }
  }

  // --- 3. Hydrate & cache any movies not in our database ---
  const toCache = [];
  if (missingIds.length > 0) {
    console.info(`[trending] hydrating ${missingIds.length} uncached trending movies`);

    for (const tmdbId of missingIds) {
      const tmdbMovie = trendingMovies.find((m) => String(m.id) === tmdbId);
      if (!tmdbMovie) continue;

      try {
        const detailed = await hydrateMovieDetails(tmdbMovie, tmdbToken);
        const row = buildCachedMetadataRow(detailed);
        metadataById.set(row.tmdb_id, row);
        toCache.push(buildSupabaseMetadataRow(row));
      } catch (err) {
        console.error(`[trending] hydration failed for ${tmdbId} (${tmdbMovie.title}):`, err.message);
        // Build a minimal row from the trending payload so the movie still shows up
        const minimalRow = {
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
          updated_at: new Date().toISOString(),
        };
        metadataById.set(minimalRow.tmdb_id, minimalRow);
        toCache.push(minimalRow);
      }
    }

    // Persist newly cached movies to Supabase (fire-and-forget)
    if (toCache.length > 0) {
      upsertMovieMetadataRows(supabase, toCache, 50).catch((err) => {
        console.error('[trending] background cache upsert failed:', err.message);
      });
    }
  }

  // --- 4. Load personal ratings if authenticated ---
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
    // Auth is optional
  }

  // --- 5. Build final response ---
  const results = trendingMovies
    .map((tmdbMovie) => {
      const meta = metadataById.get(String(tmdbMovie.id));
      if (!meta) {
        // Shouldn't happen, but return minimal TMDB data as fallback
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
      }

      return {
        ...meta,
        personal_rating: ratingsByTmdbId.get(String(meta.tmdb_id)) ?? null,
      };
    })
    .slice(0, limit);

  response.status(200).json({ results });
}
