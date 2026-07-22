import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCorpus, createCorpusRecord, deduplicateCorpusRecords } from "./corpus-aggregation";
import { buildCorpusExports, serializeRecordingCsv, serializeCorpusSummaryJson, type CorpusExportInput } from "./corpus-export";
import { DEFAULT_CORPUS_FILTERS, filterCorpusRecords } from "./corpus-filter";
import { calculateOutlierScores } from "./corpus-outliers";
import { calculateDeterministicPca } from "./corpus-pca";
import { deserializeSavedCorpus, deterministicCorpusId, serializeCorpusForStorage } from "./corpus-persistence";
import { calculateCorpusSimilarity, cosineSimilarity, normalizeEmbedding } from "./corpus-similarity";
import type { CorpusRecord } from "./corpus-types";
import { validateResearchPackage } from "./corpus-validation";

const hash = (character: string): string => character.repeat(64);
const vector = (first: number, second: number): number[] => Array.from({ length: 1280 }, (_, index) => index === 0 ? first : index === 1 ? second : 0);

function researchPackage(audioHash = hash("a"), embedding: number[] | null = vector(1, 0), filename = "whale.wav"): Record<string, unknown> {
  const clicks = [
    { id: "click-1", timeSeconds: 0.1, codaId: "coda-1", status: "accepted", note: "", source: "automatic" },
    { id: "click-2", timeSeconds: 0.3, codaId: "coda-1", status: "uncertain", note: "review", source: "human_corrected" },
  ];
  const codas = [{ id: "coda-1", startSeconds: 0.1, endSeconds: 0.4, status: "accepted", note: "", source: "automatic" }];
  return {
    schema_name: "whale_acoustic_lab_research_package",
    schema_version: "1.0.0",
    export_timestamp: "2026-07-21T12:00:00.000Z",
    audio: { sha256: audioHash, original_filename: filename, original_duration_seconds: 1, analyzed_duration_seconds: 1, sample_rate_hz: 48_000, channel_count: 1 },
    original_automatic_analysis: {
      click_detections: clicks.map((click) => ({ ...click, source: "automatic" })),
      click_timestamps_seconds: [0.1, 0.3],
      coda_boundaries: [{ segment_id: "segment-1", start_time_seconds: 0.1, end_time_seconds: 0.4, nearest_published_family: { name: "2i" } }],
    },
    reviewed_annotations: {
      document_version: 1,
      last_reviewed_at: "2026-07-21T12:00:00.000Z",
      clicks,
      codas,
      recalculated_codas: [{ coda_id: "coda-1", annotation_status: "accepted", annotation_source: "automatic", measurements: { clickCount: 2, clickTimestamps: [0.1, 0.3], interClickIntervals: [0.2], meanInterval: 0.2, medianInterval: 0.2, normalizedRhythm: [1], duration: 0.3, regularity: "regular", coefficientOfVariation: 0, beginningMeanInterval: 0.2, endingMeanInterval: 0.2, beginningVersusEndingPace: "about the same pace" } }],
    },
    human_corrections: [{ record_type: "click", record_id: "click-2", correction: "modified" }],
    existing_wham_embedding: embedding === null ? null : { values: embedding, dimension: embedding.length },
    existing_acoustic_neighbors: [],
    detector_and_segmentation: { click_detector: { estimate_status: "estimated" }, segmentation: { settings: {} } },
    available_model_and_algorithm_identifiers: { embedding_dimension: 1280 },
    scientific_limitations: ["Review sets are not automatically scientific ground truth."],
  };
}

function record(audioHash: string, embedding: number[] | null, filename = `${audioHash[0]}.wav`): CorpusRecord {
  const validation = validateResearchPackage(researchPackage(audioHash, embedding, filename));
  assert.equal(validation.valid, true, validation.errors.join("; "));
  return createCorpusRecord(validation);
}

