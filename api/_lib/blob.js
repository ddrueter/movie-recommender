import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../..');
const matrixPath = path.join(projectRoot, 'public', 'similarity_matrix.json');

export function getStaticMatrixPath() {
  return matrixPath;
}

export async function loadStaticSimilarityMatrix() {
  const raw = await fs.readFile(matrixPath, 'utf8');
  return JSON.parse(raw);
}
