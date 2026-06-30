import fs from 'fs';
import path from 'path';

const ratingsPath = path.resolve('scripts/data/ratings.csv');
const linksPath = path.resolve('scripts/data/links.csv');
const outputPath = path.resolve('public/similarity_matrix.json');

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const [headerLine, ...lines] = raw.split(/\r?\n/);
  const headers = headerLine.split(',').map((value) => value.trim());

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(',');
      return headers.reduce((row, header, index) => {
        const value = values[index]?.trim();
        row[header] = value === undefined || value === '' ? null : value;
        return row;
      }, {});
    });
}

function buildMovieLensToTmdbMap(links) {
  const map = new Map();
  for (const link of links) {
    if (link.movieId && link.tmdbId) {
      map.set(String(link.movieId), String(link.tmdbId));
    }
  }
  return map;
}

function buildUserRatings(ratings, movieLensToTmdbMap) {
  const userRatings = new Map();

  for (const rating of ratings) {
    if (!rating.userId || !rating.movieId) continue;

    const userId = String(rating.userId);
    const tmdbId = movieLensToTmdbMap.get(String(rating.movieId));
    const score = Number(rating.rating);

    if (!tmdbId || Number.isNaN(score)) continue;

    if (!userRatings.has(userId)) {
      userRatings.set(userId, new Map());
    }

    userRatings.get(userId).set(tmdbId, score);
  }

  return userRatings;
}

function pearsonCorrelation(ratingsA, ratingsB) {
  const sharedMovies = [];
  for (const [movieId, ratingA] of ratingsA.entries()) {
    if (ratingsB.has(movieId)) {
      sharedMovies.push([ratingA, ratingsB.get(movieId)]);
    }
  }

  if (sharedMovies.length < 2) {
    return 0;
  }

  const averageA = sharedMovies.reduce((sum, [ratingA]) => sum + ratingA, 0) / sharedMovies.length;
  const averageB = sharedMovies.reduce((sum, [, ratingB]) => sum + ratingB, 0) / sharedMovies.length;

  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;

  for (const [ratingA, ratingB] of sharedMovies) {
    const diffA = ratingA - averageA;
    const diffB = ratingB - averageB;
    numerator += diffA * diffB;
    denominatorA += diffA * diffA;
    denominatorB += diffB * diffB;
  }

  if (denominatorA === 0 || denominatorB === 0) {
    return 0;
  }

  return numerator / (Math.sqrt(denominatorA) * Math.sqrt(denominatorB));
}

function buildSimilarityMatrix(userRatings) {
  const movieRatings = new Map();

  for (const [userId, ratings] of userRatings.entries()) {
    for (const [movieId, score] of ratings.entries()) {
      if (!movieRatings.has(movieId)) {
        movieRatings.set(movieId, new Map());
      }
      movieRatings.get(movieId).set(userId, score);
    }
  }

  const movieIds = Array.from(movieRatings.keys());
  const matrix = {};

  for (let i = 0; i < movieIds.length; i += 1) {
    const movieIdA = movieIds[i];
    matrix[movieIdA] = matrix[movieIdA] || {};

    for (let j = i + 1; j < movieIds.length; j += 1) {
      const movieIdB = movieIds[j];
      const similarity = pearsonCorrelation(movieRatings.get(movieIdA), movieRatings.get(movieIdB));

      if (similarity <= 0) continue;

      const rounded = Number(similarity.toFixed(4));
      matrix[movieIdA][movieIdB] = rounded;
      matrix[movieIdB] = matrix[movieIdB] || {};
      matrix[movieIdB][movieIdA] = rounded;
    }
  }

  return matrix;
}

function main() {
  const ratings = parseCsv(ratingsPath);
  const links = parseCsv(linksPath);
  const movieLensToTmdbMap = buildMovieLensToTmdbMap(links);
  const userRatings = buildUserRatings(ratings, movieLensToTmdbMap);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const matrix = buildSimilarityMatrix(userRatings);
  fs.writeFileSync(outputPath, JSON.stringify(matrix, null, 2), 'utf8');

  console.log(`Wrote similarity matrix for ${Object.keys(matrix).length} movies to ${outputPath}`);
}

main();