function analysis(records: CorpusRecord[]): Pick<CorpusExportInput, "similarity" | "outliers" | "pca"> {
  const similarity = calculateCorpusSimilarity(records);
  return { similarity, outliers: calculateOutlierScores(similarity, 2), pca: calculateDeterministicPca(records) };
}

function exportInput(records: CorpusRecord[]): CorpusExportInput {
  return { records, filters: { ...DEFAULT_CORPUS_FILTERS }, ...analysis(records), outlierNeighborCount: 2, generationTimestamp: "2026-07-21T13:00:00.000Z" };
}

test("accepts the existing research-package schema and aggregates reviewed data", () => {
  const validation = validateResearchPackage(researchPackage());
  assert.equal(validation.valid, true);
  assert.equal(validation.embedding?.length, 1280);
  const aggregate = aggregateCorpus([createCorpusRecord(validation)]);
  assert.equal(aggregate.totalReviewedClicks, 2);
  assert.equal(aggregate.humanCorrectedAnnotationCount, 1);
  assert.equal(aggregate.regularityDistribution.regular, 1);
});

test("rejects malformed and unsupported research packages with clear reasons", () => {
  const invalid = validateResearchPackage({ schema_name: "other", schema_version: "9" });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /Unsupported schema name/);
  assert.match(invalid.errors.join(" "), /Unsupported research-package version/);
  assert.match(invalid.errors.join(" "), /Missing audio metadata/);
});

test("reports missing embeddings and ignores wrong WhAM dimensions", () => {
  const missing = validateResearchPackage(researchPackage(hash("b"), null));
  assert.equal(missing.valid, true);
  assert.equal(missing.embedding, undefined);
  assert.match(missing.warnings.join(" "), /not present/);
  const wrong = validateResearchPackage(researchPackage(hash("c"), [1, 2, 3]));
  assert.equal(wrong.valid, true);
  assert.equal(wrong.embedding, undefined);
  assert.match(wrong.warnings.join(" "), /expects 1280/);
});

test("deduplicates recordings by the complete SHA-256", () => {
  const original = record(hash("a"), vector(1, 0));
  const duplicate = record(hash("a"), vector(0, 1), "renamed.wav");
  const result = deduplicateCorpusRecords([original], [duplicate]);
  assert.equal(result.records.length, 1);
  assert.equal(result.duplicates.length, 1);
});

test("cosine similarity normalizes vectors and handles numeric edge cases", () => {
  assert.deepEqual(normalizeEmbedding([3, 4]), [0.6, 0.8]);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 2]), null);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), null);
  assert.equal(normalizeEmbedding([Number.NaN]), null);
});

test("calculates deterministic pairwise similarity and nearest neighbors", () => {
  const records = [record(hash("a"), vector(1, 0)), record(hash("b"), vector(0.9, 0.1)), record(hash("c"), vector(0, 1))];
  const first = calculateCorpusSimilarity(records);
  const second = calculateCorpusSimilarity([...records].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.compatibleHashes.length, 3);
  assert.equal(first.nearestByHash[hash("a")]?.hash, hash("b"));
});

test("PCA is deterministic and reports bounded explained variance", () => {
  const records = [record(hash("a"), vector(1, 0)), record(hash("b"), vector(0.7, 0.7)), record(hash("c"), vector(0, 1))];
  const first = calculateDeterministicPca(records);
  const second = calculateDeterministicPca([...records].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.points.length, 3);
  assert.ok(first.explainedVariance[0] >= first.explainedVariance[1]);
  assert.ok(first.explainedVariance.every((value) => value >= 0 && value <= 1));
  assert.ok(first.explainedVariance[0] + first.explainedVariance[1] <= 1 + 1e-12);
});

test("PCA and outlier scoring handle empty and single-recording corpora", () => {
  assert.deepEqual(calculateDeterministicPca([]).points, []);
  const one = record(hash("a"), vector(1, 0));
  assert.deepEqual(calculateDeterministicPca([one]).points, [{ hash: hash("a"), x: 0, y: 0 }]);
  assert.equal(calculateOutlierScores(calculateCorpusSimilarity([one]), 5)[0].score, null);
});

