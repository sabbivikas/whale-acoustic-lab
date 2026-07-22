import type { CorpusFilterConfiguration, CorpusRecord, OutlierRecord, SimilarityResult } from "./corpus-types";

export const DEFAULT_CORPUS_FILTERS: CorpusFilterConfiguration = {
  minimumClickCount: null,
  maximumClickCount: null,
  minimumCodaCount: null,
  maximumCodaCount: null,
  rhythmFamily: null,
  annotationStatus: null,
  humanCorrections: "any",
  embeddingAvailable: "any",
  minimumNearestSimilarity: null,
  maximumNearestSimilarity: null,
  minimumOutlierScore: null,
  maximumOutlierScore: null,
};

const within = (value: number | null, minimum: number | null, maximum: number | null): boolean => {
  if (minimum !== null && (value === null || value < minimum)) return false;
  if (maximum !== null && (value === null || value > maximum)) return false;
  return true;
};

export function filterCorpusRecords(records: CorpusRecord[], filters: CorpusFilterConfiguration, similarity: SimilarityResult, outliers: OutlierRecord[]): CorpusRecord[] {
  const outlierByHash = new Map(outliers.map((record) => [record.hash, record.score]));
  return records.filter((record) => {
    if (!within(record.reviewedClickCount, filters.minimumClickCount, filters.maximumClickCount)) return false;
    if (!within(record.reviewedCodaCount, filters.minimumCodaCount, filters.maximumCodaCount)) return false;
    if (filters.rhythmFamily !== null && !record.rhythmFamilies.includes(filters.rhythmFamily)) return false;
    if (filters.annotationStatus !== null && record.representativeStatus !== filters.annotationStatus) return false;
    if (filters.humanCorrections === "yes" && record.humanCorrectionCount === 0) return false;
    if (filters.humanCorrections === "no" && record.humanCorrectionCount > 0) return false;
    if (filters.embeddingAvailable === "yes" && record.embedding === null) return false;
    if (filters.embeddingAvailable === "no" && record.embedding !== null) return false;
    const nearest = similarity.nearestByHash[record.hash]?.similarity ?? null;
    if (!within(nearest, filters.minimumNearestSimilarity, filters.maximumNearestSimilarity)) return false;
    if (!within(outlierByHash.get(record.hash) ?? null, filters.minimumOutlierScore, filters.maximumOutlierScore)) return false;
    return true;
  }).sort((left, right) => left.filename.localeCompare(right.filename) || left.hash.localeCompare(right.hash));
}
