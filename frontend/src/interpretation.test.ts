import assert from "node:assert/strict";
import test from "node:test";
import { interpretationViewModel } from "./interpretation";
import type { AnalyzeResponse } from "./api";

const response = {
  coda_code_interpretation: {
    published_tempo_type: 2,
    measured_rhythm: {
      headline: "A fast, regular five-click coda",
      explanation: "This coda contains five estimated clicks over 0.400 seconds. Its intervals remain approximately even.",
      creative_analogy: {
        text: "In human musical terms, it resembles a phrase played over a steady beat.",
        label: "Creative musical analogy based only on rhythm — not literal whale meaning",
      },
      sequence_descriptor: "regular phrase",
      method_note: "Measured locally.",
      measurements: {
        click_count: 5,
        total_duration_seconds: 0.4,
        mean_inter_click_interval_seconds: 0.1,
        median_inter_click_interval_seconds: 0.1,
        regularity: "regular",
        inter_click_interval_coefficient_of_variation: 0,
        timing_direction: "approximately even",
        normalized_linear_slope: 0,
        linear_trend_r_squared: 1,
        click_grouping: "evenly spaced",
        rhythmic_group_count: 1,
        beginning_mean_interval_seconds: 0.1,
        ending_mean_interval_seconds: 0.1,
        beginning_vs_ending_pace: "about the same pace",
        ending_interval_change_percent: 0,
        same_click_count_ec1_timing: "common — within the accepted same-click-count EC1 reference range",
        same_click_count_ec1_sample_count: 120,
        duration_pace: "fast",
      },
      nearest_published_family: {
        name: "5R family",
        published_coda_types: ["5R1"],
        match_strength: "accepted",
        outside_accepted_range: false,
        raw_mse_distance: 0.001,
        abstention_threshold_mse: 0.01,
      },
    },
    published_rhythm_match: {
      status: "matched",
      message: "Published pattern match found",
      estimated_click_count: 5,
      normalized_inter_click_intervals: [0.25, 0.25, 0.25, 0.25],
      best_vs_second_best_margin: 0.01,
      matches: [{
        rhythm_family_id: 6,
        rhythm_family: "5R family",
        published_coda_types: ["5R1", "5R2", "5R3"],
        raw_mse_distance: 0.001,
        empirical_closeness_percentile: 92.5,
        reference_sample_count: 50,
      }],
    },
    interpretation: {
      observed: { estimated_clicks: 5, rhythm_family: "5R family", tempo_type: 2 },
      interaction_hypothesis: {
        role: "Invites or maintains another turn",
        evidence_level: "moderate dataset support",
        explanation: "Often followed by a different annotated speaker.",
        supporting_statistics: [{ measurement: "followed by a different speaker", value: 0.71 }],
        rule_triggered: "different_speaker_after",
      },
      creative_analogy: {
        text: "In human terms, this could feel like: I’m here—are you still with me?",
        label: "Creative analogy, not a literal translation",
      },
      scientific_limits: "This is not a literal translation and does not identify a whale.",
      scientific_sources: ["https://doi.org/10.5281/zenodo.10817697"],
    },
  },
} as unknown as AnalyzeResponse;

test("creates a plain-language interpretation view model", () => {
  const view = interpretationViewModel(response);
  assert.equal(view.measuredHeadline, "A fast, regular five-click coda");
  assert.equal(view.role, "Invites or maintains another turn");
  assert.equal(view.statistics.at(-1)?.value, "71.0%");
  assert.match(view.rhythmSummary, /5R family/);
});

test("keeps the creative analogy visibly non-literal", () => {
  const view = interpretationViewModel(response);
  assert.match(view.analogyLabel, /not literal whale meaning/i);
  assert.match(view.scientificLimits, /not a literal translation/i);
});

test("keeps an abstained family weak while preserving the measured headline", () => {
  const abstained = structuredClone(response) as AnalyzeResponse;
  abstained.coda_code_interpretation.published_rhythm_match.status = "no_close_published_pattern";
  abstained.coda_code_interpretation.measured_rhythm.headline = "An unusual five-click coda with irregular timing";
  abstained.coda_code_interpretation.measured_rhythm.nearest_published_family!.match_strength = "weak";
  const view = interpretationViewModel(abstained);
  assert.equal(view.measuredHeadline, "An unusual five-click coda with irregular timing");
  assert.match(view.rhythmSummary, /Weak nearest published family/);
  assert.notEqual(view.measuredHeadline, "Unclear");
});
