import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';
import { scoreContentBasedRecommendations } from './_lib/content-recs.js';
import { getStaticMatrixPath, loadStaticSimilarityMatrix } from './_lib/blob.js';

const METADATA_BATCH_SIZE = 100;

/**
 * Load movie_metadata rows for a specific set of tmdb_ids.
 */
async function loadMetadataForIds(supabase, ids) {
  if (ids.length === 0) return [];

  const allRows = [];
  for (let i = 0; i < ids.length; i += METADATA_BATCH_SIZE) {
    const batch = ids.slice(i, i + METADATA_BATCH_SIZE);
    const { data, error } = await supabase
      .from('movie_metadata')
      .select('*')
      .in('tmdb_id', batch);

    if (error) {
      console.error('[recommendations] metadata batch query failed', {
        batchStart: i,
        batchSize: batch.length,
        error: error.message,
      });
      continue;
    }

    if (data) allRows.push(...data);
  }

  return allRows;
}

function normalizeMetadataRow(movie) {
  return {
    ...movie,
    year: movie.year || movie.release_date?.slice?.(0, 4) || '',
    release_date: movie.release_date || '',
    poster_path: movie.poster_path || null,
    poster_url: movie.poster_url || null,
    vote_average: movie.vote_average ?? null,
    vote_count: movie.vote_count ?? 0,
    popularity: movie.popularity ?? 0,
    overview: movie.overview || '',
    genres: movie.genres || [],
    directors: movie.directors || [],
    actors: movie.actors || [],
    keywords: movie.keywords || [],
    personal_rating: movie.personal_rating ?? null,
  };
}

/**
 * Collect candidate tmdb_ids from the similarity matrix.
 * Excludes movies the user has already rated.
 */
function collectCandidateIds(matrix, userRatingIds) {
  const ratedSet = new Set(userRatingIds.map(String));
  const candidateSet = new Set();

  for (const ratedId of ratedSet) {
    const row = matrix[ratedId];
    if (!row) continue;

    for (const candidateId of Object.keys(row)) {
      if (!ratedSet.has(candidateId)) {
        candidateSet.add(candidateId);
      }
    }
  }

  return [...candidateSet];
}

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const userId = url.searchParams.get('userId') || 'demo-user';
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 24));
  const acclaimBlend = Math.min(1, Math.max(0, Number(process.env.RECS_POPULARITY_WEIGHT) || 0.35));

  const debug = {
    userId,
    userRatingsCount: 0,
    candidateIdsFromMatrix: 0,
    metadataLoaded: 0,
    matrixLoaded: false,
    matrixPath: getStaticMatrixPath(),
    resultCount: 0,
    totalAvailable: 0,
    offset,
    limit,
    acclaimBlend,
    notes: [],
  };

  try {
    await verifyFirebaseToken(getBearerToken(request));
  } catch (error) {
    response.status(401).json({ error: error.message, debug: { ...debug, notes: [...debug.notes, 'Auth rejected before recommendation lookup.'] } });
    return;
  }

  const supabase = createSupabaseClient();

  // Step 1: Load user ratings
  const ratingsResult = await supabase
    .from('ratings')
    .select('*')
    .eq('user_id', userId);

  if (ratingsResult.error) {
    response.status(500).json({
      error: 'Failed to load user ratings',
      details: { ratings: ratingsResult.error.message },
      debug: { ...debug, notes: [...debug.notes, `ratings query failed: ${ratingsResult.error.message}`] },
    });
    return;
  }

  const userRatings = ratingsResult.data || [];
  const userRatedIds = new Set(userRatings.map((r) => String(r.tmdb_id)));
  debug.userRatingsCount = userRatings.length;

  // Step 2: Load similarity matrix
  let matrix = {};
  try {
    matrix = (await loadStaticSimilarityMatrix()) || {};
    debug.matrixLoaded = Boolean(matrix && Object.keys(matrix).length > 0);
  } catch (error) {
    debug.notes.push(`static similarity matrix load failed: ${error.message}`);
    console.warn('[recommendations] Failed to load static similarity matrix', {
      path: getStaticMatrixPath(),
      error: error.message,
    });
  }

  // Step 3: Collect candidate IDs from similarity matrix
  const candidateIds = debug.matrixLoaded
    ? collectCandidateIds(matrix, [...userRatedIds])
    : [];
  debug.candidateIdsFromMatrix = candidateIds.length;

  // Step 4: Load metadata only for candidates
  const metadata = await loadMetadataForIds(supabase, candidateIds);
  debug.metadataLoaded = metadata.length;

  const normalizedMetadata = metadata.map(normalizeMetadataRow);
  const ratingsByMovieId = new Map(userRatings.map((rating) => [String(rating.tmdb_id), rating.rating]));

  // Step 5: Score
  const results = userRatings.length > 0 && normalizedMetadata.length > 0
    ? scoreContentBasedRecommendations({
        ratings: userRatings,
        metadata: normalizedMetadata,
        similarityMatrix: matrix,
        acclaimBlend,
      }).map((movie) => ({
        ...movie,
        personal_rating: ratingsByMovieId.get(String(movie.tmdb_id)) ?? movie.personal_rating ?? null,
      }))
    : [];

  debug.totalAvailable = results.length;

  // Apply pagination
  const pagedResults = results.slice(offset, offset + limit);
  debug.resultCount = pagedResults.length;
  debug.offset = offset;
  debug.limit = limit;

  if (!userRatings.length) {
    debug.notes.push('No ratings found; no recommendations available.');
  }
  if (!matrix || Object.keys(matrix).length === 0) {
    debug.notes.push('Similarity matrix is empty or missing; no content-based scoring was possible.');
  }
  if (results.length === 0) {
    debug.notes.push('No recommendation cards could be produced from the available data.');
  }

  response.status(200).json({
    userId,
    matrixLoaded: debug.matrixLoaded,
    matrixPath: debug.matrixPath,
    results: pagedResults,
    totalAvailable: results.length,
    acclaimBlend,
    debug,
  });
}
