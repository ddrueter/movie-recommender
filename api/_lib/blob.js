import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../..');
const matrixPath = path.join(projectRoot, 'public', 'similarity_matrix.json');

export function getStaticMatrixPath() {
  return matrixPath;
}

let matrixCache = null;

export async function loadStaticSimilarityMatrix() {
  // The matrix is ~66MB; parsing it on every request is the dominant cost.
  // Cache it in module scope so only the first request pays the parse penalty.
  if (matrixCache) return matrixCache;
  const raw = await fs.readFile(matrixPath, 'utf8');
  matrixCache = JSON.parse(raw);
  return matrixCache;
}
