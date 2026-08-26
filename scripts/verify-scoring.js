// Lightweight verification for the pure scoring/formatting helpers.
// Run with: npm test  (or: node scripts/verify-scoring.js)
import { scoreContentBasedRecommendations } from '../api/_lib/content-recs.js';
import {
  formatRatingValue,
  getCommunityTone,
  formatMatchScore,
  ratingOptions,
} from '../src/lib/ratingMap.js';

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

console.log('ratingMap.js');
check('formatRatingValue(2) = Love', formatRatingValue(2), 'Love');
check('formatRatingValue(1) = Like', formatRatingValue(1), 'Like');
check('formatRatingValue(0) = Meh', formatRatingValue(0), 'Meh');
check('formatRatingValue(-2) = Dislike', formatRatingValue(-2), 'Dislike');
check('formatRatingValue(-1) = Hidden', formatRatingValue(-1), 'Hidden');
check('formatRatingValue(null) = Unrated', formatRatingValue(null), 'Unrated');

check('getCommunityTone(8.5, 1000) = excellent', getCommunityTone(8.5, 1000), { tone: 'excellent', label: '8.5' });
check('getCommunityTone(6.0, 10) = average', getCommunityTone(6.0, 10), { tone: 'average', label: '6.0' });
check('getCommunityTone(3.2, 5) = weak', getCommunityTone(3.2, 5), { tone: 'weak', label: '3.2' });
check('getCommunityTone(NaN, 0) = nr', getCommunityTone(NaN, 0), { tone: 'nr', label: 'NR' });

check('formatMatchScore(85) = high', formatMatchScore(85), { tone: 'high', score: 85, label: '85% Match' });
check('formatMatchScore(55) = medium', formatMatchScore(55), { tone: 'medium', score: 55, label: '55% Match' });
check('formatMatchScore(20) = low', formatMatchScore(20), { tone: 'low', score: 20, label: '20% Match' });
check('formatMatchScore(-10) clamps to 0', formatMatchScore(-10).score, 0);
check('formatMatchScore(500) clamps to 100', formatMatchScore(500).score, 100);

// ratingOptions must cover the values the UI renders (Love/Like/Meh/Dislike)
check(
  'ratingOptions values',
  ratingOptions.map((o) => o.value),
  [-2, 0, 1, 2],
);

console.log('content-recs.js');
// Pure CF (acclaimBlend=0): movie "3" accumulates 0.8*1 (from loved "1")
// plus 0.5*-0.75 (from disliked "2"), beating movie "4" which only gets 0.2*1.
const matrix = {
  1: { 3: 0.8, 4: 0.2 },
  2: { 3: 0.5 },
};
const metadata = [
  { tmdb_id: '3', title: 'C', vote_count: 100, vote_average: 8, year: '2020' },
  { tmdb_id: '4', title: 'D', vote_count: 100, vote_average: 8, year: '2020' },
];
const ratings = [
  { tmdb_id: '1', rating: 2 },
  { tmdb_id: '2', rating: -2 },
];

const results = scoreContentBasedRecommendations({
  ratings,
  metadata,
  similarityMatrix: matrix,
  acclaimBlend: 0,
});

check('returns two candidates', results.length, 2);
check('ranks "3" above "4"', results.map((r) => r.tmdb_id), ['3', '4']);
check('scores are within 0..100', results.every((r) => r.score >= 0 && r.score <= 100), true);
check('no internal fields leak', Object.prototype.hasOwnProperty.call(results[0], 'rawScore'), false);
check('no internal fields leak (vote_count)', Object.prototype.hasOwnProperty.call(results[0], 'vote_count'), false);

// No ratings => no recommendations
const empty = scoreContentBasedRecommendations({ ratings: [], metadata, similarityMatrix: matrix, acclaimBlend: 0.35 });
check('empty ratings yields empty results', empty.length, 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
