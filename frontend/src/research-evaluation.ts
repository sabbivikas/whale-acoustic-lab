import type { ResearchClick, ResearchCoda, ResearchDocument } from "./research-model";

export const ANNOTATION_EVALUATION_ALGORITHM_VERSION = "annotation-evaluation-v1";
export const DEFAULT_CLICK_TOLERANCE_SECONDS = 0.010;
export const MIN_CLICK_TOLERANCE_SECONDS = 0.001;
export const MAX_CLICK_TOLERANCE_SECONDS = 0.100;
export const CODA_MATCH_IOU_THRESHOLD = 0.5;

export interface ClickMatch {
  automaticId: string;
  reviewedId: string;
  automaticTimeSeconds: number;
  reviewedTimeSeconds: number;
  absoluteTimingErrorSeconds: number;
}

export interface ClickEvaluation {
  automaticCount: number;
  reviewedCount: number;
  matchedCount: number;
  unmatchedAutomaticCount: number;
  unmatchedReviewedCount: number;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  meanAbsoluteTimingErrorSeconds: number | null;
  medianAbsoluteTimingErrorSeconds: number | null;
  maximumTimingErrorSeconds: number | null;
  matches: ClickMatch[];
  unmatchedAutomatic: ResearchClick[];
  unmatchedReviewed: ResearchClick[];
}

export interface CodaMatch {
  automaticId: string;
  reviewedId: string;
  automaticStartSeconds: number;
  automaticEndSeconds: number;
  reviewedStartSeconds: number;
  reviewedEndSeconds: number;
  absoluteStartErrorSeconds: number;
  absoluteEndErrorSeconds: number;
  intersectionOverUnion: number;
}

export interface CodaRelationCandidate {
  automaticIds: string[];
  reviewedIds: string[];
}

export interface CodaEvaluation {
  automaticCount: number;
  reviewedCount: number;
  matchedCount: number;
  possibleSplitErrorCount: number;
  possibleMergeErrorCount: number;
  unmatchedAutomaticCount: number;
  unmatchedReviewedCount: number;
  meanAbsoluteBoundaryStartErrorSeconds: number | null;
  meanAbsoluteBoundaryEndErrorSeconds: number | null;
  meanIntersectionOverUnion: number | null;
  matches: CodaMatch[];
  possibleSplitErrors: CodaRelationCandidate[];
  possibleMergeErrors: CodaRelationCandidate[];
  unmatchedAutomatic: ResearchCoda[];
  unmatchedReviewed: ResearchCoda[];
}

export interface AnnotationEvaluation {
  algorithmVersion: string;
  clickMatchingToleranceSeconds: number;
  codaMatchIntersectionOverUnionThreshold: number;
  clicks: ClickEvaluation;
  codas: CodaEvaluation;
}

interface AlignmentCell<T> {
  count: number;
  cost: number;
  pairs: T[];
}

