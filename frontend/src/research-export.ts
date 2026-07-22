import type { AnalyzeResponse } from "./api";
import { calculateCodaMeasurements, type ResearchDocument } from "./research-model";

export const RESEARCH_EXPORT_SCHEMA_VERSION = "1.0.0";

export interface ResearchExportInput {
  response: AnalyzeResponse;
  automatic: ResearchDocument;
  reviewed: ResearchDocument;
  originalFilename: string;
  exportedAt: string;
}

export interface ResearchExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

export interface ResearchExportSet {
  json: ResearchExportFile;
  csv: ResearchExportFile;
  ravenClicks: ResearchExportFile;
  ravenCodas: ResearchExportFile;
}

const SCIENTIFIC_LIMITATIONS = [
  "Automatic click detections and coda boundaries are estimates, not verified scientific ground truth.",
  "Human-reviewed annotations record researcher judgments and are not necessarily scientific ground truth.",
  "Timing annotations do not provide a literal translation of whale communication.",
  "Acoustic-neighbor similarity does not establish shared meaning, identity, or intent.",
];

function correctionLedger(automatic: ResearchDocument, reviewed: ResearchDocument): object[] {
  const corrections: object[] = [];
  const reviewedClicks = new Map(reviewed.clicks.map((click) => [click.id, click]));
  const automaticClicks = new Map(automatic.clicks.map((click) => [click.id, click]));
  automatic.clicks.forEach((original) => {
    const current = reviewedClicks.get(original.id);
    if (!current) corrections.push({ record_type: "click", record_id: original.id, correction: "deleted", original });
    else if (current.source === "human_corrected" || JSON.stringify(current) !== JSON.stringify(original)) {
      corrections.push({ record_type: "click", record_id: original.id, correction: "modified", original, current });
    }
  });
  reviewed.clicks.filter((click) => !automaticClicks.has(click.id)).forEach((current) => {
    corrections.push({ record_type: "click", record_id: current.id, correction: "added", current });
  });

  const reviewedCodas = new Map(reviewed.codas.map((coda) => [coda.id, coda]));
  const automaticCodas = new Map(automatic.codas.map((coda) => [coda.id, coda]));
  automatic.codas.forEach((original) => {
    const current = reviewedCodas.get(original.id);
    if (!current) corrections.push({ record_type: "coda", record_id: original.id, correction: "deleted_or_joined", original });
    else if (current.source === "human_corrected" || JSON.stringify(current) !== JSON.stringify(original)) {
      corrections.push({ record_type: "coda", record_id: original.id, correction: "modified", original, current });
    }
  });
  reviewed.codas.filter((coda) => !automaticCodas.has(coda.id)).forEach((current) => {
    corrections.push({ record_type: "coda", record_id: current.id, correction: "added_or_split", current });
  });
  return corrections;
}

