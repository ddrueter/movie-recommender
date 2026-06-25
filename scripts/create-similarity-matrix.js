import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { Worker } from 'worker_threads';
import readline from 'readline';

console.log('Starting similarity matrix creation...');

// Load Data Files
console.log('Loading data files...');

const ratingsPath = path.resolve('scripts/data/ratings.csv');
const linksPath = path.resolve('scripts/data/links.csv');

const ratingsFile = fs.readFileSync(ratingsPath, 'utf8');
const linksFile = fs.readFileSync(linksPath, 'utf8');

const ratingsData = Papa.parse(ratingsFile, { header: true, dynamicTyping: true }).data;
const linksData = Papa.parse(linksFile, { header: true, dynamicTyping: true }).data;

// Database Mapping

const movieLensToTmdbMap = new Map();
for (const link of linksData) {
    if (link.movieId && link.tmdbId) {
        movieLensToTmdbMap.set(link.movieId.toString(), link.tmdbId.toString());
    }
}
console.log(`Mapped ${movieLensToTmdbMap.size} MovieLens IDs to TMDB IDs.`);

// Create User Ratings Sparse Matrix
const userRatings = new Map();
for (const rating of ratingsData) {
    if(!rating.userId || !rating.movieId) continue;
    const userId = rating.userId.toString();
    const movieLensId = rating.movieId.toString();
    const tmdbId = movieLensToTmdbMap.get(movieLensId);
    if (tmdbId) {
        if (!userRatings.has(userId)) {
            userRatings.set(userId, new Map());
        }
        userRatings.get(userId).set(tmdbId, rating.rating);
    }
}

console.log(`Processed ratings for ${userRatings.size} users.`);

// Movie to User Index Mapping
console.log('Creating movie to user index mapping...');
const movieToUsersMap = new Map();

for (const [userId, ratings] of userRatings.entries()) {
    for (const tmdbId of ratings.keys()) {
        if (!movieToUsersMap.has(tmdbId)) {
            movieToUsersMap.set(tmdbId, []);
        }
        movieToUsersMap.get(tmdbId).push(userId);
    }
}

console.log(`Created mapping for ${movieToUsersMap.size} movies to users.`);

// Calculate Pearson Correlation for Each Movie Pair with Parallel Processing
console.log('Calculating similarities using Pearson Correlation...');

//const numCores = os.cpus().length;
const numCores = 12; // Only use p-cores for smooth performance
console.log(`Using ${numCores} cores for parallel processing.`);
const uniqueTmdbIds = Array.from(new Set(Array.from(userRatings.values()).flatMap(map => Array.from(map.keys()))));
const chunkSize = Math.ceil(uniqueTmdbIds.length / numCores);
const workers = [];
const promises = [];

const userAverages = new Map();
for (const [userId, ratings] of userRatings.entries()) {
    let sum = 0;
    for (const rating of ratings.values()) sum += rating;
    userAverages.set(userId, sum / ratings.size);
}

const workerProgress = Array(numCores).fill(0);

console.log(`Splitting ${uniqueTmdbIds.length} movie pairs into ${numCores} chunks for parallel processing...`);
const startTime = Date.now();

for (let i = 0; i < numCores; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    const chunk = uniqueTmdbIds.slice(start, end);

    const worker = new Worker('./scripts/similarity-worker.js', {
        workerData: {
            chunk,
            userRatings,
            userAverages,
            allTmdbIds: uniqueTmdbIds,
            movieToUsersMap,
            workerId: i
        }
    });

    workers.push(worker);

    const promise = new Promise((resolve, reject) => {
        worker.on('message', (message) => {
            if (message.type === 'progress') {
                workerProgress[message.workerId] = message.progress;

                const totalProgress = workerProgress.reduce((sum, p) => sum + p, 0) / numCores;
                const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const remainingTime = totalProgress > 0 ? ((elapsedTime / totalProgress) - elapsedTime).toFixed(2) : 0;

                const progressBar = drawProgressBar(totalProgress);

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                process.stdout.write(`\r    ${progressBar} | Elapsed: ${elapsedTime}s | Estimated Remaining: ${remainingTime}s`);
            } else if (message.type === 'result') {
                workerProgress[message.workerId] = 1; // Mark this worker as done
                resolve(message.value);
                return;
            }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });

    promises.push(promise);
}

console.log("   Workers started. Calculating similarities...");
const results = await Promise.all(promises);
process.stdout.write('\n');

const totalTime = (Date.now() - startTime) / 1000;
console.log(`   All workers finished in ${totalTime.toFixed(2)} seconds.`);

for (const worker of workers) {
    worker.terminate();
}

// Create Final Similarity Matrix
console.log("   Combining results from all workers...");
const combinedSimilarities = new Map();
for (const workerResult of results) {
    for (const [movieId, similarMovies] of workerResult.entries()) {
        combinedSimilarities.set(movieId, similarMovies);
    }
}

const finalSimilarities = {};
for (const [tmdbId, similarities] of combinedSimilarities.entries()) {
    finalSimilarities[tmdbId] = Object.fromEntries(similarities);
}

const outputPath = path.resolve('public/similarity_matrix.json');
fs.writeFileSync(outputPath, JSON.stringify(finalSimilarities, null, 2), 'utf8');

console.log(`Similarity matrix saved to ${outputPath}.`);

process.exit(0);

// Progress Bar Function
function drawProgressBar(progress) {
    const barLength = 40; // Length of the progress bar
    const filledLength = Math.round(barLength * progress);
    const bar = '█'.repeat(filledLength) + '-'.repeat(barLength - filledLength);
    return `[${bar}] ${ (progress * 100).toFixed(2) }%`;
}