export const ratingOptions = [
  { label: 'Dislike', value: -2, icon: 'thumb-down' },
  { label: 'Meh', value: 0, icon: 'meh' },
  { label: 'Like', value: 1, icon: 'thumb-up' },
  { label: 'Love', value: 2, icon: 'heart' },
];

export function formatRatingValue(value) {
  if (value === -1) return 'Hidden';
  const option = ratingOptions.find((item) => item.value === value);
  return option ? option.label : 'Unrated';
}

/**
 * Return a CSS tone class and label for a community rating (vote_average).
 * Green-yellow-red gradient.
 */
export function getCommunityTone(voteAverage, voteCount) {
  if (!Number.isFinite(voteAverage) || (voteCount ?? 0) <= 0) {
    return { tone: 'nr', label: 'NR' };
  }
  if (voteAverage >= 7.0) return { tone: 'excellent', label: voteAverage.toFixed(1) };
  if (voteAverage >= 5.0) return { tone: 'average', label: voteAverage.toFixed(1) };
  return { tone: 'weak', label: voteAverage.toFixed(1) };
}

/**
 * Return a CSS tone class, numeric score, and label for a recommendation match score.
 * Green-yellow-red: >=75 green, >=50 yellow, <50 red.
 * Score expected in 0-100 range. Returns clamped 0-100.
 */
export function formatMatchScore(rawScore) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)));
  let tone;
  let label;
  if (clamped >= 75) {
    tone = 'high';
    label = `${clamped}% Match`;
  } else if (clamped >= 50) {
    tone = 'medium';
    label = `${clamped}% Match`;
  } else {
    tone = 'low';
    label = `${clamped}% Match`;
  }
  return { tone, score: clamped, label };
}