export function createResearchPackage(input: ResearchExportInput): Record<string, unknown> {
  const { response, automatic, reviewed } = input;
  const recalculatedCodas = [...reviewed.codas]
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((coda) => ({
      coda_id: coda.id,
      annotation_status: coda.status,
      annotation_source: coda.source,
      measurements: calculateCodaMeasurements(reviewed, coda.id, true),
    }));
  const embeddingPresent = response.embedding !== undefined && response.embedding !== null;
  return {
    schema_name: "whale_acoustic_lab_research_package",
    schema_version: RESEARCH_EXPORT_SCHEMA_VERSION,
    audio: {
      sha256: reviewed.audioSha256,
      original_filename: input.originalFilename,
      original_duration_seconds: response.uploaded_recording.original_duration_seconds,
      analyzed_duration_seconds: response.uploaded_recording.analyzed_duration_seconds,
      trim_start_seconds: response.uploaded_recording.trim_start_seconds,
      trim_end_seconds: response.uploaded_recording.trim_end_seconds,
      sample_rate_hz: response.uploaded_recording.sample_rate_hz,
      channel_count: response.uploaded_recording.channels ?? null,
      bit_depth: response.uploaded_recording.bit_depth ?? null,
    },
    export_timestamp: input.exportedAt,
    ground_truth_statement: {
      automatic_detections: SCIENTIFIC_LIMITATIONS[0],
      reviewed_annotations: SCIENTIFIC_LIMITATIONS[1],
    },
    original_automatic_analysis: {
      click_detections: automatic.clicks,
      click_timestamps_seconds: response.call_structure.estimated_click_onsets_seconds,
      inter_click_intervals_seconds: response.call_structure.estimated_inter_click_intervals_seconds,
      normalized_rhythm: response.call_structure.estimated_normalized_rhythm_pattern,
      coda_boundaries: response.coda_sequence.segments.map((segment) => ({
        segment_id: segment.segment_id,
        start_time_seconds: segment.start_time_seconds,
        end_time_seconds: segment.end_time_seconds,
        click_onsets_seconds: segment.click_onsets_seconds,
        inter_click_intervals_seconds: segment.inter_click_intervals_seconds,
        boundary_before: segment.boundary_before,
        uncertainty: segment.uncertainty,
      })),
      rejected_clicks: response.coda_sequence.rejected_clicks,
      ambiguous_non_boundary_gaps: response.coda_sequence.ambiguous_non_boundary_gaps,
    },
    reviewed_annotations: {
      document_version: reviewed.version,
      last_reviewed_at: reviewed.updatedAt,
      clicks: reviewed.clicks,
      codas: reviewed.codas,
      recalculated_codas: recalculatedCodas,
    },
    human_corrections: correctionLedger(automatic, reviewed),
    existing_wham_embedding: embeddingPresent ? {
      values: response.embedding,
      dimension: response.embedding_dimension,
    } : null,
    existing_acoustic_neighbors: response.matches,
    detector_and_segmentation: {
      click_detector: {
        estimate_status: response.call_structure.estimate_status,
        estimate_note: response.call_structure.estimate_note,
        normalized_rhythm_definition: response.call_structure.normalized_rhythm_definition,
        ground_truth_click_timestamps_available: response.call_structure.ground_truth_click_timestamps_available,
      },
      segmentation: {
        estimate_note: response.coda_sequence.estimate_note,
        settings: response.coda_sequence.segmentation_method,
      },
    },
    available_model_and_algorithm_identifiers: {
      embedding_dimension: response.embedding_dimension,
      processing_hardware_name: response.gpu_name,
      narration_model: response.ai_evidence_narration.model,
      narration_prompt_version: response.ai_evidence_narration.prompt_version,
      narration_evidence_version: response.ai_evidence_narration.evidence_version,
      narration_status: response.ai_evidence_narration.status,
    },
    scientific_limitations: [
      ...SCIENTIFIC_LIMITATIONS,
      response.call_structure.estimate_note,
      response.coda_sequence.estimate_note,
      response.coda_code_interpretation.interpretation.scientific_limits,
      response.similarity_statement,
    ].filter(Boolean),
  };
}

