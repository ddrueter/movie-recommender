import { createClient } from '@supabase/supabase-js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// ---------------------------------------------------------------------------
// Year-range partition helpers
// ---------------------------------------------------------------------------

/**
 * Parse a year-range specification string into an array of bucket definitions.
 *
 * Format: "START-END:strategy,START-END:strategy,..."
 *   strategy = "decade" | "5year" | "year"
 *
 * Example:
 *   "1900-1969:decade,1970-1999:5year,2000-2004:year"
 *
 * Returns [{ gte, lte, label }] where label is a human-readable name for the
 * bucket (e.g. "2020") and gte/lte are ISO date strings.
 */
export function generateYearRangeBuckets(spec) {
  if (!spec || typeof spec !== 'string') {
    // Default: a broad single bucket covering everything
    return [{ gte: '1900-01-01', lte: `${new Date().getFullYear()}-12-31`, label: 'all' }];
  }

  const buckets = [];
  const segments = spec.split(',').map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const [rangePart, strategy] = segment.split(':');
    if (!rangePart || !strategy) {
      console.warn(`[movie-metadata] invalid year-range segment: "${segment}" — skipping`);
      continue;
    }

    const dashIdx = rangePart.indexOf('-');
    if (dashIdx === -1) {
      console.warn(`[movie-metadata] invalid year range "${rangePart}" — skipping`);
      continue;
    }

    const rangeStart = Number(rangePart.slice(0, dashIdx));
    const rangeEnd = Number(rangePart.slice(dashIdx + 1));

    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
      console.warn(`[movie-metadata] non-numeric year range "${rangePart}" — skipping`);
      continue;
    }

    let step;
    if (strategy === 'decade') step = 10;
    else if (strategy === '5year') step = 5;
    else if (strategy === 'year') step = 1;
    else {
      console.warn(`[movie-metadata] unknown strategy "${strategy}" — skipping`);
      continue;
    }

    for (let y = rangeStart; y <= rangeEnd; y += step) {
      const bucketEnd = Math.min(y + step - 1, rangeEnd);
      const label = step === 1 ? String(y) : `${y}-${bucketEnd}`;
      buckets.push({
        gte: `${y}-01-01`,
        lte: `${bucketEnd}-12-31`,
        label,
      });
    }
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';

  const trimmedUrl = rawUrl.trim().replace(/\/+$/, '');
  const restV1Suffix = '/rest/v1';

  if (trimmedUrl.endsWith(restV1Suffix)) {
    console.warn('[movie-metadata] SUPABASE_URL should point to the project root, not /rest/v1. Normalizing value.');
    return trimmedUrl.slice(0, -restV1Suffix.length);
  }

  return trimmedUrl;
}

function normalizeList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  );
}

function buildTitleCandidates(movie) {
  return normalizeList([movie?.title, movie?.original_title, movie?.name]);
}

export function buildCachedMetadataRow(movie) {
  const title = buildTitleCandidates(movie)[0] || 'Untitled';
  const releaseDate = movie.release_date || movie.first_air_date || '';

  return {
    tmdb_id: String(movie.id),
    title,
    year: releaseDate.slice(0, 4) || '',
    release_date: releaseDate,
    poster_path: movie.poster_path || null,
    vote_average: movie.vote_average ?? null,
    vote_count: movie.vote_count ?? 0,
    popularity: movie.popularity ?? 0,
    overview: movie.overview || '',
    genres: normalizeList(movie.genre_names || movie.genres?.map?.((genre) => genre?.name)),
    directors: normalizeList(movie.directors),
    actors: normalizeList(movie.actors || movie.top_cast),
    keywords: normalizeList(movie.keywords),
    poster_url: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
    updated_at: new Date().toISOString(),
  };
}

export function buildSupabaseMetadataRow(movie) {
  return {
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    year: movie.year || movie.release_date?.slice?.(0, 4) || '',
    release_date: movie.release_date || '',
    poster_path: movie.poster_path || null,
    poster_url: movie.poster_url || null,
    vote_average: movie.vote_average ?? null,
    vote_count: movie.vote_count ?? 0,
    popularity: movie.popularity ?? 0,
    overview: movie.overview || '',
    genres: movie.genres,
    directors: movie.directors,
    actors: movie.actors,
    keywords: movie.keywords,
    updated_at: movie.updated_at,
  };
}

