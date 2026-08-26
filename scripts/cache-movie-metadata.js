import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createSupabaseClientFromEnv, refreshMovieMetadata } from '../api/_lib/movie-metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, 'output/movie_metadata.json');
const crawlStatePath = path.resolve(__dirname, 'output/.crawl-state.json');

// These defaults are read at module-load time before .env is loaded.
// They will be re-resolved inside loadAndSave() after loadLocalEnv() runs.
let TMDB_METADATA_LIMIT = 100000;
let TMDB_PAGES_PER_BUCKET = 50;
let SUPABASE_BATCH_SIZE = 100;
let TMDB_BYTE_BUDGET = 450000000; // ~450MB (leaving headroom under 500MB)
let TMDB_YEAR_RANGES = '';

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
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    entries[key] = value.replace(/\\n/g, '\n');
  }

  return entries;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

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
    const filePath = path.resolve(process.cwd(), fileName);
    loadedKeys.push(...loadEnvFile(filePath));
  }

  return {
    mode,
    candidateFiles,
    loadedKeys,
  };
}

// Track progress for graceful shutdown
let shutdownRequested = false;
let supabaseClient = null;
let savedRecords = [];

// Whether we've suppressed console.info (so we know to restore it)
let infoSuppressed = false;
let originalConsoleInfo = null;

// Current movie title for progress display
let currentMovieTitle = '';

// TMDB discover sorts to cycle through for maximum coverage
// Each sort gives a different 10k movie set with minimal overlap
const DISCOVER_SORTS = [
  'popularity.desc',
  'vote_count.desc',
  'primary_release_date.desc',
  'revenue.desc',
  'vote_average.desc',
];

// Write a single-line progress bar that updates in place
function writeProgress(page, discovered, limit, bucketLabel, sortLabel, byteUsage, byteBudget) {
  if (shutdownRequested) return;
  const pct = limit > 0 ? Math.round((discovered / limit) * 100) : 0;
  const barWidth = 20;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  const bucketInfo = bucketLabel ? ` [${bucketLabel}]` : '';
  const sortInfo = sortLabel ? ` ${sortLabel}` : '';
  const movieInfo = currentMovieTitle ? ` | ${currentMovieTitle.slice(0, 35)}` : '';
  const countInfo = ` (${discovered}/${limit})`;

  // Show byte usage if budget is set
  let byteInfo = '';
  if (byteBudget > 0) {
    const usedMb = (byteUsage / (1024 * 1024)).toFixed(1);
    const budgetMb = (byteBudget / (1024 * 1024)).toFixed(1);
    byteInfo = ` ${usedMb}/${budgetMb}MB`;
  }

  process.stdout.write(
    `\r${bar} ${pct}%${countInfo}${byteInfo}${bucketInfo}${sortInfo}${movieInfo}`
  );
  // Force flush the output buffer so the progress bar is visible immediately
  if (process.stdout._handle && typeof process.stdout._handle.setBlocking === 'function') {
    process.stdout._handle.setBlocking(true);
  }
}

async function resolveConfig() {
  // Re-resolve from env vars after .env is loaded
  TMDB_METADATA_LIMIT = Number(process.env.TMDB_METADATA_LIMIT || 100000);
  TMDB_PAGES_PER_BUCKET = Number(process.env.TMDB_PAGES_PER_BUCKET || 50);
  SUPABASE_BATCH_SIZE = Number(process.env.SUPABASE_BATCH_SIZE || 100);
  TMDB_BYTE_BUDGET = Number(process.env.TMDB_BYTE_BUDGET || 450000000);
  TMDB_YEAR_RANGES = process.env.TMDB_YEAR_RANGES || '';
}

function isIncremental() {
  return process.env.INCREMENTAL === 'true' || process.env.INCREMENTAL === '1';
}

