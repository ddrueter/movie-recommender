import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('userId') || 'demo-user';

  // Home page does not require auth — shows popular/top-rated movies to everyone
  const supabase = createSupabaseClient();

  const [popularResult, topRatedResult] = await Promise.all([
    supabase
      .from('movie_metadata')
      .select('*')
      .order('popularity', { ascending: false })
      .limit(18),
    supabase
      .from('movie_metadata')
      .select('*')
      .order('vote_count', { ascending: false })
      .limit(50), // fetch extra for weighted scoring
  ]);

  // If authenticated, also load user's personal ratings for annotation
  let ratingsByTmdbId = new Map();
  try {
    const token = getBearerToken(request);
    if (token) {
      await verifyFirebaseToken(token);
      const supabaseWithKey = createSupabaseClient();
      // Only load ratings for this specific user, not all ratings
      const ratingsResult = await supabaseWithKey
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

  const popular = (popularResult.data || []).map(annotateWithPersonalRating).slice(0, 16);

  // Bayesian-inspired weighted rating: sqrt(vote_count) * vote_average
  // Rewards high ratings that have many votes
  const topRated = (topRatedResult.data || [])
    .map((m) => ({
      ...m,
      weighted_rating: Math.sqrt(Math.max(0, Number(m.vote_count ?? 0))) * Number(m.vote_average ?? 0),
    }))
    .sort((a, b) => b.weighted_rating - a.weighted_rating)
    .map(annotateWithPersonalRating)
    .slice(0, 16);

  response.status(200).json({ popular, topRated, userId });
}