export function createSupabaseClientFromEnv() {
  const rawUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const url = normalizeSupabaseUrl(rawUrl);

  console.info('[movie-metadata] creating supabase client', {
    supabaseUrl: url ? `${url.slice(0, 16)}…` : '',
    hasSecretKey: Boolean(secretKey),
  });

  if (!url || !secretKey) {
    throw new Error('Missing SUPABASE environment variables');
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// TMDB API
// ---------------------------------------------------------------------------

/**
 * Fetch a page of movies from TMDB Discover, optionally filtered by release date.
 */
export async function fetchTmdbPage(page, token, sortBy = 'popularity.desc', { releaseDateGte, releaseDateLte } = {}) {
  if (!token) {
    throw new Error('Missing TMDB_READ_ACCESS_TOKEN');
  }

  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('sort_by', sortBy);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('include_video', 'false');
  url.searchParams.set('page', String(page));

  if (releaseDateGte) {
    url.searchParams.set('primary_release_date.gte', releaseDateGte);
  }
  if (releaseDateLte) {
    url.searchParams.set('primary_release_date.lte', releaseDateLte);
  }

  console.info('[movie-metadata] fetching TMDB discover page', { page, sortBy, releaseDateGte, releaseDateLte });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TMDB discover request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  console.info('[movie-metadata] TMDB discover page received', {
    page,
    resultCount: Array.isArray(payload.results) ? payload.results.length : 0,
    totalResults: payload.total_results,
  });

  return payload;
}

export async function hydrateMovieDetails(movie, token) {
  if (!token) {
    throw new Error('Missing TMDB_READ_ACCESS_TOKEN');
  }

  const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${movie.id}`);
  detailsUrl.searchParams.set('language', 'en-US');
  detailsUrl.searchParams.set('append_to_response', 'credits,keywords');

  console.info('[movie-metadata] hydrating movie details', { tmdbId: movie.id, title: movie.title });

  const response = await fetch(detailsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TMDB details request failed (${response.status}) for ${movie.id}: ${text.slice(0, 200)}`);
  }

  const details = await response.json();
  const cast = Array.isArray(details.credits?.cast)
    ? details.credits.cast.slice(0, 5).map((member) => member?.name).filter(Boolean)
    : [];
  const directors = Array.isArray(details.credits?.crew)
    ? details.credits.crew.filter((member) => member?.job === 'Director').map((member) => member?.name).filter(Boolean)
    : [];
  const keywords = Array.isArray(details.keywords?.keywords)
    ? details.keywords.keywords.map((keyword) => keyword?.name).filter(Boolean)
    : [];
  const genres = Array.isArray(details.genres) ? details.genres.map((genre) => genre?.name).filter(Boolean) : [];

  console.info('[movie-metadata] movie details hydrated', {
    tmdbId: movie.id,
    castCount: cast.length,
    directorCount: directors.length,
    keywordCount: keywords.length,
    genreCount: genres.length,
  });

  return {
    ...details,
    top_cast: cast,
    directors,
    keywords,
    genre_names: genres,
  };
}

// ---------------------------------------------------------------------------
// Supabase persistence
// ---------------------------------------------------------------------------

export async function loadExistingMovieMetadataRows(supabase) {
  console.info('[movie-metadata] loading existing movie metadata rows');
  const { data, error } = await supabase.from('movie_metadata').select('*');
  if (error) {
    throw error;
  }

  console.info('[movie-metadata] existing movie metadata rows loaded', { count: data?.length || 0 });
  return data || [];
}

