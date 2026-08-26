const TMDB_RESULT_LIMIT = 20;

function mapMovieResult(movie) {
  return {
    id: movie.id,
    title: movie.title || movie.original_title || movie.name || 'Untitled',
    original_title: movie.original_title || movie.title || movie.name || 'Untitled',
    year: (movie.release_date || movie.first_air_date || '').slice(0, 4) || '',
    release_date: movie.release_date || movie.first_air_date || '',
    poster_path: movie.poster_path || null,
    overview: movie.overview || '',
    vote_average: movie.vote_average ?? null,
    vote_count: movie.vote_count ?? 0,
    popularity: movie.popularity ?? 0,
    original_language: movie.original_language || '',
  };
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

function getSearchScore(movie, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const searchFields = [normalizeText(movie.title), normalizeText(movie.original_title)].filter(Boolean);
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
  const popularity = Math.max(0, Number(movie.popularity ?? 0));
  const voteAverage = Math.max(0, Number(movie.vote_average ?? 0));
  const voteCount = Math.max(0, Number(movie.vote_count ?? 0));

  return Math.log1p(voteCount) * 220 + Math.log1p(popularity) * 120 + voteAverage * 40;
}

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const query = url.searchParams.get('q') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const hasTmdbReadAccessToken = Boolean(process.env.TMDB_READ_ACCESS_TOKEN);

  console.info('[search-tmdb] incoming request', {
    queryLength: query.trim().length,
    page,
    hasTmdbReadAccessToken,
  });

  if (!query.trim()) {
    console.info('[search-tmdb] empty query, returning no results');
    response.status(200).json({ results: [], page: 1, totalPages: 1 });
    return;
  }

  const tmdbReadAccessToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!tmdbReadAccessToken) {
    console.error('[search-tmdb] missing TMDB_READ_ACCESS_TOKEN');
    response.status(500).json({ error: 'Missing TMDB_READ_ACCESS_TOKEN' });
    return;
  }

  const tmdbUrl = new URL('https://api.themoviedb.org/3/search/movie');
  tmdbUrl.searchParams.set('query', query.trim());
  tmdbUrl.searchParams.set('include_adult', 'false');
  tmdbUrl.searchParams.set('language', 'en-US');
  tmdbUrl.searchParams.set('page', String(page));
  tmdbUrl.searchParams.set('vote_count.gte', '1');

  console.info('[search-tmdb] fetching TMDB', {
    url: tmdbUrl.toString(),
  });

  const tmdbResponse = await fetch(tmdbUrl, {
    headers: {
      Authorization: `Bearer ${tmdbReadAccessToken}`,
      Accept: 'application/json',
    },
  });

  const responseText = await tmdbResponse.text();
  console.info('[search-tmdb] TMDB response received', {
    status: tmdbResponse.status,
    contentType: tmdbResponse.headers.get('content-type') || 'unknown',
    responsePreview: responseText.slice(0, 160),
  });

  if (!tmdbResponse.ok) {
    response.status(tmdbResponse.status).json({
      error: 'TMDB search request failed',
      details: responseText,
    });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    console.error('[search-tmdb] invalid TMDB JSON', { error: error.message });
    response.status(502).json({
      error: 'TMDB returned invalid JSON',
      details: responseText.slice(0, 160),
    });
    return;
  }

  const scoredResults = (Array.isArray(payload.results) ? payload.results : [])
    .map(mapMovieResult)
    .sort((a, b) => {
      const relevanceDiff = getSearchScore(b, query) - getSearchScore(a, query);
      if (relevanceDiff !== 0) return relevanceDiff;

      const engagementDiff = getEngagementScore(b) - getEngagementScore(a);
      if (engagementDiff !== 0) return engagementDiff;

      const voteAverageDiff = Number(b.vote_average ?? 0) - Number(a.vote_average ?? 0);
      if (voteAverageDiff !== 0) return voteAverageDiff;

      return String(a.title).localeCompare(String(b.title));
    });

  const totalResults = Number(payload.total_results ?? scoredResults.length);
  const totalPages = Math.max(1, Math.ceil(totalResults / TMDB_RESULT_LIMIT));
  const results = scoredResults.slice(0, TMDB_RESULT_LIMIT);

  console.info('[search-tmdb] responding', {
    query: query.trim(),
    page,
    resultCount: results.length,
    totalPages,
  });

  response.status(200).json({ results, page, totalPages });
}
