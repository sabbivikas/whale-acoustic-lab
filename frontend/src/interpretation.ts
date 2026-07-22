import type { AnalyzeResponse } from "./api";

export interface InterpretationViewModel {
  measuredHeadline: string;
  role: string;
  evidenceLevel: string;
  measuredExplanation: string;
  roleExplanation: string;
  analogy: string;
  analogyLabel: string;
  statistics: Array<{ label: string; value: string }>;
  rhythmSummary: string;
  scientificLimits: string;
  sources: string[];
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) return `${(value * 100).toFixed(1)}%`;
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3);
  }
  if (Array.isArray(value)) return value.map(formatValue).join(" · ");
  return String(value ?? "—");
}

export function interpretationViewModel(response: AnalyzeResponse): InterpretationViewModel {
  const result = response.coda_code_interpretation;
  const interpretation = result.interpretation;
  const observed = interpretation.observed;
  const measured = result.measured_rhythm;
  const best = result.published_rhythm_match.matches[0];
  const values = measured.measurements;
  const measurements = [
    { label: "Click count", value: String(values.click_count) },
    { label: "Total coda duration", value: `${values.total_duration_seconds.toFixed(3)} s` },
    { label: "Mean inter-click interval", value: `${(values.mean_inter_click_interval_seconds * 1000).toFixed(1)} ms` },
    { label: "Median inter-click interval", value: `${(values.median_inter_click_interval_seconds * 1000).toFixed(1)} ms` },
    { label: "ICI coefficient of variation", value: values.inter_click_interval_coefficient_of_variation.toFixed(3) },
    { label: "Regularity", value: values.regularity },
    { label: "Timing direction", value: values.timing_direction },
    { label: "Click grouping", value: values.click_grouping },
    { label: "Beginning mean interval", value: `${(values.beginning_mean_interval_seconds * 1000).toFixed(1)} ms` },
    { label: "Ending mean interval", value: `${(values.ending_mean_interval_seconds * 1000).toFixed(1)} ms` },
    { label: "Beginning vs ending", value: `${values.beginning_vs_ending_pace} (${values.ending_interval_change_percent.toFixed(1)}%)` },
    { label: "Normalized timing slope", value: values.normalized_linear_slope.toFixed(4) },
    { label: "Linear trend R²", value: values.linear_trend_r_squared.toFixed(3) },
    { label: "Same-click-count EC1 timing", value: values.same_click_count_ec1_timing },
    { label: "Same-click-count EC1 examples", value: values.same_click_count_ec1_sample_count.toLocaleString() },
  ];
  return {
    measuredHeadline: measured.headline,
    role: interpretation.interaction_hypothesis.role,
    evidenceLevel: interpretation.interaction_hypothesis.evidence_level,
    measuredExplanation: measured.explanation,
    roleExplanation: interpretation.interaction_hypothesis.explanation,
    analogy: measured.creative_analogy.text,
    analogyLabel: measured.creative_analogy.label,
    statistics: measurements.concat(interpretation.interaction_hypothesis.supporting_statistics.map((statistic) => ({
      label: statistic.measurement,
      value: formatValue(statistic.value),
    }))),
    rhythmSummary: best
      ? `${result.published_rhythm_match.status === "matched" ? "Accepted published-family match" : "Weak nearest published family"}: ${best.rhythm_family} · tempo type ${observed.tempo_type ?? "—"} · MSE ${best.raw_mse_distance.toFixed(6)}${result.published_rhythm_match.abstention_threshold_mse == null ? "" : ` · acceptance threshold ${result.published_rhythm_match.abstention_threshold_mse.toFixed(6)}`}`
      : result.published_rhythm_match.message,
    scientificLimits: interpretation.scientific_limits,
    sources: interpretation.scientific_sources,
  };
}
