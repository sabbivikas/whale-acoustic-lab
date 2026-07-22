import assert from "node:assert/strict";
import test from "node:test";
import type { AnalyzeResponse } from "./api";
import {
  buildResearchExports,
  createResearchPackage,
  deterministicExportFilenames,
  serializeAnnotationCsv,
  serializeRavenClickTable,
  serializeRavenCodaTable,
  type ResearchExportInput,
} from "./research-export";
import { loadResearchDocument, moveClick, saveResearchDocument, type ResearchDocument, type StorageLike } from "./research-model";

const hash = "0123456789abcdef".repeat(4);
const automatic: ResearchDocument = {
  version: 1,
  audioSha256: hash,
  durationSeconds: 2.5,
  updatedAt: "2026-07-21T12:00:00.000Z",
  codas: [{ id: "auto-coda-1", startSeconds: 0.123456789012345, endSeconds: 0.9, status: "accepted", note: "", source: "automatic" }],
  clicks: [
    { id: "auto-click-1", timeSeconds: 0.123456789012345, codaId: "auto-coda-1", status: "accepted", note: "", source: "automatic" },
    { id: "auto-click-2", timeSeconds: 0.456789012345678, codaId: "auto-coda-1", status: "accepted", note: "", source: "automatic" },
  ],
};

function response(): AnalyzeResponse {
  return {
    embedding: [[0.1, 0.2]], embedding_dimension: 2, processing_time_seconds: 1, gpu_name: "existing-hardware-name",
    uploaded_recording: { filename: "whale.wav", duration_seconds: 3, original_duration_seconds: 3, analyzed_duration_seconds: 2.5, trim_start_seconds: 0.2, trim_end_seconds: 2.7, trimming_applied: true, sample_rate_hz: 48_000, channels: 2, bit_depth: 16 },
    matches: [{ reference_id: "r1", original_dswp_filename: "ref.wav", source_url: "https://example.test/ref.wav", raw_cosine_similarity: 0.9, reference_percentile: 88, duration_seconds: 2, sample_rate_hz: 48_000, license: "CC BY 4.0", dataset_location: "Dominica", collection_period: "2005" }],
    reference_percentile_definition: "existing definition", similarity_statement: "Similarity does not establish meaning.",
    ai_evidence_narration: { status: "cache_hit", model: "existing-model-id", prompt_version: "p1", evidence_version: "e1", content: { headline: "", sequence_explanation: "", why_it_is_interesting: "", evidence_points: ["", "", ""], creative_analogy: "", uncertainty: "", literal_translation: false } },
    call_structure: { estimate_status: "estimated", ground_truth_click_timestamps_available: false, estimate_note: "Automatic click timestamps are estimates.", estimated_click_count: 2, estimated_click_onsets_seconds: [0.123456789012345, 0.456789012345678], estimated_inter_click_intervals_seconds: [0.333332223333333], estimated_average_inter_click_interval_seconds: 0.333332223333333, recording_duration_seconds: 2.5, estimated_normalized_rhythm_pattern: [1], normalized_rhythm_definition: "ICI divided by total ICI" },
    coda_code_interpretation: {
      published_tempo_type: null,
      measured_rhythm: {} as AnalyzeResponse["coda_code_interpretation"]["measured_rhythm"],
      published_rhythm_match: { status: "no_close_published_pattern", message: "", estimated_click_count: 2, normalized_inter_click_intervals: [1], best_vs_second_best_margin: null, matches: [] },
      interpretation: { observed: { estimated_clicks: 2, rhythm_family: null, tempo_type: null }, interaction_hypothesis: { role: "unclear", evidence_level: "weak", explanation: "", supporting_statistics: [], rule_triggered: "none" }, creative_analogy: { text: "", label: "" }, scientific_limits: "Literal meaning is unknown.", scientific_sources: [] },
    },
    coda_sequence: {
      probable_coda_count: 1, rejected_click_count: 0, rejected_clicks: [], ambiguous_non_boundary_gaps: [], estimate_note: "Coda boundaries are estimated.",
      segmentation_method: { split_threshold_seconds: 0.75, ambiguous_gap_lower_seconds: 0.55, clear_boundary_seconds: 1, boundary_rule: "existing-rule" },
      sequence_interpretation: { pattern: "single", explanation: "", measured_summary: "", conversational_role_summary: "", label: "" },
      segments: [{ segment_id: "segment-1", start_time_seconds: 0.123456789012345, end_time_seconds: 0.9, click_count: 2, click_onsets_seconds: [0.123456789012345, 0.456789012345678], inter_click_intervals_seconds: [0.333332223333333], boundary_before: null, uncertainty: [], analysis: {} as AnalyzeResponse["coda_code_interpretation"] }],
    },
  };
}

