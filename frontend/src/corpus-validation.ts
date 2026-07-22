import { WHAM_EXPECTED_EMBEDDING_DIMENSION, type PackageValidationResult, type ResearchPackage } from "./corpus-types";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const string = (value: unknown): value is string => typeof value === "string";

function validAnnotation(value: unknown, kind: "click" | "coda"): boolean {
  if (!isObject(value) || !string(value.id) || !["accepted", "rejected", "uncertain"].includes(String(value.status)) || !["automatic", "human_corrected"].includes(String(value.source)) || !string(value.note)) return false;
  return kind === "click"
    ? finite(value.timeSeconds) && (value.codaId === null || string(value.codaId))
    : finite(value.startSeconds) && finite(value.endSeconds) && value.endSeconds >= value.startSeconds;
}

export function collapsePackageEmbedding(values: unknown, dimension: number): number[] | null {
  if (!Number.isInteger(dimension) || dimension <= 0) return null;
  const vectors: number[][] = [];
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (node.length === dimension && node.every(finite)) { vectors.push(node as number[]); return; }
    node.forEach(visit);
  };
  visit(values);
  if (!vectors.length) return null;
  return Array.from({ length: dimension }, (_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length);
}

export function validateResearchPackage(value: unknown): PackageValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(value)) return { valid: false, errors: ["The file does not contain a JSON object."], warnings };
  if (value.schema_name !== "whale_acoustic_lab_research_package") errors.push("Unsupported schema name; expected whale_acoustic_lab_research_package.");
  if (value.schema_version !== "1.0.0") errors.push(`Unsupported research-package version: ${String(value.schema_version ?? "missing")}.`);
  if (!string(value.export_timestamp) || Number.isNaN(Date.parse(value.export_timestamp))) errors.push("Export timestamp is missing or invalid.");
  if (!isObject(value.audio)) errors.push("Missing audio metadata.");
  else {
    if (!string(value.audio.sha256) || !/^[a-f0-9]{64}$/i.test(value.audio.sha256)) errors.push("Audio SHA-256 must contain exactly 64 hexadecimal characters.");
    if (!string(value.audio.original_filename)) errors.push("Missing original filename.");
    if (!finite(value.audio.original_duration_seconds) || value.audio.original_duration_seconds < 0) errors.push("Original duration must be a non-negative number.");
    if (!finite(value.audio.analyzed_duration_seconds) || value.audio.analyzed_duration_seconds <= 0) errors.push("Analyzed duration must be a positive number.");
    if (!finite(value.audio.sample_rate_hz) || value.audio.sample_rate_hz <= 0) errors.push("Sample rate must be a positive number.");
  }
  if (!isObject(value.original_automatic_analysis)) errors.push("Missing original automatic analysis.");
  else {
    if (!Array.isArray(value.original_automatic_analysis.click_detections) || !value.original_automatic_analysis.click_detections.every((item) => validAnnotation(item, "click"))) errors.push("Automatic click detections are missing or malformed.");
    if (!Array.isArray(value.original_automatic_analysis.click_timestamps_seconds) || !value.original_automatic_analysis.click_timestamps_seconds.every(finite)) errors.push("Automatic click timestamps are missing or malformed.");
    if (!Array.isArray(value.original_automatic_analysis.coda_boundaries) || !value.original_automatic_analysis.coda_boundaries.every((item) => {
      if (!isObject(item)) return false;
      return string(item.segment_id) && finite(item.start_time_seconds) && finite(item.end_time_seconds) && item.end_time_seconds >= item.start_time_seconds;
    })) errors.push("Automatic coda boundaries are missing or malformed.");
  }
  if (!isObject(value.reviewed_annotations)) errors.push("Missing reviewed annotations.");
  else {
    if (!Array.isArray(value.reviewed_annotations.clicks) || !value.reviewed_annotations.clicks.every((item) => validAnnotation(item, "click"))) errors.push("Reviewed click annotations are missing or malformed.");
    if (!Array.isArray(value.reviewed_annotations.codas) || !value.reviewed_annotations.codas.every((item) => validAnnotation(item, "coda"))) errors.push("Reviewed coda annotations are missing or malformed.");
    if (!finite(value.reviewed_annotations.document_version) || !string(value.reviewed_annotations.last_reviewed_at)) errors.push("Reviewed annotation metadata is missing or malformed.");
    if (!Array.isArray(value.reviewed_annotations.recalculated_codas)) warnings.push("Locally recalculated coda measurements are missing.");
  }
  if (!Array.isArray(value.human_corrections)) errors.push("Human correction ledger is missing or malformed.");
  if (!Array.isArray(value.existing_acoustic_neighbors)) warnings.push("Acoustic-neighbor records are missing.");
  if (!Array.isArray(value.scientific_limitations) || !value.scientific_limitations.every(string)) warnings.push("Scientific limitation statements are missing or incomplete.");

  let embedding: number[] | undefined;
  let embeddingDimension: number | undefined;
  if (value.existing_wham_embedding === null || value.existing_wham_embedding === undefined) warnings.push("WhAM embedding is not present in this package.");
  else if (!isObject(value.existing_wham_embedding) || !finite(value.existing_wham_embedding.dimension)) warnings.push("WhAM embedding metadata is malformed and will be ignored.");
  else {
    const dimension = value.existing_wham_embedding.dimension;
    const collapsed = dimension === WHAM_EXPECTED_EMBEDDING_DIMENSION ? collapsePackageEmbedding(value.existing_wham_embedding.values, dimension) : null;
    if (dimension !== WHAM_EXPECTED_EMBEDDING_DIMENSION) warnings.push(`WhAM embedding declares ${dimension} values; this explorer expects ${WHAM_EXPECTED_EMBEDDING_DIMENSION}, so it will be ignored.`);
    else if (!collapsed) warnings.push(`WhAM embedding does not contain a numeric vector matching its declared ${dimension}-value dimension and will be ignored.`);
    else { embedding = collapsed; embeddingDimension = dimension; }
  }
  return errors.length ? { valid: false, errors, warnings } : { valid: true, package: value as unknown as ResearchPackage, errors, warnings, embedding, embeddingDimension };
}

export async function parseResearchPackageFile(file: File): Promise<PackageValidationResult> {
  try {
    return validateResearchPackage(JSON.parse(await file.text()));
  } catch (error) {
    return { valid: false, errors: [error instanceof SyntaxError ? "The file is not valid JSON." : "The file could not be read."], warnings: [] };
  }
}