function spreadsheetSafeText(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  return /^[\t\r\n ]*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "number" ? String(value) : spreadsheetSafeText(value);
  return /[",\r\n\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tsvCell(value: string | number | null): string {
  if (value === null) return "";
  return typeof value === "number" ? String(value) : spreadsheetSafeText(value).replace(/[\t\r\n]+/g, " ");
}

function reviewedIciByClick(document: ResearchDocument): Map<string, number> {
  const values = new Map<string, number>();
  document.codas.forEach((coda) => {
    const clicks = document.clicks
      .filter((click) => click.codaId === coda.id && click.status !== "rejected")
      .sort((a, b) => a.timeSeconds - b.timeSeconds);
    clicks.slice(1).forEach((click, index) => values.set(click.id, click.timeSeconds - clicks[index].timeSeconds));
  });
  return values;
}

export function serializeAnnotationCsv(document: ResearchDocument): string {
  const headers = ["record_type", "recording_hash", "coda_id", "click_id", "begin_time_seconds", "end_time_seconds", "inter_click_interval_seconds", "status", "source", "researcher_note"];
  const rows: Array<Array<string | number | null>> = [];
  const ici = reviewedIciByClick(document);
  [...document.codas].sort((a, b) => a.startSeconds - b.startSeconds).forEach((coda) => {
    rows.push(["coda", document.audioSha256, coda.id, "", coda.startSeconds, coda.endSeconds, null, coda.status, coda.source, coda.note]);
  });
  [...document.clicks].sort((a, b) => a.timeSeconds - b.timeSeconds).forEach((click) => {
    rows.push(["click", document.audioSha256, click.codaId ?? "", click.id, click.timeSeconds, click.timeSeconds, ici.get(click.id) ?? null, click.status, click.source, click.note]);
  });
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

const RAVEN_HEADERS = ["Selection", "View", "Channel", "Begin Time (s)", "End Time (s)", "Low Freq (Hz)", "High Freq (Hz)", "Coda ID", "Click ID", "Status", "Source", "Note"];

export function serializeRavenClickTable(document: ResearchDocument, sampleRateHz: number, channel = 1): string {
  const nyquist = sampleRateHz / 2;
  const rows = [...document.clicks].sort((a, b) => a.timeSeconds - b.timeSeconds).map((click, index) => [
    index + 1, "Spectrogram 1", channel, click.timeSeconds, click.timeSeconds, 0, nyquist,
    click.codaId ?? "", click.id, click.status, click.source, click.note,
  ]);
  return [RAVEN_HEADERS.join("\t"), ...rows.map((row) => row.map(tsvCell).join("\t"))].join("\r\n") + "\r\n";
}

export function serializeRavenCodaTable(document: ResearchDocument, sampleRateHz: number, channel = 1): string {
  const nyquist = sampleRateHz / 2;
  const rows = [...document.codas].sort((a, b) => a.startSeconds - b.startSeconds).map((coda, index) => [
    index + 1, "Spectrogram 1", channel, coda.startSeconds, coda.endSeconds, 0, nyquist,
    coda.id, "", coda.status, coda.source, coda.note,
  ]);
  return [RAVEN_HEADERS.join("\t"), ...rows.map((row) => row.map(tsvCell).join("\t"))].join("\r\n") + "\r\n";
}

export function deterministicExportFilenames(audioSha256: string): Record<keyof ResearchExportSet, string> {
  const prefix = audioSha256.slice(0, 12);
  return {
    json: `${prefix}_whale-research-package.json`,
    csv: `${prefix}_whale-annotations.csv`,
    ravenClicks: `${prefix}_raven-click-selections.txt`,
    ravenCodas: `${prefix}_raven-coda-selections.txt`,
  };
}

export function canExportResearchData(input: ResearchExportInput): boolean {
  return /^[a-f0-9]{64}$/i.test(input.reviewed.audioSha256)
    && input.reviewed.audioSha256 === input.automatic.audioSha256
    && Number.isFinite(input.reviewed.durationSeconds)
    && input.reviewed.durationSeconds > 0
    && Number.isFinite(input.response.uploaded_recording.sample_rate_hz)
    && input.response.uploaded_recording.sample_rate_hz > 0;
}

export function buildResearchExports(input: ResearchExportInput): ResearchExportSet {
  if (!canExportResearchData(input)) throw new Error("Valid analyzed recording data is required before export.");
  const filenames = deterministicExportFilenames(input.reviewed.audioSha256);
  return {
    json: { filename: filenames.json, mimeType: "application/json;charset=utf-8", content: JSON.stringify(createResearchPackage(input), null, 2) + "\n" },
    csv: { filename: filenames.csv, mimeType: "text/csv;charset=utf-8", content: serializeAnnotationCsv(input.reviewed) },
    ravenClicks: { filename: filenames.ravenClicks, mimeType: "text/tab-separated-values;charset=utf-8", content: serializeRavenClickTable(input.reviewed, input.response.uploaded_recording.sample_rate_hz) },
    ravenCodas: { filename: filenames.ravenCodas, mimeType: "text/tab-separated-values;charset=utf-8", content: serializeRavenCodaTable(input.reviewed, input.response.uploaded_recording.sample_rate_hz) },
  };
}