export async function upsertMovieMetadataRows(supabase, rows, batchSize = 100) {
  let savedCount = 0;
  console.info('[movie-metadata] upserting movie metadata rows', { rowCount: rows.length, batchSize });

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    console.info('[movie-metadata] upserting batch', {
      start: index,
      end: index + batch.length - 1,
      batchSize: batch.length,
      sampleTmdbIds: batch.slice(0, 3).map((row) => row.tmdb_id),
    });

    const { error } = await supabase.from('movie_metadata').upsert(batch, { onConflict: 'tmdb_id' });

    if (error) {
      console.error('[movie-metadata] batch upsert failed, skipping batch', {
        start: index,
        end: index + batch.length - 1,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      // Continue with remaining batches instead of failing entirely
      continue;
    }

    savedCount += batch.length;
  }

  console.info('[movie-metadata] upsert complete', { savedCount });
  return savedCount;
}

// ---------------------------------------------------------------------------
// Main refresh — year-range partitioned, byte-budgeted crawler
// ---------------------------------------------------------------------------

/**
 * Estimate the JSON byte size of a cached metadata row (minified).
 */
function estimateRowBytes(row) {
  // JSON.stringify a single object wrapped in an array so the result includes
  // the comma and braces overhead; this gives a reliable per-row estimate.
  const json = JSON.stringify([row]);
  return Buffer.byteLength(json, 'utf8');
}

/**
 * Build a crawl-state tag for a bucket/sort combination so we can remember
 * how far we got.
 */
function crawlTag(bucketLabel, sortBy) {
  return `${bucketLabel}|${sortBy}`;
}

/**
 * Refresh movie metadata from TMDB discover endpoints using partitioned
 * year-range crawling with a storage byte budget.
 *
 * @param {object} options
 * @param {object} options.supabase - Supabase client
 * @param {string} options.tmdbToken - TMDB read access token
 * @param {boolean} [options.incremental=false] - Skip already-cached IDs
 * @param {number} [options.limit=100000] - Max total movies to discover (row count ceiling)
 * @param {number} [options.pagesPerBucket=50] - Max TMDB discover pages per year-range bucket
 * @param {number} [options.pages=5]  - (kept for backward compat; maps to pagesPerBucket)
 * @param {number} [options.batchSize=100] - Supabase upsert batch size
 * @param {number} [options.byteBudget=500000000] - Max bytes for local cache (~500MB)
 * @param {string} [options.yearRanges] - Spec string for generateYearRangeBuckets()
 * @param {object} [options.crawlState={}] - Saved crawl state for resumption
 * @param {function} [options.onPageProgress] - Called with (page, discovered, bucketLabel, sortLabel, byteUsage)
 * @param {string[]} [options.sorts] - TMDB discover sort orders
 */
export async function refreshMovieMetadata({
  supabase,
  tmdbToken,
  incremental = false,
  limit = 100000,
  pagesPerBucket = 50,
  pages,  // backward compat — maps to pagesPerBucket if set
  batchSize = 100,
  byteBudget = 500000000,
  yearRanges,
  crawlState = {},
  onPageProgress,
  sorts = ['popularity.desc', 'vote_count.desc', 'primary_release_date.desc', 'revenue.desc', 'vote_average.desc'],
}) {
  // Resolve pages vs pagesPerBucket (pages kept for backward compat)
  const effectivePagesPerBucket = pages != null ? pages : pagesPerBucket;

  const buckets = generateYearRangeBuckets(yearRanges);

  console.info('[movie-metadata] refresh started', {
    incremental,
    limit,
    pagesPerBucket: effectivePagesPerBucket,
    batchSize,
    byteBudget,
    bucketCount: buckets.length,
    sorts,
  });

  // Load existing Supabase records so we can skip them in incremental mode
  const existingRows = await loadExistingMovieMetadataRows(supabase);
  const existingIds = new Set(existingRows.map((row) => String(row.tmdb_id)));
  const byId = new Map(existingRows.map((row) => [String(row.tmdb_id), row]));
  let discoveredCount = 0;
  let totalBytes = 0;

  // Pre-populate byte count from existing rows (rough estimate)
  // We'll accumulate as we go for new rows.
  for (const row of existingRows) {
    totalBytes += estimateRowBytes(row);
  }

  let anyBucketReachedLimit = false;

  // Phase 1: Walk year-range buckets in reverse chronological order (newest first)
  // so the most relevant movies are collected first.
  const orderedBuckets = [...buckets].sort((a, b) => b.lte.localeCompare(a.lte));

  for (const bucket of orderedBuckets) {
    const bucketLabel = bucket.label;

    for (const sortBy of sorts) {
      const tag = crawlTag(bucketLabel, sortBy);

      // Check crawl state: skip fully completed bucket/sort combos
      if (incremental && crawlState[tag]?.completed) {
        console.info('[movie-metadata] skipping completed bucket-sort', { bucketLabel, sortBy });
        continue;
      }

      // Figure out which page to resume from
      const startPage = (crawlState[tag]?.lastPage || 0) + 1;
      if (startPage > 1) {
        console.info('[movie-metadata] resuming bucket-sort from page', { bucketLabel, sortBy, resumePage: startPage });
      }

      const sortLabel = sortBy.replace('.desc', '').replace('.asc', '');
      let lastResultCount = 20;
      let emptyPages = 0;
      let pageProcessed = startPage - 1;

      for (let page = startPage; page <= effectivePagesPerBucket && discoveredCount < limit; page += 1) {
        pageProcessed = page;
        // Check byte budget before fetching
        if (totalBytes >= byteBudget) {
          console.info('[movie-metadata] byte budget reached — stopping early', { totalBytes, byteBudget });
          anyBucketReachedLimit = true;
          break;
        }

        // Fetch discover page with date-range filters
        let payload;
        try {
          payload = await fetchTmdbPage(page, tmdbToken, sortBy, {
            releaseDateGte: bucket.gte,
            releaseDateLte: bucket.lte,
          });
        } catch (err) {
          console.error('[movie-metadata] discover page fetch failed, continuing', {
            bucketLabel,
            sortBy,
            page,
            error: err.message,
          });
          // If a page fails, keep going — don't abort the whole crawl
          emptyPages += 1;
          if (emptyPages >= 3) {
            console.warn('[movie-metadata] too many consecutive failures for bucket-sort, moving on', { bucketLabel, sortBy });
            break;
          }
          continue;
        }

        // Reset empty-pages counter on success
        emptyPages = 0;

        // If TMDB returned fewer than 20 results, this bucket/sort is exhausted
        const resultCount = Array.isArray(payload.results) ? payload.results.length : 0;
        lastResultCount = resultCount;

        if (typeof onPageProgress === 'function') {
          onPageProgress(page, discoveredCount, bucketLabel, sortLabel, totalBytes);
        }

        for (const movie of payload.results || []) {
          if (discoveredCount >= limit) break;
          if (totalBytes >= byteBudget) break;

          const tmdbId = String(movie.id);

          // Incremental mode: skip movies already cached
          if (incremental && existingIds.has(tmdbId)) {
            continue;
          }

          // Skip duplicates discovered within this same run
          if (byId.has(tmdbId)) {
            continue;
          }

          // Hydrate movie details (credits, keywords)
          let detailedMovie;
          try {
            detailedMovie = await hydrateMovieDetails(movie, tmdbToken);
          } catch (err) {
            console.error('[movie-metadata] hydration failed, skipping movie', {
              tmdbId,
              title: movie.title,
              error: err.message,
            });
            continue;
          }

          const row = buildCachedMetadataRow(detailedMovie);
          const rowBytes = estimateRowBytes(row);

          // Double-check byte budget after building
          if (totalBytes + rowBytes > byteBudget) {
            anyBucketReachedLimit = true;
            break;
          }

          byId.set(row.tmdb_id, row);
          discoveredCount += 1;
          totalBytes += rowBytes;

          if (discoveredCount <= 5 || discoveredCount % 50 === 0) {
            console.info('[movie-metadata] cached movie metadata row built', {
              discoveredCount,
              tmdbId: row.tmdb_id,
              title: row.title,
              estimatedBytes: rowBytes,
              totalBytes,
            });
          }
        }

        // If the bucket is exhausted (less than 20 results), stop early
        if (resultCount < 20) {
          console.info('[movie-metadata] bucket exhausted — less than 20 results on page', {
            bucketLabel,
            sortBy,
            page,
            resultCount,
          });
          break;
        }
      }

      // Record crawl state for this bucket/sort
      // Never set lastPage beyond what was actually processed.
      // If startPage already exceeds the allowed range, mark as completed
      // so subsequent runs skip this bucket-sort entirely.
      const alreadyPastMax = startPage > effectivePagesPerBucket;
      const exhausted = lastResultCount < 20 || alreadyPastMax;
      crawlState[tag] = {
        completed: discoveredCount >= limit || totalBytes >= byteBudget || exhausted,
        lastPage: exhausted ? effectivePagesPerBucket : pageProcessed,
        totalBytes,
        updatedAt: new Date().toISOString(),
      };

      if (discoveredCount >= limit || totalBytes >= byteBudget) {
        anyBucketReachedLimit = true;
        break;
      }
    }

    if (anyBucketReachedLimit) {
      console.info('[movie-metadata] stopping — limit or budget reached', {
        discoveredCount,
        totalBytes,
        byteBudget,
        currentBucket: bucketLabel,
      });
      break;
    }
  }

  // Final crawl state snapshot
  const finalCrawlState = { ...crawlState, _meta: { totalBytes, discoveredCount, updatedAt: new Date().toISOString() } };

  const cachedRecords = Array.from(byId.values());
  console.info('[movie-metadata] refresh prepared records', {
    existingRows: existingRows.length,
    discoveredCount,
    cachedRecords: cachedRecords.length,
    totalBytes,
    byteBudget,
  });

  // Only upsert newly discovered records, not the existing ones
  const existingIdSet = new Set(existingRows.map((r) => String(r.tmdb_id)));
  const newRecords = cachedRecords.filter((r) => !existingIdSet.has(String(r.tmdb_id)));
  const supabaseNewRows = newRecords.map(buildSupabaseMetadataRow);

  let savedCount = existingRows.length;
  if (supabaseNewRows.length > 0) {
    savedCount = await upsertMovieMetadataRows(supabase, supabaseNewRows, batchSize);
    savedCount += existingRows.length; // total = existing + newly saved
  }

  console.info('[movie-metadata] refresh finished', {
    savedCount,
    newlyDiscovered: supabaseNewRows.length,
    totalCached: cachedRecords.length,
    totalBytes,
  });

  return { cachedRecords, supabaseRecords: supabaseNewRows, savedCount, crawlState: finalCrawlState, totalBytes };
}
