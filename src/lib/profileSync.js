import { appConfig } from './config.js';

function getAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildUrl(path) {
  const baseUrl = appConfig.apiBaseUrl?.replace(/\/$/, '') || '';
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function requestJson(path, options = {}) {
  const { token, headers = {}, ...fetchOptions } = options;
  const url = buildUrl(path);

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(token),
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

export async function upsertProfile(payload) {
  if (!payload?.authToken || !payload?.userId) {
    return null;
  }

  return requestJson('/api/profile-sync', {
    method: 'POST',
    token: payload.authToken,
    body: JSON.stringify(payload),
  });
}