function input(reviewed = automatic): ResearchExportInput {
  return { response: response(), automatic, reviewed, originalFilename: "original whale.wav", exportedAt: "2026-07-21T15:30:00.000Z" };
}

test("JSON package contains provenance, automatic data, reviewed values, embedding, neighbors, and limitations", () => {
  const reviewed = moveClick(automatic, "auto-click-2", 0.5);
  const packageValue = createResearchPackage(input(reviewed));
  assert.equal(packageValue.schema_version, "1.0.0");
  assert.deepEqual((packageValue.audio as Record<string, unknown>).sha256, hash);
  assert.ok(Array.isArray(packageValue.human_corrections));
  assert.deepEqual((packageValue.existing_wham_embedding as Record<string, unknown>).values, [[0.1, 0.2]]);
  assert.equal((packageValue.existing_acoustic_neighbors as unknown[]).length, 1);
  assert.match(JSON.stringify(packageValue.scientific_limitations), /not necessarily scientific ground truth/i);
  const recalculated = ((packageValue.reviewed_annotations as Record<string, unknown>).recalculated_codas as Array<Record<string, unknown>>)[0];
  assert.ok(recalculated.measurements);
  assert.match(JSON.stringify(recalculated.measurements), /0\.376543210987655/);
});

test("CSV emits one row per coda and click with full numeric precision", () => {
  const csv = serializeAnnotationCsv(automatic);
  assert.equal(csv.trim().split("\r\n").length, 4);
  assert.match(csv, /0\.123456789012345/);
  assert.match(csv, /0\.333332223333333/);
  assert.match(csv, /coda,/);
  assert.match(csv, /click,/);
});

test("CSV safely quotes commas, quotes, newlines, tabs, and formula-leading text", () => {
  const reviewed: ResearchDocument = { ...automatic, clicks: automatic.clicks.map((click, index) => ({ ...click, note: index ? "@SUM(A1:A2)" : "=1+1, \"quoted\"\nnew\tline" })) };
  const csv = serializeAnnotationCsv(reviewed);
  assert.match(csv, /"'=1\+1, ""quoted""\nnew\tline"/);
  assert.match(csv, /'@SUM\(A1:A2\)/);
});

test("Raven click table uses point selections, Nyquist bounds, and safe notes", () => {
  const reviewed: ResearchDocument = { ...automatic, clicks: automatic.clicks.map((click, index) => ({ ...click, note: index ? "" : "+formula\tnew\nline" })) };
  const table = serializeRavenClickTable(reviewed, 48_000);
  const lines = table.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /Begin Time \(s\)\tEnd Time \(s\)\tLow Freq \(Hz\)\tHigh Freq \(Hz\)/);
  assert.match(lines[1], /\t0\t24000\t/);
  assert.match(lines[1], /'\+formula new line$/);
  const cells = lines[1].split("\t");
  assert.equal(cells[3], cells[4]);
});

test("Raven coda table uses region boundaries and Nyquist bounds", () => {
  const table = serializeRavenCodaTable(automatic, 48_000);
  const cells = table.trim().split("\r\n")[1].split("\t");
  assert.equal(cells[3], "0.123456789012345");
  assert.equal(cells[4], "0.9");
  assert.equal(cells[5], "0");
  assert.equal(cells[6], "24000");
  assert.equal(cells[7], "auto-coda-1");
});

test("filenames are deterministic and begin with the first 12 hash characters", () => {
  assert.deepEqual(deterministicExportFilenames(hash), {
    json: "0123456789ab_whale-research-package.json",
    csv: "0123456789ab_whale-annotations.csv",
    ravenClicks: "0123456789ab_raven-click-selections.txt",
    ravenCodas: "0123456789ab_raven-coda-selections.txt",
  });
});

test("a restored localStorage draft is the reviewed state exported", () => {
  const values = new Map<string, string>();
  const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
  const edited = moveClick(automatic, "auto-click-2", 0.500000000000001);
  saveResearchDocument(storage, edited);
  const restored = loadResearchDocument(storage, hash)!;
  const exports = buildResearchExports(input(restored));
  const parsed = JSON.parse(exports.json.content) as { reviewed_annotations: { clicks: Array<{ timeSeconds: number }> } };
  assert.equal(parsed.reviewed_annotations.clicks[1].timeSeconds, 0.500000000000001);
  assert.match(exports.csv.content, /0\.500000000000001/);
});
