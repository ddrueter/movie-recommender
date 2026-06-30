/**
 * refresh-hot-metadata.js
 *
 * Frequent (daily) metadata refresh for high-priority movies:
 *   - TMDB Trending (week)
 *   - TMDB Popular (top pages)
 *   - TMDB Now Playing
 *
 * Unlike the full crawl (cache-movie-metadata.js), this script targets
 * a small, high-value set of movies and updates them quickly. It runs
 * in seconds rather than minutes.
 *
 * Workflows:
 *   npm run refresh-hot          — refresh trending + popular + now-playing
 *   npm run refresh-hot:trending — refresh trending only
 *   npm run refresh-hot:popular  — refresh popular only
 *   npm run refresh-hot:now      — refresh now-playing only
 *
 * Environment:
 *   TMDB_READ_ACCESS_TOKEN       — TMDB API v4 read-access token
 *   SUPABASE_URL                 — Supabase project URL
 *   SUPABASE_SECRET_KEY          — Supabase service_role key
 *   HOT_REFRESH_STALE_DAYS       — Re-hydrate movies older than N days (default: 3)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createSupabaseClientFromEnv, hydrateMovieDetails, buildCachedMetadataRow, buildSupabaseMetadataRow, upsertMovieMetadataRows } from '../api/_lib/movie-metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TMDB_BASE = 'https://api.themoviedb.org/3';
const STALE_DAYS = Number(process.env.HOT_REFRESH_STALE_DAYS || 3);
const TRENDING_PAGES = 3;   // up to 60 trending movies
const POPULAR_PAGES = 2;    // up to 40 popular movies
const NOW_PLAYING_PAGES = 2; // up to 40 now-playing movies
const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Env loading (same pattern as cache-movie-metadata.js)
// ---------------------------------------------------------------------------

function parseEnvFile(content) {
  const entries = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equalsIndex = normalized.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = normalized.slice(0, equalsIndex).trim();
    if (!key) continue;

    let value = normalized.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) value = value.slice(0, commentIndex).trim();
    }

    entries[key] = value.replace(/\\n/g, '\n');
  }

  return entries;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  const loadedKeys = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loadedKeys.push(key);
    }
  }
  return loadedKeys;
}

function loadLocalEnv() {
  const mode = process.env.NODE_ENV || 'development';
  const candidateFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`];
  const loadedKeys = [];
  for (const fileName of candidateFiles) {
    loadedKeys.push(...loadEnvFile(path.resolve(process.cwd(), fileName)));
  }
  return { mode, loadedKeys };
}

// ---------------------------------------------------------------------------
// TMDB fetch helpers
// ---------------------------------------------------------------------------

async function fetchTmdbPages(endpoint, token, extraParams = {}, maxPages = 2) {
  const allResults = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${TMDB_BASE}${endpoint}`);
    url.searchParams.set('language', 'en-US');
    url.searchParams.set('page', String(page));
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, String(value));
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`  TMDB ${endpoint} page ${page} failed (${response.status})`);
        continue;
      }

      const payload = await response.json();
      if (Array.isArray(payload.results)) {
        allResults.push(...payload.results);
      }

      if (!payload.results || payload.results.length < 20) break;
    } catch (err) {
      console.error(`  TMDB ${endpoint} page ${page} error:`, err.message);
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Determine which movies need updating
// ---------------------------------------------------------------------------

function shouldRefresh(existingRow, staleDays) {
  if (!existingRow) return true; // Not in DB at all

  // Refresh if missing key metadata
  if (!existingRow.poster_url || !existingRow.overview) return true;
  if (!existingRow.genres || existingRow.genres.length === 0) return true;

  // Refresh if stale (older than staleDays)
  if (existingRow.updated_at) {
    const updatedAt = new Date(existingRow.updated_at).getTime();
    const staleThreshold = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    if (updatedAt < staleThreshold) return true;
  }

  // Always refresh to get latest vote counts / popularity
  // (These change frequently for trending/popular movies)
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function refreshHotMovies({ trending = true, popular = true, nowPlaying = true } = {}) {
  loadLocalEnv();

  const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!tmdbToken) {
    console.error('Missing TMDB_READ_ACCESS_TOKEN');
    process.exit(1);
  }

  const supabase = createSupabaseClientFromEnv();
  const startTime = Date.now();

  console.log('');
  console.log('=== CineHound Hot Metadata Refresh ===');
  console.log(`  Stale threshold: ${STALE_DAYS} day(s)`);
  console.log(`  Sources: ${[
    trending ? 'trending' : '',
    popular ? 'popular' : '',
    nowPlaying ? 'now-playing' : '',
  ].filter(Boolean).join(', ')}`);
  console.log('');

  // --- Collect candidate movies from TMDB ---
  const candidates = new Map(); // tmdbId -> tmdbMovie

  function addCandidates(movies, source) {
    for (const movie of movies) {
      const id = String(movie.id);
      if (!candidates.has(id)) {
        candidates.set(id, { ...movie, _source: source });
      }
    }
  }

  if (trending) {
    process.stdout.write('Fetching TMDB trending/week... ');
    const movies = await fetchTmdbPages('/trending/movie/week', tmdbToken, {}, TRENDING_PAGES);
    addCandidates(movies, 'trending');
    console.log(`${movies.length} found`);
  }

  if (popular) {
    process.stdout.write('Fetching TMDB popular... ');
    const movies = await fetchTmdbPages('/movie/popular', tmdbToken, {}, POPULAR_PAGES);
    addCandidates(movies, 'popular');
    console.log(`${movies.length} found`);
  }

  if (nowPlaying) {
    process.stdout.write('Fetching TMDB now-playing... ');
    const movies = await fetchTmdbPages('/movie/now_playing', tmdbToken, {}, NOW_PLAYING_PAGES);
    addCandidates(movies, 'now-playing');
    console.log(`${movies.length} found`);
  }

  console.log(`\nTotal unique candidates: ${candidates.size}`);

  if (candidates.size === 0) {
    console.log('Nothing to refresh.');
    return;
  }

  // --- Load existing metadata from Supabase ---
  process.stdout.write('Loading existing metadata... ');
  const candidateIds = Array.from(candidates.keys());
  const existingById = new Map();

  for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
    const batch = candidateIds.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from('movie_metadata')
      .select('tmdb_id, title, updated_at, poster_url, overview, genres')
      .in('tmdb_id', batch);
    for (const row of data || []) {
      existingById.set(String(row.tmdb_id), row);
    }
  }
  console.log(`${existingById.size} already cached`);

  // --- Determine which need hydration ---
  const toHydrate = [];
  const skipped = [];

  for (const [tmdbId, tmdbMovie] of candidates) {
    const existing = existingById.get(tmdbId);
    if (shouldRefresh(existing, STALE_DAYS)) {
      toHydrate.push(tmdbMovie);
    } else {
      skipped.push(tmdbMovie.title || tmdbId);
    }
  }

  console.log(`  To hydrate: ${toHydrate.length}`);
  console.log(`  Skipped (fresh): ${skipped.length}`);
  console.log('');

  if (toHydrate.length === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`All metadata up to date. (${elapsed}s)`);
    return;
  }

  // --- Hydrate and upsert ---
  let hydrated = 0;
  let failed = 0;
  const rows = [];

  for (const movie of toHydrate) {
    try {
      process.stdout.write(`\r  Hydrating: ${movie.title || movie.id}`.padEnd(70));
      const detailed = await hydrateMovieDetails(movie, tmdbToken);
      const row = buildCachedMetadataRow(detailed);
      rows.push(buildSupabaseMetadataRow(row));
      hydrated += 1;
    } catch (err) {
      console.error(`\n  Failed: ${movie.title || movie.id} — ${err.message}`);
      failed += 1;
    }
  }

  process.stdout.write('\r\x1b[K'); // Clear progress line

  console.log(`  Hydrated: ${hydrated}`);
  if (failed > 0) console.log(`  Failed: ${failed}`);

  // --- Upsert to Supabase ---
  if (rows.length > 0) {
    process.stdout.write(`Upserting ${rows.length} rows to Supabase... `);
    const savedCount = await upsertMovieMetadataRows(supabase, rows, BATCH_SIZE);
    console.log(`${savedCount} saved`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nComplete in ${elapsed}s — ${hydrated} refreshed, ${skipped.length} skipped, ${failed} failed.`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const mode = args[0] || 'all';

const modes = {
  all: { trending: true, popular: true, nowPlaying: true },
  trending: { trending: true, popular: false, nowPlaying: false },
  popular: { trending: false, popular: true, nowPlaying: false },
  now: { trending: false, popular: false, nowPlaying: true },
};

const config = modes[mode] || modes.all;

refreshHotMovies(config).catch((error) => {
  console.error('\nHot metadata refresh failed:', error?.message);
  process.exitCode = 1;
});
