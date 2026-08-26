function ratingToWeight(rating) {
  switch (rating) {
    case 2:
      return 1;
    case 1:
      return 0.75;
    case 0:
      return 0.2;
    case -1:
      return 0; // hidden: excluded from recs, no CF impact
    case -2:
      return -0.75;
    default:
      return 0;
  }
}

/**
 * Normalize raw unbounded scores to a 0–100 integer scale.
 *
 * Final score is a weighted blend of two independent signals:
 *
 *   1. Collaborative filtering — log(1+rawScore) against the theoretical
 *      maximum (userRatingCount), so the first few strong correlations
 *      contribute heavily while additional ones add diminishing returns.
 *
 *   2. Universal acclaim — Bayesian weighted rating
 *      (sqrt(vote_count) × vote_average), log-normalized.  This captures
 *      "millions of people rated this highly" independently of the user's
 *      rating patterns.
 *
 * The `acclaimBlend` parameter (0–1) controls how much acclaim contributes
 * versus pure CF.  At 0, you get pure collaborative filtering.  At 0.2
 * (the default), a movie with strong CF connections AND high acclaim gets
 * the best score, but a movie with only acclaim still earns a baseline.
 *
 * Results are sorted by blended score descending.
 *
 * @param {Array<{rawScore: number, vote_count: number, vote_average: number}>} scored
 * @param {number} acclaimBlend — 0–1 weight for the acclaim signal (0 = pure CF)
 * @returns {Array<{score: number}>}
 */
function normalizeScoresTo100(scored, acclaimBlend = 0) {
  if (scored.length === 0) return scored;

  // --- CF base score --------------------------------------------------------
  // Normalize against a FIXED "strong match" scale (not userRatingCount) so
  // scores don't collapse as the user rates more films. A rawScore of ~2.0
  // (roughly two or three strong neighbors) maps to ~100%.
  const CF_STRONG_MATCH = 2.0;
  const logMax = Math.log(1 + CF_STRONG_MATCH);

  // --- Acclaim score (Bayesian weighted rating) -----------------------------
  const maxWeighted = Math.max(
    1,
    ...scored.map((s) => {
      const vc = Math.max(0, Number(s.vote_count) || 0);
      const va = Number(s.vote_average) || 0;
      return Math.sqrt(vc) * va;
    }),
  );
  const logMaxWeighted = Math.log(1 + maxWeighted);

  const blend = Math.min(1, Math.max(0, acclaimBlend));
  const cfWeight = 1 - blend;

  return scored
    .map((s) => {
      const cfScore = Math.min(
        100,
        Math.round(
          (Math.log(1 + Math.max(0, s.rawScore)) / logMax) * 100,
        ),
      );

      const vc = Math.max(0, Number(s.vote_count) || 0);
      const va = Number(s.vote_average) || 0;
      const weighted = Math.sqrt(vc) * va;
      const acclaimScore = Math.min(
        100,
        Math.round((Math.log(1 + weighted) / logMaxWeighted) * 100),
      );

      return {
        ...s,
        score: Math.min(100, Math.round(cfWeight * cfScore + blend * acclaimScore)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Score content-based recommendations for a user.
 *
 * @param {object} params
 * @param {Array} params.ratings
 * @param {Array} params.metadata — must include vote_count and vote_average for acclaim scoring
 * @param {object} params.similarityMatrix
 * @param {number} params.acclaimBlend — 0–1, how much to blend universal acclaim vs pure CF
 * @returns {Array} scored & sorted recommendations
 */
export function scoreContentBasedRecommendations({
  ratings = [],
  metadata = [],
  similarityMatrix = {},
  acclaimBlend = 0,
}) {
  const ratedIds = new Set(ratings.map((rating) => String(rating.tmdb_id)));
  const candidateById = new Map(metadata.map((movie) => [String(movie.tmdb_id), movie]));
  const scores = new Map();

  for (const rating of ratings) {
    const tmdbId = String(rating.tmdb_id);
    const weight = ratingToWeight(rating.rating);
    const row = similarityMatrix[tmdbId];

    if (!row || weight === 0) {
      continue;
    }

    for (const [candidateId, similarity] of Object.entries(row)) {
      if (ratedIds.has(String(candidateId))) {
        continue;
      }

      const candidate = candidateById.get(String(candidateId));
      if (!candidate) {
        continue;
      }

      const nextScore = (scores.get(String(candidateId)) ?? 0) + similarity * weight;
      scores.set(String(candidateId), nextScore);
    }
  }

  const raw = Array.from(scores.entries())
    .map(([candidateId, rawScore]) => {
      const movie = candidateById.get(String(candidateId));
      return {
        tmdb_id: movie.tmdb_id,
        title: movie.title,
        year: movie.year || (movie.release_date || '').slice(0, 4) || '',
        release_date: movie.release_date || '',
        rawScore,
        vote_count: movie.vote_count ?? 0,
        vote_average: movie.vote_average ?? 0,
        poster_path: movie.poster_path || null,
        poster_url: movie.poster_url || null,
        popularity: movie.popularity ?? 0,
        overview: movie.overview || '',
        genres: movie.genres || [],
        directors: movie.directors || [],
        actors: movie.actors || [],
        keywords: movie.keywords || [],
        personal_rating: movie.personal_rating ?? null,
      };
    });

  const normalized = normalizeScoresTo100(raw, acclaimBlend);
  // Remove internal scoring fields from the public output
  const INTERNAL_FIELDS = new Set(['rawScore', 'vote_count', 'vote_average']);
  return normalized.map((movie) =>
    Object.fromEntries(Object.entries(movie).filter(([key]) => !INTERNAL_FIELDS.has(key))),
  );
}

/**
 * Pick a single item from a scored list using weighted random sampling.
 * Weight = score^exponent (plus a +1 floor so nothing is ever impossible).
 *
 * The exponent controls how heavily the pick favors high-match candidates:
 *   1 = linear (a 70% is only 1.2x more likely than a 60%)
 *   3 = default (a 70% is ~1.6x more likely than a 60%, and a 90% ~4.4x a 55%)
 *   higher = even more concentrated on the very best fits
 *
 * @param {Array<{score: number}>} scored - items with a numeric score
 * @param {() => number} random - injectable RNG for deterministic testing
 * @param {number} [exponent=3] - steepness of the weighting
 * @returns the picked item, or null when the list is empty
 */
export function weightedRandomPick(scored, random = Math.random, exponent = 3) {
  if (!Array.isArray(scored) || scored.length === 0) return null;

  const weights = scored.map((item) => {
    const score = Math.max(0, Number(item.score) || 0);
    return Math.pow(score, exponent) + 1;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return scored[0];

  let roll = random() * total;
  for (let index = 0; index < scored.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return scored[index];
  }

  return scored[scored.length - 1];
}
