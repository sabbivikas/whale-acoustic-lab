import { aggregateCorpus } from "./corpus-aggregation";
import { CORPUS_ALGORITHM_VERSION, CORPUS_SCHEMA_VERSION, type CorpusFilterConfiguration, type CorpusRecord, type OutlierRecord, type PcaResult, type SimilarityResult } from "./corpus-types";
import { deterministicCorpusId } from "./corpus-persistence";

export interface CorpusExportInput {
  records: CorpusRecord[];
  filters: CorpusFilterConfiguration;
  similarity: SimilarityResult;
  pca: PcaResult;
  outliers: OutlierRecord[];
  outlierNeighborCount: number;
  generationTimestamp: string;
}

export interface CorpusExportFile { filename: string; mimeType: string; content: string }

const LIMITATIONS = [
  "Imported annotations are review sets and are not automatically scientific ground truth.",
  "WhAM model-space similarity does not establish whale identity, clan, dialect, meaning, behavior, or biological relationship.",
  "PCA is a lossy two-dimensional projection of normalized embeddings.",
  "Outlier scores are model-space candidates for manual review, not biological discoveries.",
];

function metadata(input: CorpusExportInput): Record<string, unknown> {
  const hashes = input.records.map((record) => record.hash).sort();
  return {
    corpus_schema_version: CORPUS_SCHEMA_VERSION,
    corpus_algorithm_version: CORPUS_ALGORITHM_VERSION,
    corpus_id: deterministicCorpusId(hashes),
    imported_audio_hashes: hashes,
    source_research_package_versions: [...new Set(input.records.map((record) => record.packageVersion))].sort(),
    filter_configuration: input.filters,
    pca_configuration: { algorithm_version: input.pca.algorithmVersion, components: 2, input: "L2-normalized compatible WhAM embeddings", explained_variance: input.pca.explainedVariance },
    similarity_definition: "Cosine similarity of L2-normalized compatible WhAM embedding vectors.",
    outlier_definition: `Mean cosine distance (1 - cosine similarity) to the ${input.outlierNeighborCount} nearest compatible recording(s), limited by corpus size.`,
    generation_timestamp: input.generationTimestamp,
    scientific_limitations: LIMITATIONS,
  };
}

function safeText(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value) : safeText(typeof value === "string" ? value : JSON.stringify(value));
  return /[",\r\n\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function metadataColumns(input: CorpusExportInput): { headers: string[]; values: unknown[] } {
  const value = metadata(input);
  const headers = ["corpus_schema_version", "corpus_algorithm_version", "corpus_id", "imported_audio_hashes", "source_research_package_versions", "filter_configuration", "pca_configuration", "similarity_definition", "outlier_definition", "generation_timestamp", "scientific_limitations"];
  return { headers, values: headers.map((header) => value[header]) };
}

export function serializeCorpusSummaryJson(input: CorpusExportInput): string {
  return JSON.stringify({
    schema_name: "whale_acoustic_lab_corpus_summary",
    ...metadata(input),
    aggregate: aggregateCorpus(input.records),
    recordings: input.records.map((record) => ({
      audio_sha256: record.hash,
      filename: record.filename,
      automatic_click_count: record.automaticClickCount,
      reviewed_click_count: record.reviewedClickCount,
      automatic_coda_count: record.automaticCodaCount,
      reviewed_coda_count: record.reviewedCodaCount,
      human_correction_count: record.humanCorrectionCount,
      annotation_status_counts: record.statusCounts,
      rhythm_families: record.rhythmFamilies,
      embedding_available: record.embedding !== null,
      embedding_dimension: record.embeddingDimension,
      missing_fields: record.missingFields,
    })),
    pairwise_similarities: input.similarity.pairs,
    outlier_scores: input.outliers,
    pca_points: input.pca.points,
  }, null, 2) + "\n";
}

export function serializeRecordingCsv(input: CorpusExportInput): string {
  const meta = metadataColumns(input);
  const headers = ["audio_sha256", "filename", "automatic_click_count", "reviewed_click_count", "automatic_coda_count", "reviewed_coda_count", "human_correction_count", "automatic_annotation_count", "human_corrected_annotation_count", "accepted_count", "rejected_count", "uncertain_count", "rhythm_families", "embedding_available", "embedding_dimension", "nearest_neighbor_hash", "nearest_neighbor_similarity", "outlier_score", "missing_fields", ...meta.headers];
  const outlier = new Map(input.outliers.map((record) => [record.hash, record.score]));
  const rows = input.records.map((record) => {
    const nearest = input.similarity.nearestByHash[record.hash];
    return [record.hash, record.filename, record.automaticClickCount, record.reviewedClickCount, record.automaticCodaCount, record.reviewedCodaCount, record.humanCorrectionCount, record.automaticAnnotationCount, record.humanCorrectedAnnotationCount, record.statusCounts.accepted, record.statusCounts.rejected, record.statusCounts.uncertain, record.rhythmFamilies.join("|"), record.embedding !== null, record.embeddingDimension, nearest?.hash ?? null, nearest?.similarity ?? null, outlier.get(record.hash) ?? null, record.missingFields.join("|"), ...meta.values];
  });
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export function serializePairwiseSimilarityCsv(input: CorpusExportInput): string {
  const meta = metadataColumns(input);
  const headers = ["left_audio_sha256", "right_audio_sha256", "cosine_similarity", "cosine_distance", ...meta.headers];
  const rows = input.similarity.pairs.map((pair) => [pair.leftHash, pair.rightHash, pair.similarity, pair.cosineDistance, ...meta.values]);
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export function serializeOutlierReviewCsv(input: CorpusExportInput): string {
  const meta = metadataColumns(input);
  const headers = ["audio_sha256", "filename", "outlier_score", "neighbor_count_used", "nearest_neighbors", "candidate_label", ...meta.headers];
  const byHash = new Map(input.records.map((record) => [record.hash, record]));
  const rows = input.outliers.map((record) => [record.hash, byHash.get(record.hash)?.filename ?? "", record.score, record.neighborCountUsed, record.neighbors, "model-space candidate for manual review", ...meta.values]);
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export function buildCorpusExports(input: CorpusExportInput): Record<"summary" | "recordings" | "similarities" | "outliers", CorpusExportFile> {
  const prefix = deterministicCorpusId(input.records.map((record) => record.hash));
  return {
    summary: { filename: `${prefix}_summary.json`, mimeType: "application/json;charset=utf-8", content: serializeCorpusSummaryJson(input) },
    recordings: { filename: `${prefix}_recordings.csv`, mimeType: "text/csv;charset=utf-8", content: serializeRecordingCsv(input) },
    similarities: { filename: `${prefix}_pairwise-similarity.csv`, mimeType: "text/csv;charset=utf-8", content: serializePairwiseSimilarityCsv(input) },
    outliers: { filename: `${prefix}_outlier-review.csv`, mimeType: "text/csv;charset=utf-8", content: serializeOutlierReviewCsv(input) },
  };
}
