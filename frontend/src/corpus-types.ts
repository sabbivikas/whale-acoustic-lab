import type { AnnotationSource, AnnotationStatus, CodaMeasurements, ResearchClick, ResearchCoda } from "./research-model";

export const CORPUS_SCHEMA_VERSION = "1.0.0";
export const CORPUS_ALGORITHM_VERSION = "corpus-explorer-v1";
export const WHAM_EXPECTED_EMBEDDING_DIMENSION = 1280;

export interface ResearchPackageAudio {
  sha256: string;
  original_filename: string;
  original_duration_seconds: number;
  analyzed_duration_seconds: number;
  sample_rate_hz: number;
  channel_count: number | null;
}

export interface ResearchPackageCodaMeasurement {
  coda_id: string;
  annotation_status: AnnotationStatus;
  annotation_source: AnnotationSource;
  measurements: CodaMeasurements;
}

export interface ResearchPackage {
  schema_name: "whale_acoustic_lab_research_package";
  schema_version: string;
  audio: ResearchPackageAudio;
  export_timestamp: string;
  original_automatic_analysis: {
    click_detections: ResearchClick[];
    click_timestamps_seconds: number[];
    coda_boundaries: Array<Record<string, unknown>>;
  };
  reviewed_annotations: {
    document_version: number;
    last_reviewed_at: string;
    clicks: ResearchClick[];
    codas: ResearchCoda[];
    recalculated_codas: ResearchPackageCodaMeasurement[];
  };
  human_corrections: unknown[];
  existing_wham_embedding: null | { values: unknown; dimension: number };
  existing_acoustic_neighbors: unknown[];
  detector_and_segmentation: Record<string, unknown>;
  available_model_and_algorithm_identifiers: Record<string, unknown>;
  scientific_limitations: string[];
  [key: string]: unknown;
}

export interface PackageValidationResult {
  valid: boolean;
  package?: ResearchPackage;
  errors: string[];
  warnings: string[];
  embedding?: number[];
  embeddingDimension?: number;
}

export type CorpusAnnotationStatus = "accepted" | "rejected" | "uncertain";

export interface CorpusRecord {
  hash: string;
  filename: string;
  packageVersion: string;
  package: ResearchPackage;
  originalDurationSeconds: number;
  analyzedDurationSeconds: number;
  sampleRateHz: number;
  automaticClickCount: number;
  reviewedClickCount: number;
  automaticCodaCount: number;
  reviewedCodaCount: number;
  humanCorrectionCount: number;
  automaticAnnotationCount: number;
  humanCorrectedAnnotationCount: number;
  statusCounts: Record<CorpusAnnotationStatus, number>;
  representativeStatus: CorpusAnnotationStatus;
  codaDurationsSeconds: number[];
  meanInterClickIntervalsSeconds: number[];
  regularityCounts: Record<string, number>;
  rhythmFamilies: string[];
  embedding: number[] | null;
  embeddingDimension: number | null;
  embeddingIssue: string | null;
  missingFields: string[];
}

export interface CorpusImportReport {
  imported: number;
  rejected: Array<{ filename: string; reasons: string[] }>;
  duplicates: Array<{ filename: string; audioSha256: string }>;
  missingEmbeddings: number;
}

export interface SimilarityPair {
  leftHash: string;
  rightHash: string;
  similarity: number;
  cosineDistance: number;
}

export interface SimilarityResult {
  expectedDimension: number | null;
  compatibleHashes: string[];
  incompatibleHashes: string[];
  matrix: number[][];
  pairs: SimilarityPair[];
  nearestByHash: Record<string, { hash: string; similarity: number } | null>;
}

export interface PcaPoint {
  hash: string;
  x: number;
  y: number;
}

export interface PcaResult {
  algorithmVersion: "deterministic-jacobi-pca-v1";
  points: PcaPoint[];
  explainedVariance: [number, number];
  componentCount: 2;
}

export interface OutlierRecord {
  hash: string;
  score: number | null;
  neighborCountUsed: number;
  neighbors: Array<{ hash: string; similarity: number; cosineDistance: number }>;
}

export interface CorpusFilterConfiguration {
  minimumClickCount: number | null;
  maximumClickCount: number | null;
  minimumCodaCount: number | null;
  maximumCodaCount: number | null;
  rhythmFamily: string | null;
  annotationStatus: CorpusAnnotationStatus | null;
  humanCorrections: "any" | "yes" | "no";
  embeddingAvailable: "any" | "yes" | "no";
  minimumNearestSimilarity: number | null;
  maximumNearestSimilarity: number | null;
  minimumOutlierScore: number | null;
  maximumOutlierScore: number | null;
}

export interface CorpusAggregate {
  recordingCount: number;
  recordingsWithEmbeddings: number;
  totalReviewedCodas: number;
  totalAutomaticCodas: number;
  totalReviewedClicks: number;
  totalAutomaticClicks: number;
  automaticAnnotationCount: number;
  humanCorrectedAnnotationCount: number;
  statusCounts: Record<CorpusAnnotationStatus, number>;
  clickCounts: number[];
  codaDurationsSeconds: number[];
  meanInterClickIntervalsSeconds: number[];
  regularityDistribution: Record<string, number>;
  mostCorrected: Array<{ hash: string; filename: string; correctionCount: number }>;
  incomplete: Array<{ hash: string; filename: string; missingFields: string[] }>;
}
