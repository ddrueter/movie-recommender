import { parentPort, workerData } from 'worker_threads';

// Pearson Correlation Calculation
function pearsonCorrelation(workerData) {
    const { chunk, userRatings, userAverages, allTmdbIds, movieToUsersMap, workerId } = workerData;
    const similarities = new Map();

    for (let i = 0; i < chunk.length; i++) {
        if (i % 100 === 0 && i > 0) {
            const progress = i / chunk.length;
            parentPort.postMessage({ type: 'progress', workerId, progress });
        }
        const tmdbIdA = chunk[i];

        for (let j = i + 1; j < allTmdbIds.length; j++) {
            const tmdbIdB = allTmdbIds[j];
            if (tmdbIdA == tmdbIdB) continue;

            const usersA = movieToUsersMap.get(tmdbIdA) || [];
            const usersB = movieToUsersMap.get(tmdbIdB) || [];

            const commonUserCount = usersA.filter(userId => usersB.includes(userId)).length;
            if (commonUserCount < 2) continue; // Need at least 2 common users for correlation

            let numerator = 0;
            let denominatorA = 0;
            let denominatorB = 0;
            let commonUsers = 0;

            for (const [userId, ratings] of userRatings.entries()) {
                if (ratings.has(tmdbIdA) && ratings.has(tmdbIdB)) {
                    const ratingA = ratings.get(tmdbIdA) - userAverages.get(userId);
                    const ratingB = ratings.get(tmdbIdB) - userAverages.get(userId);

                    numerator += ratingA * ratingB;
                    denominatorA += ratingA * ratingA;
                    denominatorB += ratingB * ratingB;
                    commonUsers++;
                }
            }

            if (commonUsers > 0 && denominatorA > 0 && denominatorB > 0) {
                let similarity = numerator / (Math.sqrt(denominatorA) * Math.sqrt(denominatorB));
                similarity = Math.min(1.0, similarity); // Clamp similarity to [0, 1]

                if (similarity > 0.5) { // Threshold to filter out weak similarities
                    if (!similarities.has(tmdbIdA)) {
                        similarities.set(tmdbIdA, new Map());
                    }
                    similarities.get(tmdbIdA).set(tmdbIdB, similarity);
                }
            }
        }
    }

    return similarities;
}

const result = pearsonCorrelation(workerData);

// Send the result back to the main thread
parentPort.postMessage({ type: 'result', value: result });