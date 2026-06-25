import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';

const BATCH_SIZE = 50;

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('userId') || 'demo-user';

  try {
    await verifyFirebaseToken(getBearerToken(request));
  } catch (error) {
    response.status(401).json({ error: error.message });
    return;
  }

  const supabase = createSupabaseClient();

  // Step 1: Load only the current user's ratings (no metadata yet)
  const ratingsResult = await supabase
    .from('ratings')
    .select('*')
    .eq('user_id', userId);

  if (ratingsResult.error) {
    response.status(500).json({ error: ratingsResult.error.message });
    return;
  }

  const userRatings = ratingsResult.data || [];

  // Step 2: Collect unique tmdb_ids from the user's ratings
  const ratedTmdbIds = [...new Set(userRatings.map((r) => String(r.tmdb_id)))];

  // Step 3: Fetch metadata only for the movies this user has rated,
  //         using batched queries to avoid oversized responses.
  const metadataById = new Map();
  for (let i = 0; i < ratedTmdbIds.length; i += BATCH_SIZE) {
    const batch = ratedTmdbIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('movie_metadata')
      .select('*')
      .in('tmdb_id', batch);

    if (error) {
      console.error('[user-ratings] metadata batch query failed', {
        batchStart: i,
        batchSize: batch.length,
        error: error.message,
      });
      // Continue with partial results instead of failing entirely
      continue;
    }

    for (const movie of data || []) {
      metadataById.set(String(movie.tmdb_id), movie);
    }
  }

  // Step 4: Build the response — movies the user hasn't rated get empty metadata
  const results = userRatings
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((rating) => {
      const meta = metadataById.get(String(rating.tmdb_id)) || {};
      return {
        tmdb_id: rating.tmdb_id,
        title: meta.title || 'Unknown',
        year: meta.year || '',
        release_date: meta.release_date || '',
        poster_path: meta.poster_path || null,
        poster_url: meta.poster_url || null,
        vote_average: meta.vote_average ?? null,
        vote_count: meta.vote_count ?? 0,
        popularity: meta.popularity ?? 0,
        overview: meta.overview || '',
        genres: meta.genres || [],
        directors: meta.directors || [],
        actors: meta.actors || [],
        keywords: meta.keywords || [],
        personal_rating: rating.rating,
        rated_at: rating.created_at,
      };
    });

  response.status(200).json({ results, userId });
}