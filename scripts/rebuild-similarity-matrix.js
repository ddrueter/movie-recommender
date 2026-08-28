// Rebuild the movie similarity matrix from MovieLens ratings.csv + links.csv.
//
// This is a streaming, co-occurrence-based implementation that can handle the
// full MovieLens 25M/32M/latest datasets (which the old O(n^2) script could
// not — it read the whole CSV into one string and compared every movie pair).
//
// Tune with env vars (defaults are conservative for memory):
//   MATRIX_MIN_RATINGS  - drop movies with fewer than this many ratings (default 100)
//   MATRIX_MAX_MOVIES   - keep at most this many most-rated movies (default 30000)
//   MATRIX_MIN_SUPPORT  - min shared users for a similarity to be kept (default 5)
//   MATRIX_TOP_K        - neighbors kept per movie (default 60)
//
// Memory: run with a raised heap for large inputs, e.g.
//   node --max-old-space-size=16384 scripts/rebuild-similarity-matrix.js

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ratingsPath = path.resolve(process.env.MATRIX_RATINGS || 'scripts/data/ratings.csv');
const linksPath = path.resolve(process.env.MATRIX_LINKS || 'scripts/data/links.csv');
const outputPath = path.resolve(process.env.MATRIX_OUTPUT || 'public/similarity_matrix.json');

const MIN_RATINGS = Number(process.env.MATRIX_MIN_RATINGS || 100);
const MAX_MOVIES = Number(process.env.MATRIX_MAX_MOVIES || 30000);
const MIN_SUPPORT = Number(process.env.MATRIX_MIN_SUPPORT || 5);
const TOP_K = Number(process.env.MATRIX_TOP_K || 60);

function log(...args) {
  console.log('[matrix]', ...args);
}

// Load links.csv (movieId -> tmdbId). Small file, read fully.
function loadLinks() {
  const raw = fs.readFileSync(linksPath, 'utf8');
  const map = new Map();
  const lines = raw.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const [movieId, , tmdbId] = line.split(',');
    if (tmdbId && tmdbId.trim()) map.set(movieId.trim(), tmdbId.trim());
  }
  return map;
}

// Stream ratings.csv line-by-line, invoking onRating(userId, movieId, rating).
async function streamRatings(onRating) {
  const rl = createInterface({ input: fs.createReadStream(ratingsPath), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue; // header
    }
    const [userId, movieId, rating] = line.split(',');
    onRating(userId, movieId, Number(rating));
  }
}

async function main() {
  log('loading links...');
  const movieToTmdb = loadLinks();
  log('linked movies:', movieToTmdb.size);

  // Pass 1: count ratings per linked movie.
  log('pass 1: counting ratings per movie...');
  const counts = new Map();
  await streamRatings((userId, movieId) => {
    const tmdb = movieToTmdb.get(movieId);
    if (tmdb) counts.set(tmdb, (counts.get(tmdb) || 0) + 1);
  });

  // Filter to the most-rated movies, and assign integer indices.
  const eligible = [...counts.entries()]
    .filter(([, c]) => c >= MIN_RATINGS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MOVIES);

  if (eligible.length === 0) {
    console.error('[matrix] No movies pass the MIN_RATINGS filter. Lower MATRIX_MIN_RATINGS.');
    process.exit(1);
  }

  const indexToTmdb = eligible.map(([id]) => id);
  const tmdbToIndex = new Map(indexToTmdb.map((id, i) => [id, i]));
  const nMovies = indexToTmdb.length;
  log('eligible movies:', nMovies);

  // Pass 2: build userRatings as flat [idx, rating, ...] arrays (compact).
  log('pass 2: building user ratings...');
  const userRatings = new Map(); // userId -> number[] (flat pairs)
  await streamRatings((userId, movieId, rating) => {
    if (!Number.isFinite(rating)) return;
    const tmdb = movieToTmdb.get(movieId);
    if (!tmdb) return;
    const idx = tmdbToIndex.get(tmdb);
    if (idx === undefined) return;
    let arr = userRatings.get(userId);
    if (!arr) {
      arr = [];
      userRatings.set(userId, arr);
    }
    arr.push(idx, rating);
  });
  log('users with eligible ratings:', userRatings.size);

  // Pass 3: accumulate Pearson statistics for every co-occurring movie pair.
  // Key = a * nMovies + b (a < b). Value = Float64Array([n, sumA, sumB, sumAB, sumA2, sumB2]).
  log('pass 3: accumulating co-occurrence statistics...');
  const pairStats = new Map();
  let processed = 0;
  const t0 = Date.now();

  for (const arr of userRatings.values()) {
    const len = arr.length;
    if (len < 4) continue; // fewer than 2 ratings

    for (let i = 0; i < len; i += 2) {
      const a = arr[i];
      const ra = arr[i + 1];
      for (let j = i + 2; j < len; j += 2) {
        const b = arr[j];
        const rb = arr[j + 1];
        const [lo, hi, rLo, rHi] = a < b ? [a, b, ra, rb] : [b, a, rb, ra];
        const key = lo * nMovies + hi;
        let s = pairStats.get(key);
        if (!s) {
          s = new Float64Array([0, 0, 0, 0, 0, 0]);
          pairStats.set(key, s);
        }
        s[0] += 1;
        s[1] += rLo;
        s[2] += rHi;
        s[3] += rLo * rHi;
        s[4] += rLo * rLo;
        s[5] += rHi * rHi;
      }
    }

    processed += 1;
    if (processed % 20000 === 0) {
      log('  users processed:', processed, '| unique pairs:', pairStats.size.toLocaleString(), '|', ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
  }

  // Free the ratings now that pair stats are accumulated.
  userRatings.clear();

  // Compute Pearson for pairs with enough shared users, keep top-K per movie.
  log('computing similarities (min support ' + MIN_SUPPORT + ')...');
  const neighbors = new Map(); // movieIndex -> array of [otherIndex, similarity]
  const push = (a, b, sim) => {
    let list = neighbors.get(a);
    if (!list) {
      list = [];
      neighbors.set(a, list);
    }
    list.push([b, sim]);
  };

  for (const [key, s] of pairStats) {
    if (s[0] < MIN_SUPPORT) continue;
    const n = s[0];
    const meanA = s[1] / n;
    const meanB = s[2] / n;
    const num = s[3] - n * meanA * meanB;
    const denA = Math.sqrt(s[4] - n * meanA * meanA);
    const denB = Math.sqrt(s[5] - n * meanB * meanB);
    if (!(denA > 0) || !(denB > 0)) continue;
    const sim = num / (denA * denB);
    if (!(sim > 0)) continue;

    const a = Math.floor(key / nMovies);
    const b = key % nMovies;
    push(a, b, sim);
    push(b, a, sim);
  }
  pairStats.clear();

  // Build the output matrix (tmdbId -> { neighborTmdbId: sim }), top-K, rounded.
  log('writing output...');
  const matrix = {};
  for (const [idx, nbrs] of neighbors) {
    nbrs.sort((x, y) => y[1] - x[1]);
    const row = {};
    for (const [otherIdx, sim] of nbrs.slice(0, TOP_K)) {
      row[indexToTmdb[otherIdx]] = Number(sim.toFixed(4));
    }
    matrix[indexToTmdb[idx]] = row;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(matrix), 'utf8');
  log('done. movies:', Object.keys(matrix).length, '->', outputPath);
}

main().catch((error) => {
  console.error('[matrix] failed:', error);
  process.exit(1);
});
