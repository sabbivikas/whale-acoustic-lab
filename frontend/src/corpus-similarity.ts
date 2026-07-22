import { WHAM_EXPECTED_EMBEDDING_DIMENSION, type CorpusRecord, type SimilarityResult } from "./corpus-types";

export function normalizeEmbedding(vector: number[]): number[] | null {
  if (!vector.length || vector.some((value) => !Number.isFinite(value))) return null;
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? vector.map((value) => value / magnitude) : null;
}

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length !== right.length || !left.length) return null;
  const normalizedLeft = normalizeEmbedding(left);
  const normalizedRight = normalizeEmbedding(right);
  if (!normalizedLeft || !normalizedRight) return null;
  return normalizedLeft.reduce((sum, value, index) => sum + value * normalizedRight[index], 0);
}

export function expectedEmbeddingDimension(records: CorpusRecord[]): number | null {
  return records.some((record) => record.embedding !== null) ? WHAM_EXPECTED_EMBEDDING_DIMENSION : null;
}

export function calculateCorpusSimilarity(records: CorpusRecord[]): SimilarityResult {
  const expectedDimension = expectedEmbeddingDimension(records);
  if (expectedDimension === null) return { expectedDimension: null, compatibleHashes: [], incompatibleHashes: [], matrix: [], pairs: [], nearestByHash: {} };
  const compatible = records
    .filter((record) => record.embedding && record.embeddingDimension === expectedDimension && record.embedding.length === expectedDimension && normalizeEmbedding(record.embedding))
    .sort((a, b) => a.hash.localeCompare(b.hash));
  const compatibleSet = new Set(compatible.map((record) => record.hash));
  const normalized = compatible.map((record) => normalizeEmbedding(record.embedding!)!);
  const matrix = normalized.map((left) => normalized.map((right) => left.reduce((sum, value, index) => sum + value * right[index], 0)));
  const pairs = compatible.flatMap((left, leftIndex) => compatible.slice(leftIndex + 1).map((right, offset) => {
    const similarity = matrix[leftIndex][leftIndex + 1 + offset];
    return { leftHash: left.hash, rightHash: right.hash, similarity, cosineDistance: 1 - similarity };
  })).sort((a, b) => b.similarity - a.similarity || a.leftHash.localeCompare(b.leftHash) || a.rightHash.localeCompare(b.rightHash));
  const nearestByHash: SimilarityResult["nearestByHash"] = {};
  compatible.forEach((record) => {
    const nearest = pairs.filter((pair) => pair.leftHash === record.hash || pair.rightHash === record.hash).sort((a, b) => b.similarity - a.similarity || a.leftHash.localeCompare(b.leftHash) || a.rightHash.localeCompare(b.rightHash))[0];
    nearestByHash[record.hash] = nearest ? { hash: nearest.leftHash === record.hash ? nearest.rightHash : nearest.leftHash, similarity: nearest.similarity } : null;
  });
  return {
    expectedDimension,
    compatibleHashes: compatible.map((record) => record.hash),
    incompatibleHashes: records.filter((record) => record.embedding && !compatibleSet.has(record.hash)).map((record) => record.hash).sort(),
    matrix,
    pairs,
    nearestByHash,
  };
}