test("outlier score is mean cosine distance to k nearest recordings", () => {
  const records = [record(hash("a"), vector(1, 0)), record(hash("b"), vector(0.99, 0.01)), record(hash("c"), vector(0, 1))];
  const scores = calculateOutlierScores(calculateCorpusSimilarity(records), 1);
  assert.equal(scores[0].hash, hash("c"));
  assert.equal(scores[0].neighborCountUsed, 1);
  assert.ok((scores[0].score ?? 0) > (scores.at(-1)?.score ?? 1));
});

test("filters by counts, status, corrections, embeddings, similarity, and outliers", () => {
  const corrected = record(hash("a"), vector(1, 0));
  const other = record(hash("b"), null);
  const records = [corrected, other];
  const similarity = calculateCorpusSimilarity(records);
  const outliers = calculateOutlierScores(similarity, 1);
  const result = filterCorpusRecords(records, { ...DEFAULT_CORPUS_FILTERS, minimumClickCount: 2, annotationStatus: "uncertain", humanCorrections: "yes", embeddingAvailable: "yes" }, similarity, outliers);
  assert.deepEqual(result.map((item) => item.hash), [hash("a")]);
  assert.equal(filterCorpusRecords(records, { ...DEFAULT_CORPUS_FILTERS, minimumNearestSimilarity: 0 }, similarity, outliers).length, 0);
});

test("corpus IDs are deterministic from sorted unique full hashes", () => {
  const first = deterministicCorpusId([hash("b"), hash("a"), hash("a")]);
  assert.equal(first, deterministicCorpusId([hash("a"), hash("b")]));
  assert.notEqual(first, deterministicCorpusId([hash("a")]));
});

test("corpus JSON and CSV exports include reproducibility metadata", () => {
  const records = [record(hash("a"), vector(1, 0)), record(hash("b"), vector(0, 1))];
  const input = exportInput(records);
  const json = JSON.parse(serializeCorpusSummaryJson(input)) as Record<string, unknown>;
  assert.equal(json.schema_name, "whale_acoustic_lab_corpus_summary");
  assert.equal(json.corpus_schema_version, "1.0.0");
  assert.match(JSON.stringify(json), /not biological discoveries/);
  const csv = serializeRecordingCsv(input);
  assert.match(csv, /pca_configuration/);
  assert.match(csv, /cosine similarity/i);
  const files = buildCorpusExports(input);
  assert.match(files.summary.filename, /^corpus-[a-f0-9]{16}_summary\.json$/);
  assert.match(files.similarities.content, /left_audio_sha256/);
  assert.match(files.outliers.content, /model-space candidate for manual review/);
});

test("recording CSV neutralizes spreadsheet formula characters and preserves numbers", () => {
  const item = record(hash("a"), vector(1, 0), '=IMPORTXML("bad")\nname');
  item.codaDurationsSeconds = [0.123456789012345];
  const csv = serializeRecordingCsv(exportInput([item]));
  assert.match(csv, /'=IMPORTXML/);
  assert.match(serializeCorpusSummaryJson(exportInput([item])), /0\.123456789012345/);
});

test("IndexedDB storage serialization round-trips deterministically", () => {
  const records = [record(hash("b"), null), record(hash("a"), vector(1, 0))];
  const saved = serializeCorpusForStorage(records, "  Local review  ", "2026-07-21T13:00:00.000Z");
  assert.equal(saved.name, "Local review");
  assert.deepEqual(saved.audioHashes, [hash("a"), hash("b")]);
  assert.deepEqual(deserializeSavedCorpus(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(deserializeSavedCorpus({ ...saved, corpusId: "tampered" }), null);
  assert.equal(deserializeSavedCorpus({ ...saved, packages: [] }), null);
});
