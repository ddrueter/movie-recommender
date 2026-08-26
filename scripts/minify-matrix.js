// Losslessly compress the similarity matrix: round each similarity to 4
// decimals (the precision the rebuild script already uses) and write minified
// JSON. Every neighbor is kept — no data is dropped — while shrinking the file
// from ~69 MB to ~30 MB.
//
// Usage: node scripts/minify-matrix.js [--out public/similarity_matrix.json]

import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'public/similarity_matrix.json';
const src = path.resolve(OUT);

console.log('Reading matrix...');
const t0 = Date.now();
const raw = fs.readFileSync(src, 'utf8');
const matrix = JSON.parse(raw);
const t1 = Date.now();
console.log('Read + parsed in ' + (t1 - t0) + 'ms');

let entries = 0;
for (const id of Object.keys(matrix)) {
  const neighbors = matrix[id];
  for (const nid of Object.keys(neighbors)) {
    neighbors[nid] = Number(neighbors[nid].toFixed(4));
    entries += 1;
  }
}

const json = JSON.stringify(matrix);
console.log('Movies: ' + Object.keys(matrix).length + ', entries: ' + entries + ', size: ' + (json.length / 1048576).toFixed(1) + ' MB');
fs.writeFileSync(OUT, json, 'utf8');
console.log('Done.');