function better<T>(left: AlignmentCell<T>, right: AlignmentCell<T>): AlignmentCell<T> {
  if (left.count !== right.count) return left.count > right.count ? left : right;
  if (Math.abs(left.cost - right.cost) > Number.EPSILON) return left.cost < right.cost ? left : right;
  return JSON.stringify(left.pairs) <= JSON.stringify(right.pairs) ? left : right;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function clampClickTolerance(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_CLICK_TOLERANCE_SECONDS;
  return Math.max(MIN_CLICK_TOLERANCE_SECONDS, Math.min(MAX_CLICK_TOLERANCE_SECONDS, seconds));
}

export function matchClicksOneToOne(automaticInput: ResearchClick[], reviewedInput: ResearchClick[], toleranceSeconds: number): ClickMatch[] {
  const tolerance = clampClickTolerance(toleranceSeconds);
  const automatic = [...automaticInput].sort((a, b) => a.timeSeconds - b.timeSeconds || a.id.localeCompare(b.id));
  const reviewed = [...reviewedInput].sort((a, b) => a.timeSeconds - b.timeSeconds || a.id.localeCompare(b.id));
  const table: Array<Array<AlignmentCell<ClickMatch>>> = Array.from({ length: automatic.length + 1 }, () =>
    Array.from({ length: reviewed.length + 1 }, () => ({ count: 0, cost: 0, pairs: [] })),
  );
  for (let left = 1; left <= automatic.length; left += 1) {
    for (let right = 1; right <= reviewed.length; right += 1) {
      let best = better(table[left - 1][right], table[left][right - 1]);
      const error = Math.abs(automatic[left - 1].timeSeconds - reviewed[right - 1].timeSeconds);
      if (error <= tolerance) {
        const previous = table[left - 1][right - 1];
        const match: ClickMatch = {
          automaticId: automatic[left - 1].id,
          reviewedId: reviewed[right - 1].id,
          automaticTimeSeconds: automatic[left - 1].timeSeconds,
          reviewedTimeSeconds: reviewed[right - 1].timeSeconds,
          absoluteTimingErrorSeconds: error,
        };
        best = better(best, { count: previous.count + 1, cost: previous.cost + error, pairs: [...previous.pairs, match] });
      }
      table[left][right] = best;
    }
  }
  return table[automatic.length][reviewed.length].pairs;
}

export function evaluateClicks(automatic: ResearchClick[], reviewed: ResearchClick[], toleranceSeconds: number): ClickEvaluation {
  const matches = matchClicksOneToOne(automatic, reviewed, toleranceSeconds);
  const automaticMatched = new Set(matches.map((match) => match.automaticId));
  const reviewedMatched = new Set(matches.map((match) => match.reviewedId));
  const errors = matches.map((match) => match.absoluteTimingErrorSeconds);
  const precision = automatic.length ? matches.length / automatic.length : null;
  const recall = reviewed.length ? matches.length / reviewed.length : null;
  const f1Score = precision !== null && recall !== null && precision + recall > 0 ? 2 * precision * recall / (precision + recall) : null;
  const unmatchedAutomatic = automatic.filter((click) => !automaticMatched.has(click.id));
  const unmatchedReviewed = reviewed.filter((click) => !reviewedMatched.has(click.id));
  return {
    automaticCount: automatic.length,
    reviewedCount: reviewed.length,
    matchedCount: matches.length,
    unmatchedAutomaticCount: unmatchedAutomatic.length,
    unmatchedReviewedCount: unmatchedReviewed.length,
    precision,
    recall,
    f1Score,
    meanAbsoluteTimingErrorSeconds: mean(errors),
    medianAbsoluteTimingErrorSeconds: median(errors),
    maximumTimingErrorSeconds: errors.length ? Math.max(...errors) : null,
    matches,
    unmatchedAutomatic,
    unmatchedReviewed,
  };
}

export function codaIntersectionOverUnion(left: Pick<ResearchCoda, "startSeconds" | "endSeconds">, right: Pick<ResearchCoda, "startSeconds" | "endSeconds">): number {
  const intersection = Math.max(0, Math.min(left.endSeconds, right.endSeconds) - Math.max(left.startSeconds, right.startSeconds));
  const union = Math.max(left.endSeconds, right.endSeconds) - Math.min(left.startSeconds, right.startSeconds);
  return union > 0 ? intersection / union : 0;
}

function matchCodasOneToOne(automaticInput: ResearchCoda[], reviewedInput: ResearchCoda[]): CodaMatch[] {
  const automatic = [...automaticInput].sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id));
  const reviewed = [...reviewedInput].sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id));
  const table: Array<Array<AlignmentCell<CodaMatch>>> = Array.from({ length: automatic.length + 1 }, () =>
    Array.from({ length: reviewed.length + 1 }, () => ({ count: 0, cost: 0, pairs: [] })),
  );
  for (let left = 1; left <= automatic.length; left += 1) {
    for (let right = 1; right <= reviewed.length; right += 1) {
      let best = better(table[left - 1][right], table[left][right - 1]);
      const original = automatic[left - 1];
      const current = reviewed[right - 1];
      const iou = codaIntersectionOverUnion(original, current);
      if (iou >= CODA_MATCH_IOU_THRESHOLD) {
        const previous = table[left - 1][right - 1];
        const match: CodaMatch = {
          automaticId: original.id,
          reviewedId: current.id,
          automaticStartSeconds: original.startSeconds,
          automaticEndSeconds: original.endSeconds,
          reviewedStartSeconds: current.startSeconds,
          reviewedEndSeconds: current.endSeconds,
          absoluteStartErrorSeconds: Math.abs(original.startSeconds - current.startSeconds),
          absoluteEndErrorSeconds: Math.abs(original.endSeconds - current.endSeconds),
          intersectionOverUnion: iou,
        };
        best = better(best, { count: previous.count + 1, cost: previous.cost + (1 - iou), pairs: [...previous.pairs, match] });
      }
      table[left][right] = best;
    }
  }
  return table[automatic.length][reviewed.length].pairs;
}

