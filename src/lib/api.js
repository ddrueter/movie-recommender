const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

function buildUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function getAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requestJson(path, options = {}) {
  const { token, headers = {}, ...fetchOptions } = options;
  const authHeader = getAuthHeader(token);
  const url = buildUrl(path);

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let parsedBody = null;

  if (contentType.includes('application/json') && text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    const error = new Error(parsedBody?.error || text || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.details = parsedBody?.details ?? null;
    error.debug = parsedBody?.debug ?? null;
    error.responseBody = parsedBody ?? text;
    throw error;
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${url}, received ${contentType || 'unknown content type'}: ${text.slice(0, 120)}`);
  }

  try {
    return parsedBody ?? JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${url}: ${error.message}. Response: ${text.slice(0, 120)}`);
  }
}

export async function searchMovies(query, token, page = 1) {
  if (!query.trim()) {
    return { results: [], page: 1, totalPages: 1 };
  }

  const data = await requestJson(
    `/api/search-tmdb?q=${encodeURIComponent(query)}&page=${encodeURIComponent(page)}`,
    {
      token,
    },
  );

  return {
    results: data.results ?? [],
    page: data.page ?? page,
    totalPages: data.totalPages ?? 1,
  };
}

export async function saveRating({ authToken, tmdbId, rating }) {
  return requestJson('/api/ratings', {
    method: 'POST',
    token: authToken,
    body: JSON.stringify({ tmdbId, rating }),
  });
}

export async function syncProfile(payload) {
  if (!payload?.authToken || !payload?.userId) {
    return null;
  }

  return requestJson('/api/profile-sync', {
    method: 'POST',
    token: payload.authToken,
    body: JSON.stringify(payload),
  });
}

export async function fetchRecommendations(token, offset, limit, mode, exclude) {
  const params = new URLSearchParams();
  if (offset != null) params.set('offset', String(offset));
  if (limit != null) params.set('limit', String(limit));
  if (mode) params.set('mode', mode);
  if (exclude && exclude.length > 0) params.set('exclude', exclude.join(','));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestJson(`/api/recommendations${suffix}`, { token });
}

export async function fetchHomeData(token, section, limit) {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (limit) params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestJson(`/api/home${suffix}`, { token });
}

export async function fetchUserRatings(token) {
  return requestJson('/api/user-ratings', { token });
}
