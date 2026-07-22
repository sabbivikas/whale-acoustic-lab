import type { OutlierRecord, SimilarityResult } from "./corpus-types";

export function calculateOutlierScores(similarity: SimilarityResult, requestedNeighborCount: number): OutlierRecord[] {
  const maximumNeighbors = Math.max(0, similarity.compatibleHashes.length - 1);
  const neighborCount = maximumNeighbors ? Math.max(1, Math.min(maximumNeighbors, Math.floor(Number.isFinite(requestedNeighborCount) ? requestedNeighborCount : 1))) : 0;
  return similarity.compatibleHashes.map((hash, index) => {
    const neighbors = similarity.compatibleHashes
      .map((neighborHash, neighborIndex) => ({ hash: neighborHash, similarity: similarity.matrix[index][neighborIndex], cosineDistance: 1 - similarity.matrix[index][neighborIndex] }))
      .filter((neighbor) => neighbor.hash !== hash)
      .sort((left, right) => left.cosineDistance - right.cosineDistance || left.hash.localeCompare(right.hash))
      .slice(0, neighborCount);
    return {
      hash,
      score: neighbors.length ? neighbors.reduce((sum, neighbor) => sum + neighbor.cosineDistance, 0) / neighbors.length : null,
      neighborCountUsed: neighbors.length,
      neighbors,
    };
  }).sort((left, right) => (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY) || left.hash.localeCompare(right.hash));
}
