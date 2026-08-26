// Prune the similarity matrix to the top-N neighbors per movie, then write
// a minified JSON. This dramatically reduces the 66 MB matrix (37M entries)
// to a fraction of the size while keeping the most relevant neighbors.
//
// Usage: node scripts/prune-matrix.js [--top 60] [--out public/similarity_matrix.json]

import fs from 'node:fs';
import path from 'node:path';

const TOP = Number(process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : 60);
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'public/similarity_matrix.json';

const src = path.resolve('public/similarity_matrix.json');

console.log('Reading matrix...');
const t0 = Date.now();
const raw = fs.readFileSync(src, 'utf8');
const matrix = JSON.parse(raw);
const t1 = Date.now();
console.log('Read + parsed in ' + (t1 - t0) + 'ms');

const movieIds = Object.keys(matrix);
console.log('Movies: ' + movieIds.length);

let totalBefore = 0;
let totalAfter = 0;
const pruned = {};

for (const id of movieIds) {
  const neighbors = Object.entries(matrix[id]);
  totalBefore += neighbors.length;

  // Sort by similarity descending, keep the top-N (rounded to 4 decimals)
  neighbors.sort((a, b) => b[1] - a[1]);
  const kept = neighbors.slice(0, TOP).map(([nid, sim]) => [nid, Number(sim.toFixed(4))]);
  totalAfter += kept.length;

  pruned[id] = Object.fromEntries(kept);
}

const t2 = Date.now();
console.log('Pruned ' + totalBefore + ' entries -> ' + totalAfter + ' in ' + (t2 - t1) + 'ms');

const json = JSON.stringify(pruned);
const sizeMB = (json.length / 1048576).toFixed(1);
console.log('Writing ' + sizeMB + ' MB...');
fs.writeFileSync(OUT, json, 'utf8');
console.log('Done.');

const speedup = totalBefore / totalAfter;
console.log('Reduction: ' + speedup.toFixed(1) + 'x fewer entries');
