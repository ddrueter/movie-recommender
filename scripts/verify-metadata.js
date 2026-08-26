// Lightweight verification for the metadata / crawler helpers.
import {
  generateYearRangeBuckets,
  buildCachedMetadataRow,
  buildSupabaseMetadataRow,
} from '../api/_lib/movie-metadata.js';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       expected ${e}`);
    console.error(`       actual   ${a}`);
  }
}

const currentYear = new Date().getFullYear();

console.log('generateYearRangeBuckets');
check(
  'empty spec -> single "all" bucket',
  generateYearRangeBuckets(''),
  [{ gte: '1900-01-01', lte: `${currentYear}-12-31`, label: 'all' }],
);
check(
  'null spec -> single "all" bucket',
  generateYearRangeBuckets(null),
  [{ gte: '1900-01-01', lte: `${currentYear}-12-31`, label: 'all' }],
);
check(
  'year strategy',
  generateYearRangeBuckets('2000-2003:year').map((b) => b.label),
  ['2000', '2001', '2002', '2003'],
);
check(
  'decade strategy',
  generateYearRangeBuckets('2000-2009:decade'),
  [{ gte: '2000-01-01', lte: '2009-12-31', label: '2000-2009' }],
);
check(
  '5year strategy',
  generateYearRangeBuckets('2000-2009:5year').map((b) => b.label),
  ['2000-2004', '2005-2009'],
);
check(
  'multi-segment spec',
  generateYearRangeBuckets('2000-2001:year,2010-2011:year').map((b) => b.label),
  ['2000', '2001', '2010', '2011'],
);
check(
  'invalid spec -> empty list',
  generateYearRangeBuckets('garbage'),
  [],
);
check(
  'unknown strategy -> skipped',
  generateYearRangeBuckets('2000-2003:bogus'),
  [],
);
// partial range: 5-year bucket should clamp to range end
check(
  '5year clamps at range end',
  generateYearRangeBuckets('2000-2003:5year').map((b) => b.label),
  ['2000-2003'],
);

console.log('buildCachedMetadataRow');
const row = buildCachedMetadataRow({
  id: 42,
  title: ' The Matrix ',
  original_title: 'The Matrix',
  release_date: '1999-03-31',
  poster_path: '/x.jpg',
  vote_average: 8.7,
  vote_count: 100,
  popularity: 50,
  overview: 'Wake up, Neo.',
  genres: [{ name: 'Action' }, { name: 'Sci-Fi' }, { name: 'Action' }],
  directors: ['The Wachowskis'],
  top_cast: ['Keanu Reeves', 'Carrie-Anne Moss'],
  keywords: ['AI', 'dystopia'],
});
check('tmdb_id stringified', row.tmdb_id, '42');
check('title trimmed', row.title, 'The Matrix');
check('year derived', row.year, '1999');
check('poster_url built', row.poster_url, 'https://image.tmdb.org/t/p/w500/x.jpg');
check('genres normalized + deduped', row.genres, ['Action', 'Sci-Fi']);
check('actors from top_cast', row.actors, ['Keanu Reeves', 'Carrie-Anne Moss']);
check('directors normalized', row.directors, ['The Wachowskis']);
check('keywords normalized', row.keywords, ['AI', 'dystopia']);
check('vote_count defaulted', row.vote_count, 100);

const supabaseRow = buildSupabaseMetadataRow(row);
check('buildSupabaseMetadataRow tmdb_id', supabaseRow.tmdb_id, '42');
check('buildSupabaseMetadataRow year fallback', supabaseRow.year, '1999');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