function overlaps(left: ResearchCoda, right: ResearchCoda): boolean {
  return Math.min(left.endSeconds, right.endSeconds) > Math.max(left.startSeconds, right.startSeconds);
}

export function evaluateCodas(automatic: ResearchCoda[], reviewed: ResearchCoda[]): CodaEvaluation {
  const matches = matchCodasOneToOne(automatic, reviewed);
  const automaticMatched = new Set(matches.map((match) => match.automaticId));
  const reviewedMatched = new Set(matches.map((match) => match.reviewedId));
  const possibleSplitErrors = automatic.flatMap((original) => {
    const reviewedIds = reviewed.filter((current) => overlaps(original, current)).map((current) => current.id);
    return reviewedIds.length > 1 ? [{ automaticIds: [original.id], reviewedIds }] : [];
  });
  const possibleMergeErrors = reviewed.flatMap((current) => {
    const automaticIds = automatic.filter((original) => overlaps(original, current)).map((original) => original.id);
    return automaticIds.length > 1 ? [{ automaticIds, reviewedIds: [current.id] }] : [];
  });
  const unmatchedAutomatic = automatic.filter((coda) => !automaticMatched.has(coda.id));
  const unmatchedReviewed = reviewed.filter((coda) => !reviewedMatched.has(coda.id));
  return {
    automaticCount: automatic.length,
    reviewedCount: reviewed.length,
    matchedCount: matches.length,
    possibleSplitErrorCount: possibleSplitErrors.length,
    possibleMergeErrorCount: possibleMergeErrors.length,
    unmatchedAutomaticCount: unmatchedAutomatic.length,
    unmatchedReviewedCount: unmatchedReviewed.length,
    meanAbsoluteBoundaryStartErrorSeconds: mean(matches.map((match) => match.absoluteStartErrorSeconds)),
    meanAbsoluteBoundaryEndErrorSeconds: mean(matches.map((match) => match.absoluteEndErrorSeconds)),
    meanIntersectionOverUnion: mean(matches.map((match) => match.intersectionOverUnion)),
    matches,
    possibleSplitErrors,
    possibleMergeErrors,
    unmatchedAutomatic,
    unmatchedReviewed,
  };
}

export function evaluateAnnotations(automatic: ResearchDocument, reviewed: ResearchDocument, toleranceSeconds = DEFAULT_CLICK_TOLERANCE_SECONDS): AnnotationEvaluation {
  const automaticClicks = [...automatic.clicks];
  const reviewedClicks = reviewed.clicks.filter((click) => click.status !== "rejected");
  const automaticCodas = [...automatic.codas];
  const reviewedCodas = reviewed.codas.filter((coda) => coda.status !== "rejected");
  return {
    algorithmVersion: ANNOTATION_EVALUATION_ALGORITHM_VERSION,
    clickMatchingToleranceSeconds: clampClickTolerance(toleranceSeconds),
    codaMatchIntersectionOverUnionThreshold: CODA_MATCH_IOU_THRESHOLD,
    clicks: evaluateClicks(automaticClicks, reviewedClicks, toleranceSeconds),
    codas: evaluateCodas(automaticCodas, reviewedCodas),
  };
}

export function evaluationSummary(evaluation: AnnotationEvaluation): string[] {
  const toleranceMilliseconds = evaluation.clickMatchingToleranceSeconds * 1000;
  const { clicks } = evaluation;
  const automaticSentence = clicks.unmatchedAutomaticCount === 0
    ? "No automatic detections lacked a reviewed match."
    : `${clicks.unmatchedAutomaticCount} automatic detection${clicks.unmatchedAutomaticCount === 1 ? " did" : "s did"} not have a reviewed match.`;
  const reviewedSentence = clicks.unmatchedReviewedCount === 0
    ? "No reviewed clicks were missing from the automatic analysis."
    : `${clicks.unmatchedReviewedCount} reviewed click${clicks.unmatchedReviewedCount === 1 ? " was" : "s were"} not present in the automatic analysis.`;
  return [
    `The automatic detector matched ${clicks.matchedCount} of ${clicks.reviewedCount} reviewed clicks within ${Number.isInteger(toleranceMilliseconds) ? toleranceMilliseconds : toleranceMilliseconds.toFixed(1)} ms.`,
    automaticSentence,
    reviewedSentence,
  ];
}

export interface EvaluationExportInput {
  audioSha256: string;
  evaluationTimestamp: string;
  evaluation: AnnotationEvaluation;
}

