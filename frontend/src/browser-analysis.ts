import type { AnalyzeResponse, MeasuredRhythm } from "./api";
import rhythmIndexData from "./data/rhythm-reference-index.v1.json";
import segmentationThresholdsData from "./data/segmentation-thresholds.v1.json";

type JsonRecord = Record<string, any>;

const RHYTHM_INDEX = rhythmIndexData as JsonRecord;
const THRESHOLDS = segmentationThresholdsData as JsonRecord;
const ESTIMATE_NOTE = "Click locations are estimated from the waveform and were not supplied as scientific annotations.";
const SEGMENT_NOTE = "Coda boundaries and conversational roles are algorithmic estimates derived from waveform click onsets and public dataset statistics; they are not literal translations.";
const ANALOGY_LABEL = "Creative musical analogy based only on rhythm — not literal whale meaning";

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function standardDeviation(values: number[]): number {
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function normalizedLinearSlope(values: number[]): [number, number] {
  if (values.length < 2 || mean(values) === 0) return [0, 0];
  const xs = values.map((_, index) => index);
  const meanX = mean(xs), meanY = mean(values);
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const slope = xs.reduce((sum, x, index) => sum + (x - meanX) * (values[index] - meanY), 0) / denominator;
  const predicted = xs.map((x) => meanY + slope * (x - meanX));
  const total = values.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const residual = values.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  return [slope / meanY, total === 0 ? 1 : Math.max(0, 1 - residual / total)];
}

function normalizeIntervals(intervals: number[]): number[] {
  const total = intervals.reduce((sum, value) => sum + value, 0);
  return total > 0 ? intervals.map((value) => value / total) : [];
}

function matchRhythm(intervals: number[]): JsonRecord {
  const normalized = normalizeIntervals(intervals);
  const clickCount = normalized.length + 1;
  const candidates = RHYTHM_INDEX.rhythm_families.filter((family: JsonRecord) => family.click_count === clickCount);
  if (!candidates.length) {
    return {
      status: "no_close_published_pattern",
      message: "No close published pattern found",
      estimated_click_count: clickCount,
      normalized_inter_click_intervals: normalized,
      matches: [],
      best_vs_second_best_margin: null,
      abstention_reason: "No published EC1 rhythm family has this click count.",
    };
  }
  const matches = candidates.map((family: JsonRecord) => {
    const distance = normalized.reduce(
      (sum, value, index) => sum + (value - family.centroid_normalized_intervals[index]) ** 2,
      0,
    ) / normalized.length;
    const distribution = family.reference_distances_to_centroid as number[];
    return {
      rhythm_family_id: family.rhythm_family_id,
      rhythm_family: family.display_name,
      published_coda_types: family.published_coda_types,
      raw_mse_distance: distance,
      empirical_closeness_percentile: 100 * distribution.filter((value) => value >= distance).length / distribution.length,
      reference_sample_count: family.reference_sample_count,
    };
  }).sort((left: JsonRecord, right: JsonRecord) => left.raw_mse_distance - right.raw_mse_distance || left.rhythm_family_id - right.rhythm_family_id);
  const threshold = RHYTHM_INDEX.validation.abstention_thresholds_by_click_count[String(clickCount)] ?? null;
  const abstain = threshold === null || matches[0].raw_mse_distance > threshold;
  return {
    status: abstain ? "no_close_published_pattern" : "matched",
    message: abstain ? "No close published pattern found" : "Published pattern match found",
    estimated_click_count: clickCount,
    normalized_inter_click_intervals: normalized,
    matches: matches.slice(0, 3),
    best_vs_second_best_margin: matches.length > 1 ? matches[1].raw_mse_distance - matches[0].raw_mse_distance : null,
    abstention_threshold_mse: threshold,
    abstention_reason: abstain ? "The nearest MSE distance exceeds the leave-one-out 95th-percentile threshold." : null,
    percentile_definition: "The percentage of same-family reference codas whose distance to the family centroid is greater than or equal to this call's distance.",
  };
}

function measuredRhythm(intervals: number[], clickCount: number, rhythmMatch: JsonRecord): MeasuredRhythm {
  const calibration = RHYTHM_INDEX.same_click_count_calibration[String(clickCount)] ?? {
    sample_count: 0,
    duration_seconds_quantiles: { p10: .35, p25: .55, p50: .85, p75: 1.15, p90: 1.6 },
    regularity_cv_quantiles: { p33: .12, p67: .3 },
    absolute_normalized_slope_quantiles: { p33: .035, p67: .1 },
  };
  const duration = intervals.reduce((sum, value) => sum + value, 0);
  const average = mean(intervals), middle = median(intervals);
  const cv = intervals.length > 1 ? standardDeviation(intervals) / average : 0;
  const regularity = cv <= calibration.regularity_cv_quantiles.p33 ? "regular"
    : cv <= calibration.regularity_cv_quantiles.p67 ? "variable" : "irregular";
  const [slope, rSquared] = normalizedLinearSlope(intervals);
  const evenLimit = calibration.absolute_normalized_slope_quantiles.p33;
  const direction = Math.abs(slope) <= evenLimit ? "approximately even"
    : rSquared >= .6 ? (slope < 0 ? "accelerating" : "decelerating") : "mixed";
  const window = Math.max(1, Math.floor(intervals.length / 2));
  const beginning = mean(intervals.slice(0, window)), ending = mean(intervals.slice(-window));
  const endingChange = 100 * (ending - beginning) / beginning;
  const paceComparison = Math.abs(endingChange) < 10 ? "about the same pace"
    : endingChange < 0 ? `${Math.abs(endingChange).toFixed(1)}% faster at the end`
      : `${endingChange.toFixed(1)}% slower at the end`;
  const pace = duration <= calibration.duration_seconds_quantiles.p25 ? "fast"
    : duration >= calibration.duration_seconds_quantiles.p75 ? "slow" : "mid-range";
  const mad = median(intervals.map((value) => Math.abs(value - middle)));
  const separators = intervals.filter((value) => value >= 1.75 * middle && (mad === 0 || value > middle + 2.5 * mad));
  const grouping = separators.length ? "separated into groups"
    : duration <= calibration.duration_seconds_quantiles.p10 && regularity !== "irregular" ? "tightly clustered"
      : regularity === "regular" ? "evenly spaced" : "irregular";
  const groupCount = separators.length ? separators.length + 1 : 1;
  const unusual = rhythmMatch.status !== "matched";
  const best = rhythmMatch.matches?.[0];
  const nearest = best ? {
    name: best.rhythm_family,
    published_coda_types: best.published_coda_types,
    match_strength: unusual ? "weak" as const : "accepted" as const,
    outside_accepted_range: unusual,
    raw_mse_distance: best.raw_mse_distance,
    abstention_threshold_mse: rhythmMatch.abstention_threshold_mse ?? null,
  } : null;
  const countWord = ({ 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" } as Record<number, string>)[clickCount] ?? String(clickCount);
  let headline = `A ${countWord}-click coda with ${regularity} timing`;
  if (grouping === "separated into groups") headline = `A ${countWord}-click coda divided into ${groupCount} rhythmic groups`;
  else if (unusual && endingChange <= -30) headline = `An unusual ${countWord}-click coda with a tightly grouped ending`;
  else if (direction === "accelerating" || direction === "decelerating") headline = `${unusual ? "An unusual" : "A"} ${direction} ${countWord}-click coda`;
  else if (regularity === "regular") headline = `A ${pace === "fast" || pace === "slow" ? `${pace}, ` : ""}regular ${countWord}-click coda`;
  else if (unusual) headline = `An unusual ${countWord}-click coda with irregular timing`;
  const directionSentence = direction === "accelerating" ? "Its intervals shorten near the ending, producing an accelerating rhythm."
    : direction === "decelerating" ? "Its intervals lengthen near the ending, producing a decelerating rhythm."
      : direction === "approximately even" ? "Its intervals remain approximately even from beginning to end."
        : "Its intervals change in a mixed pattern rather than moving steadily faster or slower.";
  const familySentence = nearest
    ? `Its timing is closest to the published ${nearest.name} family, ${unusual ? "but the match is outside" : "and the match is within"} the accepted reference range.`
    : "No same-click-count published family is available for comparison.";
  let analogy = direction === "accelerating" ? "In human musical terms, it resembles a phrase that gathers speed before stopping."
    : direction === "decelerating" ? "In human musical terms, it resembles a phrase that gradually stretches out before stopping."
      : direction === "approximately even" ? "In human musical terms, it resembles a phrase played over a steady beat."
        : "In human musical terms, it resembles a phrase with uneven changes in pace.";
  if (grouping === "separated into groups") analogy = "In human musical terms, it resembles a phrase divided into distinct rhythmic groups.";
  return {
    headline,
    explanation: `This coda contains ${clickCount} estimated clicks over ${duration.toFixed(3)} seconds. ${directionSentence} ${familySentence}`,
    creative_analogy: { text: analogy, label: ANALOGY_LABEL },
    sequence_descriptor: grouping === "separated into groups" ? "grouped phrase"
      : direction === "accelerating" ? "accelerating phrase"
        : direction === "decelerating" ? "decelerating phrase"
          : regularity === "regular" ? "regular phrase" : "irregular phrase",
    method_note: "Regularity uses ICI coefficient of variation; direction uses normalized linear slope with R² >= 0.60; grouping uses a robust long-gap rule. EC1 comparisons use only codas with the same click count.",
    measurements: {
      click_count: clickCount,
      total_duration_seconds: duration,
      mean_inter_click_interval_seconds: average,
      median_inter_click_interval_seconds: middle,
      regularity,
      inter_click_interval_coefficient_of_variation: cv,
      timing_direction: direction,
      normalized_linear_slope: slope,
      linear_trend_r_squared: rSquared,
      click_grouping: grouping,
      rhythmic_group_count: groupCount,
      beginning_mean_interval_seconds: beginning,
      ending_mean_interval_seconds: ending,
      beginning_vs_ending_pace: paceComparison,
      ending_interval_change_percent: endingChange,
      same_click_count_ec1_timing: unusual ? "unusual — outside the accepted same-click-count EC1 reference range" : "common — within the accepted same-click-count EC1 reference range",
      same_click_count_ec1_sample_count: calibration.sample_count,
      duration_pace: pace,
    },
    nearest_published_family: nearest,
  };
}

function tempoType(duration: number): number {
  return duration < .45 ? 0 : duration < .61 ? 1 : duration < .93 ? 2 : duration < 1.08 ? 3 : 4;
}

function analyzeCoda(intervals: number[], clickCount: number): JsonRecord {
  if (!intervals.length) {
    const match = { status: "no_close_published_pattern", message: "At least two estimated clicks are required.", matches: [], estimated_click_count: clickCount, normalized_inter_click_intervals: [], best_vs_second_best_margin: null };
    return {
      published_tempo_type: null,
      measured_rhythm: null,
      published_rhythm_match: match,
      interpretation: {
        observed: { estimated_clicks: clickCount, rhythm_family: null, tempo_type: null },
        interaction_hypothesis: { role: "Unclear", evidence_level: "insufficient evidence", explanation: "The public timing data do not provide enough evidence for a conversational-role hypothesis.", supporting_statistics: [], rule_triggered: "unclear_fallback" },
        creative_analogy: { text: "No musical analogy is available.", label: ANALOGY_LABEL },
        scientific_limits: "This is an evidence-based structural description, not a literal translation, identity, emotion, clan, dialect, or exact intent.",
        scientific_sources: ["EC1 DOI 10.5281/zenodo.10817697"],
      },
    };
  }
  const match = matchRhythm(intervals);
  const measured = measuredRhythm(intervals, clickCount, match);
  const tempo = tempoType(intervals.reduce((sum, value) => sum + value, 0));
  return {
    published_tempo_type: tempo,
    measured_rhythm: measured,
    published_rhythm_match: match,
    interpretation: {
      observed: { estimated_clicks: clickCount, rhythm_family: match.status === "matched" ? match.matches[0]?.rhythm_family ?? null : null, tempo_type: tempo },
      interaction_hypothesis: {
        role: "Unclear",
        evidence_level: "insufficient evidence",
        explanation: "Browser-only analysis leaves conversational role unclear; timing structure alone does not establish meaning or interaction function.",
        supporting_statistics: [],
        rule_triggered: "browser_only_unclear_fallback",
      },
      creative_analogy: measured.creative_analogy,
      scientific_limits: "This is an evidence-based structural description, not a literal translation. It does not identify a whale, emotion, clan, dialect, exact intent, or meaning.",
      scientific_sources: ["EC1 DOI 10.5281/zenodo.10817697"],
    },
  };
}

export function analyzePcm(samples: Float32Array, sampleRate: number): JsonRecord {
  if (sampleRate <= 0 || !samples.length) throw new Error("Audio must contain samples with a positive sample rate.");
  const energy = new Float32Array(samples.length);
  let previous = Math.max(-1, Math.min(1, samples[0]));
  energy[0] = previous * previous;
  for (let index = 1; index < samples.length; index += 1) {
    const current = Math.max(-1, Math.min(1, samples[index]));
    const emphasized = current - .97 * previous;
    energy[index] = emphasized * emphasized;
    previous = current;
  }
  const window = Math.max(1, Math.round(sampleRate * .001)), half = Math.floor(window / 2);
  const prefix = new Float64Array(energy.length + 1);
  for (let index = 0; index < energy.length; index += 1) prefix[index + 1] = prefix[index] + energy[index];
  const envelope = new Float32Array(energy.length);
  let peak = 0;
  for (let index = 0; index < energy.length; index += 1) {
    const start = Math.max(0, index - half), end = Math.min(energy.length, index + half + 1);
    envelope[index] = (prefix[end] - prefix[start]) / (end - start);
    peak = Math.max(peak, envelope[index]);
  }
  const ordered = envelope.slice(); ordered.sort();
  const middleIndex = Math.floor(ordered.length / 2);
  const medianEnergy = ordered.length % 2 ? ordered[middleIndex] : (ordered[middleIndex - 1] + ordered[middleIndex]) / 2;
  const deviations = new Float32Array(envelope.length);
  for (let index = 0; index < envelope.length; index += 1) deviations[index] = Math.abs(envelope[index] - medianEnergy);
  deviations.sort();
  const mad = deviations.length % 2 ? deviations[middleIndex] : (deviations[middleIndex - 1] + deviations[middleIndex]) / 2;
  const threshold = Math.max(medianEnergy + 10 * 1.4826 * mad, peak * .01, 1e-12);
  const candidates: number[] = [];
  let regionStart: number | null = null;
  for (let index = 0; index <= envelope.length; index += 1) {
    const above = index < envelope.length && envelope[index] >= threshold;
    if (above && regionStart === null) regionStart = index;
    if (!above && regionStart !== null) {
      let strongest = regionStart;
      for (let cursor = regionStart + 1; cursor < index; cursor += 1) if (energy[cursor] > energy[strongest]) strongest = cursor;
      candidates.push(strongest); regionStart = null;
    }
  }
  const refractory = Math.max(1, Math.round(sampleRate * .04));
  const selected: number[] = [];
  candidates.sort((left, right) => energy[right] - energy[left]).forEach((candidate) => {
    if (selected.every((existing) => Math.abs(candidate - existing) >= refractory)) selected.push(candidate);
  });
  selected.sort((a, b) => a - b);
  const onsets = selected.map((index) => index / sampleRate);
  const intervals = onsets.slice(1).map((value, index) => value - onsets[index]);
  const average = intervals.length ? mean(intervals) : null;
  return {
    estimate_status: "algorithmic_estimate_without_ground_truth_timestamps",
    ground_truth_click_timestamps_available: false,
    estimate_note: ESTIMATE_NOTE,
    estimated_click_count: onsets.length,
    estimated_click_onsets_seconds: onsets,
    estimated_inter_click_intervals_seconds: intervals,
    estimated_average_inter_click_interval_seconds: average,
    recording_duration_seconds: samples.length / sampleRate,
    estimated_normalized_rhythm_pattern: average ? intervals.map((value) => value / average) : [],
    normalized_rhythm_definition: "Each estimated inter-click interval divided by the average estimated inter-click interval.",
    method: {
      signal: "mono waveform with first-order pre-emphasis coefficient 0.97",
      energy_envelope_window_seconds: .001,
      threshold: "max(median + 10 × 1.4826 × MAD, 1% of peak envelope energy)",
      refractory_period_seconds: .04,
    },
  };
}

function trimActiveAudio(samples: Float32Array, sampleRate: number): { samples: Float32Array; start: number; end: number; applied: boolean } {
  const frameSize = Math.max(1, Math.round(sampleRate * .02));
  const energies: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += samples[index] ** 2;
    energies.push(Math.sqrt(sum / (end - start)));
  }
  const peak = Math.max(...energies);
  if (peak < .002) throw new Error("No reliable active audio region was detected above the room-noise floor.");
  const ordered = [...energies].sort((a, b) => a - b), quietCount = Math.max(1, Math.ceil(ordered.length * .1));
  const noiseFloor = ordered.slice(0, quietCount).reduce((sum, value) => sum + value, 0) / quietCount;
  const threshold = Math.max(peak * .05, noiseFloor * 4, 1e-5);
  const active = energies.map((value, index) => value >= threshold ? index : -1).filter((index) => index >= 0);
  if (!active.length) throw new Error("No reliable active audio region was detected.");
  const activeStart = active[0] * frameSize, activeEnd = Math.min(samples.length, (active.at(-1)! + 1) * frameSize);
  if ((activeEnd - activeStart) / sampleRate < 1) throw new Error("Detected active audio is shorter than one second.");
  const padding = Math.round(.15 * sampleRate);
  const start = Math.max(0, activeStart - padding), end = Math.min(samples.length, activeEnd + padding);
  return { samples: samples.slice(start, end), start: start / sampleRate, end: end / sampleRate, applied: start > 0 || end < samples.length };
}

function segment(onsets: number[]): JsonRecord {
  const groups: Array<{ onsets: number[]; boundary_before: JsonRecord | null }> = [];
  let current: number[] = [], boundary: JsonRecord | null = null;
  const ambiguous: JsonRecord[] = [];
  onsets.forEach((onset, index) => {
    if (index) {
      const gap = onset - onsets[index - 1];
      if (gap >= THRESHOLDS.split_threshold_seconds) {
        groups.push({ onsets: current, boundary_before: boundary });
        current = [];
        boundary = { status: gap > THRESHOLDS.clear_boundary_seconds ? "clear_estimated_boundary" : "ambiguous_estimated_boundary", gap_seconds: gap, estimated: true };
      } else if (gap >= THRESHOLDS.ambiguous_gap_lower_seconds) {
        ambiguous.push({ after_click_onset_seconds: onsets[index - 1], before_click_onset_seconds: onset, gap_seconds: gap, status: "ambiguous_gap_below_split_threshold" });
      }
    }
    current.push(onset);
  });
  if (current.length) groups.push({ onsets: current, boundary_before: boundary });
  const segments: JsonRecord[] = [], rejected: JsonRecord[] = [];
  groups.forEach((group) => {
    if (group.onsets.length < THRESHOLDS.scope.minimum_coda_clicks || group.onsets.length > THRESHOLDS.scope.maximum_coda_clicks) {
      const reason = group.onsets.length < THRESHOLDS.scope.minimum_coda_clicks
        ? "isolated_click_or_group_below_three_click_minimum"
        : "unsegmented_group_exceeds_published_ten_click_scope";
      group.onsets.forEach((onset) => rejected.push({ onset_seconds: onset, reason }));
      return;
    }
    const intervals = group.onsets.slice(1).map((value, index) => value - group.onsets[index]);
    const analysis = analyzeCoda(intervals, group.onsets.length);
    const uncertainty = ["waveform-derived click and boundary estimates"];
    if (group.boundary_before?.status === "ambiguous_estimated_boundary") uncertainty.push("preceding boundary lies in the empirical overlap band");
    if (analysis.published_rhythm_match.status !== "matched") uncertainty.push("rhythm matcher abstained");
    segments.push({
      segment_id: `coda-${segments.length + 1}`,
      start_time_seconds: group.onsets[0],
      end_time_seconds: group.onsets.at(-1)!,
      click_count: group.onsets.length,
      click_onsets_seconds: group.onsets,
      inter_click_intervals_seconds: intervals,
      boundary_before: group.boundary_before,
      uncertainty,
      analysis,
    });
  });
  let measuredSummary = "No probable codas met the published 3–10-click scope and boundary rules.";
  if (segments.length === 1) measuredSummary = `We detected one probable coda: a ${segments[0].analysis.measured_rhythm.sequence_descriptor}.`;
  if (segments.length > 1) measuredSummary = `We detected ${segments.length} probable codas: ${segments.map((value, index) => `${index === segments.length - 1 ? "and " : ""}a ${value.analysis.measured_rhythm.sequence_descriptor}`).join(", ")}.`;
  if (rejected.length) measuredSummary += ` ${rejected.length} estimated click${rejected.length === 1 ? " was" : "s were"} left unassigned.`;
  return {
    probable_coda_count: segments.length,
    segments,
    rejected_click_count: rejected.length,
    rejected_clicks: rejected,
    ambiguous_non_boundary_gaps: ambiguous,
    estimate_note: SEGMENT_NOTE,
    segmentation_method: {
      split_threshold_seconds: THRESHOLDS.split_threshold_seconds,
      ambiguous_gap_lower_seconds: THRESHOLDS.ambiguous_gap_lower_seconds,
      clear_boundary_seconds: THRESHOLDS.clear_boundary_seconds,
      boundary_rule: THRESHOLDS.boundary_rule,
    },
    sequence_interpretation: {
      pattern: segments.length ? (segments.length === 1 ? "single_probable_coda" : "measured_multi_coda_sequence") : "no_valid_sequence",
      explanation: measuredSummary,
      measured_summary: measuredSummary,
      conversational_role_summary: "Possible conversational role: unclear.",
      label: "Measured rhythm sequence — not a literal translation or meaning",
    },
  };
}

function deterministicNarration(sequence: JsonRecord): AnalyzeResponse["ai_evidence_narration"] {
  const count = sequence.probable_coda_count;
  const first = sequence.segments[0];
  const content = {
    headline: count ? `A call story with ${count} probable coda${count === 1 ? "" : "s"}` : "No probable coda sequence was identified",
    sequence_explanation: sequence.sequence_interpretation.measured_summary,
    why_it_is_interesting: count ? "The sequence combines directly measured click timing with clearly separated published-data comparisons." : "The absence of an accepted coda is a cautious result, not evidence that the recording has no whale sound.",
    evidence_points: [
      `${count} probable coda${count === 1 ? " was" : "s were"} detected.`,
      `${sequence.rejected_click_count} estimated click${sequence.rejected_click_count === 1 ? " was" : "s were"} left unassigned.`,
      first ? `The first coda contains ${first.click_count} estimated clicks and is ${first.analysis.measured_rhythm.measurements.timing_direction}.` : "No click group met the accepted coda scope.",
    ] as [string, string, string],
    creative_analogy: first ? `In human musical terms... it begins like ${first.analysis.measured_rhythm.headline.toLowerCase()}, without implying literal whale meaning.` : "In human musical terms... there is not enough measured rhythm here for a responsible analogy.",
    uncertainty: "Literal meaning, identity, intent, emotion, clan, and dialect remain unknown.",
    literal_translation: false as const,
  };
  return { status: "deterministic_fallback", model: null, prompt_version: "browser-deterministic-v1", evidence_version: "whale-calculated-evidence-v1", content };
}

function monoSamples(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    for (let index = 0; index < mono.length; index += 1) mono[index] += source[index] / buffer.numberOfChannels;
  }
  return mono;
}

export async function analyzeInBrowser(file: File): Promise<AnalyzeResponse> {
  const started = performance.now(), bytes = await file.arrayBuffer();
  const context = new AudioContext();
  let buffer: AudioBuffer;
  try { buffer = await context.decodeAudioData(bytes.slice(0)); } finally { void context.close(); }
  const original = monoSamples(buffer), trimmed = trimActiveAudio(original, buffer.sampleRate);
  const callStructure = analyzePcm(trimmed.samples, buffer.sampleRate);
  const sequence = segment(callStructure.estimated_click_onsets_seconds);
  const overall = analyzeCoda(callStructure.estimated_inter_click_intervals_seconds, callStructure.estimated_click_count);
  return {
    analysis_mode: "browser_only",
    availability: {
      wham_embedding: false,
      acoustic_neighbors: false,
      gpt_narration: false,
      explanation: "Your recording stayed on this device. WhAM embeddings, WhAM neighbors, and GPT narration are unavailable in browser-only mode.",
    },
    embedding: null,
    embedding_dimension: null,
    processing_time_seconds: (performance.now() - started) / 1000,
    gpu_name: "Browser CPU · transparent waveform analysis",
    uploaded_recording: {
      filename: file.name,
      duration_seconds: buffer.duration,
      original_duration_seconds: buffer.duration,
      analyzed_duration_seconds: trimmed.samples.length / buffer.sampleRate,
      trim_start_seconds: trimmed.start,
      trim_end_seconds: trimmed.end,
      trimming_applied: trimmed.applied,
      sample_rate_hz: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      bit_depth: 0,
    },
    matches: [],
    reference_percentile_definition: "Unavailable without a WhAM embedding.",
    similarity_statement: "WhAM model-space comparison was not performed. The recording stayed in this browser.",
    ai_evidence_narration: deterministicNarration(sequence),
    call_structure: callStructure as AnalyzeResponse["call_structure"],
    coda_code_interpretation: overall as AnalyzeResponse["coda_code_interpretation"],
    coda_sequence: sequence as AnalyzeResponse["coda_sequence"],
  };
}

export function localArtVector(response: AnalyzeResponse, seed: string): number[] {
  const source = [
    ...response.call_structure.estimated_click_onsets_seconds,
    ...response.call_structure.estimated_inter_click_intervals_seconds,
    response.uploaded_recording.analyzed_duration_seconds,
    response.coda_sequence.probable_coda_count,
  ];
  let state = Number.parseInt(seed.slice(0, 8), 16) >>> 0;
  return Array.from({ length: 1280 }, (_, index) => {
    state = (Math.imul(state ^ (index + 1), 1664525) + 1013904223) >>> 0;
    const measured = source.length ? source[index % source.length] : 0;
    return Math.sin(measured * 31 + state / 0xffffffff * Math.PI * 2);
  });
}