function loadCrawlState() {
  try {
    if (fs.existsSync(crawlStatePath)) {
      const raw = fs.readFileSync(crawlStatePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[cache-movie-metadata] could not load crawl state, starting fresh', err.message);
  }
  return {};
}

function saveCrawlState(state) {
  try {
    fs.mkdirSync(path.dirname(crawlStatePath), { recursive: true });
    fs.writeFileSync(crawlStatePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[cache-movie-metadata] could not save crawl state', err.message);
  }
}

async function loadAndSave() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  loadLocalEnv();
  resolveConfig();  // Re-read after .env is loaded
  const incremental = isIncremental();

  const startTime = Date.now();


  // Install console.info override BEFORE creating the supabase client,
  // so all metadata module messages are captured from the start.
  originalConsoleInfo = console.info;
  infoSuppressed = true;
  console.info = (...args) => {
    const msg = args.join(' ');
    // Capture current movie title from progress messages
    if (msg.includes('cached movie metadata row built')) {
      try {
        const titleMatch = msg.match(/"title":\s*"([^"]+)"/);
        if (titleMatch) {
          currentMovieTitle = titleMatch[1];
        }
      } catch {
        // ignore parse errors
      }
      return;
    }
    // Let script-level startup/completion messages pass through
    if (msg.startsWith('[cache-movie-metadata]')) {
      originalConsoleInfo.apply(console, args);
      return;
    }
    // Suppress all other metadata module log messages
  };

  // Suppress errors and warnings during refresh — the completion count shows success/failure
  console.error = () => {};
  console.warn = () => {};

  const incLabel = incremental ? 'yes' : 'no';
  const budgetMb = (TMDB_BYTE_BUDGET / (1024 * 1024)).toFixed(1);
  console.log('');
  console.log(`Fetching metadata from TMDB... (incremental: ${incLabel}, limit: ${TMDB_METADATA_LIMIT}, pages/bucket: ${TMDB_PAGES_PER_BUCKET}, budget: ${budgetMb}MB)`);
  if (TMDB_YEAR_RANGES) {
    console.log(`Year-range buckets: ${TMDB_YEAR_RANGES}`);
  }
  console.log('');

  supabaseClient = createSupabaseClientFromEnv();
  const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;

  // Load saved crawl state for incremental resumption
  const crawlState = incremental ? loadCrawlState() : {};

  // Register SIGINT for graceful shutdown
  process.on('SIGINT', async () => {
    if (shutdownRequested) {
      process.stdout.write('\r\x1b[K');
      console.log('Forced exit.');
      process.exit(1);
    }
    shutdownRequested = true;
    // Clear progress bar line before shutdown message
    process.stdout.write('\r\x1b[K');
    console.log('\nShutdown requested — saving progress...');
    await flushSavedRecords();
    // Save crawl state so we can resume
    saveCrawlState(crawlState);
    // Brief pause to ensure log output is flushed before exit
    await new Promise((resolve) => setTimeout(resolve, 200));
    console.log(`Saved ${savedRecords.length} records. You can resume later with INCREMENTAL=true.`);
    process.exit(0);
  });
  const refreshPromise = refreshMovieMetadata({
    supabase: supabaseClient,
    tmdbToken,
    incremental,
    limit: TMDB_METADATA_LIMIT,
    pagesPerBucket: TMDB_PAGES_PER_BUCKET,
    batchSize: SUPABASE_BATCH_SIZE,
    byteBudget: TMDB_BYTE_BUDGET,
    yearRanges: TMDB_YEAR_RANGES,
    crawlState,
    sorts: DISCOVER_SORTS,
    onPageProgress: (page, discovered, bucketLabel, sortLabel, byteUsage) => {
      writeProgress(page, discovered, TMDB_METADATA_LIMIT, bucketLabel, sortLabel, byteUsage, TMDB_BYTE_BUDGET);
    },
  });

  const { cachedRecords, savedCount, crawlState: finalCrawlState, totalBytes } = await refreshPromise;

  // Save final crawl state
  saveCrawlState(finalCrawlState);

  // Restore original console.info after refresh completes
  if (infoSuppressed && originalConsoleInfo) {
    console.info = originalConsoleInfo;
    infoSuppressed = false;
  }

  savedRecords = cachedRecords;

  // Clear the progress bar line
  process.stdout.write('\r\x1b[K');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const usedMb = (totalBytes / (1024 * 1024)).toFixed(1);
  console.log(`Complete in ${elapsed}s — ${savedCount} movie records in Supabase (${cachedRecords.length} cached locally, ~${usedMb}MB).`);

  await flushSavedRecords();

  console.log(`Wrote ${cachedRecords.length} cached movie metadata records to ${outputPath} (~${usedMb}MB).`);
}

async function flushSavedRecords() {
  if (savedRecords.length > 0) {
    // Write minified JSON to save space
    fs.writeFileSync(outputPath, JSON.stringify(savedRecords), 'utf8');
    console.log(`Saved ${savedRecords.length} cached records to ${outputPath} before shutdown.`);
  }
}

loadAndSave().catch((error) => {
  process.stdout.write('\r\x1b[K');
  // Use original console.error (if saved) for the catch handler
  if (originalConsoleInfo) {
    originalConsoleInfo('Metadata refresh failed:', error?.message);
  } else {
    console.log('Metadata refresh failed:', error?.message);
  }
  process.exitCode = 1;
});