export interface EvaluationExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

export function deterministicEvaluationFilenames(audioSha256: string): { json: string; csv: string } {
  const prefix = audioSha256.slice(0, 12);
  return { json: `${prefix}_annotation-evaluation.json`, csv: `${prefix}_annotation-evaluation.csv` };
}

export function serializeEvaluationJson(input: EvaluationExportInput): string {
  return JSON.stringify({
    schema_name: "whale_acoustic_lab_annotation_evaluation",
    schema_version: "1.0.0",
    algorithm_version: input.evaluation.algorithmVersion,
    audio_sha256: input.audioSha256,
    evaluation_timestamp: input.evaluationTimestamp,
    matching_tolerance_seconds: input.evaluation.clickMatchingToleranceSeconds,
    coda_match_iou_threshold: input.evaluation.codaMatchIntersectionOverUnionThreshold,
    click_metrics: input.evaluation.clicks,
    coda_metrics: input.evaluation.codas,
    limitations: [
      "The reviewed annotations are a review set and are not automatically scientific ground truth.",
      "Metrics describe agreement with this review set under the configured temporal tolerance and coda IoU heuristic.",
      "Automatic and reviewed annotations may both contain errors.",
    ],
  }, null, 2) + "\n";
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "number" ? String(value) : (/^[\s]*[=+\-@]/.test(value) ? `'${value}` : value);
  return /[",\r\n\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeEvaluationCsv(input: EvaluationExportInput): string {
  const headers = ["record_type", "match_status", "automatic_id", "reviewed_id", "automatic_begin_seconds", "automatic_end_seconds", "reviewed_begin_seconds", "reviewed_end_seconds", "absolute_timing_error_seconds", "absolute_start_error_seconds", "absolute_end_error_seconds", "intersection_over_union", "click_tolerance_seconds", "algorithm_version"];
  const rows: Array<Array<string | number | null>> = [];
  input.evaluation.clicks.matches.forEach((match) => rows.push(["click", "matched", match.automaticId, match.reviewedId, match.automaticTimeSeconds, match.automaticTimeSeconds, match.reviewedTimeSeconds, match.reviewedTimeSeconds, match.absoluteTimingErrorSeconds, null, null, null, input.evaluation.clickMatchingToleranceSeconds, input.evaluation.algorithmVersion]));
  input.evaluation.clicks.unmatchedAutomatic.forEach((click) => rows.push(["click", "unmatched_automatic", click.id, "", click.timeSeconds, click.timeSeconds, null, null, null, null, null, null, input.evaluation.clickMatchingToleranceSeconds, input.evaluation.algorithmVersion]));
  input.evaluation.clicks.unmatchedReviewed.forEach((click) => rows.push(["click", "unmatched_reviewed", "", click.id, null, null, click.timeSeconds, click.timeSeconds, null, null, null, null, input.evaluation.clickMatchingToleranceSeconds, input.evaluation.algorithmVersion]));
  input.evaluation.codas.matches.forEach((match) => rows.push(["coda", "matched", match.automaticId, match.reviewedId, match.automaticStartSeconds, match.automaticEndSeconds, match.reviewedStartSeconds, match.reviewedEndSeconds, null, match.absoluteStartErrorSeconds, match.absoluteEndErrorSeconds, match.intersectionOverUnion, input.evaluation.clickMatchingToleranceSeconds, input.evaluation.algorithmVersion]));
  input.evaluation.codas.unmatchedAutomatic.forEach((coda) => rows.push(["coda", "unmatched_automatic", coda.id, "", coda.startSeconds, coda.endSeconds, null, null, null, null, null, null, input.evaluation.clickMatchingToleranceSeconds, input.evaluation.algorithmVersion]));
  input.evaluation.codas.unmatchedReviewed.forEach((coda) => rows.push(["coda", "unmatched_reviewed", "", coda.id, null, null, coda.startSeconds, coda.endSeconds, null, null, null, null, input.evaluation.clickMatchingToleranceSeconds, input.evaluation.algorithmVersion]));
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export function buildEvaluationExports(input: EvaluationExportInput): { json: EvaluationExportFile; csv: EvaluationExportFile } {
  const names = deterministicEvaluationFilenames(input.audioSha256);
  return {
    json: { filename: names.json, mimeType: "application/json;charset=utf-8", content: serializeEvaluationJson(input) },
    csv: { filename: names.csv, mimeType: "text/csv;charset=utf-8", content: serializeEvaluationCsv(input) },
  };
}
