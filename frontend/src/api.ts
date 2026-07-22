export interface ReferenceMatch {
  reference_id: string;
  original_dswp_filename: string;
  source_url: string;
  raw_cosine_similarity: number;
  reference_percentile: number;
  duration_seconds: number;
  sample_rate_hz: number;
  license: string;
  dataset_location: string;
  collection_period: string;
}

export interface MeasuredRhythm {
  headline: string;
  explanation: string;
  creative_analogy: { text: string; label: string };
  sequence_descriptor: string;
  method_note: string;
  measurements: {
    click_count: number;
    total_duration_seconds: number;
    mean_inter_click_interval_seconds: number;
    median_inter_click_interval_seconds: number;
    regularity: string;
    inter_click_interval_coefficient_of_variation: number;
    timing_direction: string;
    normalized_linear_slope: number;
    linear_trend_r_squared: number;
    click_grouping: string;
    rhythmic_group_count: number;
    beginning_mean_interval_seconds: number;
    ending_mean_interval_seconds: number;
    beginning_vs_ending_pace: string;
    ending_interval_change_percent: number;
    same_click_count_ec1_timing: string;
    same_click_count_ec1_sample_count: number;
    duration_pace: string;
  };
  nearest_published_family: null | {
    name: string;
    published_coda_types: string[];
    match_strength: "weak" | "accepted";
    outside_accepted_range: boolean;
    raw_mse_distance: number;
    abstention_threshold_mse: number | null;
  };
}

export interface AnalyzeResponse {
  embedding: unknown;
  embedding_dimension: number;
  processing_time_seconds: number;
  gpu_name: string;
  uploaded_recording: {
    filename: string;
    duration_seconds: number;
    original_duration_seconds: number;
    analyzed_duration_seconds: number;
    trim_start_seconds: number;
    trim_end_seconds: number;
    trimming_applied: boolean;
    sample_rate_hz: number;
    channels: number;
    bit_depth: number;
  };
  matches: ReferenceMatch[];
  reference_percentile_definition: string;
  similarity_statement: string;
  ai_evidence_narration: {
    status: "generated" | "cache_hit" | "deterministic_fallback";
    model: string | null;
    prompt_version: string;
    evidence_version: string;
    content: {
      headline: string;
      sequence_explanation: string;
      why_it_is_interesting: string;
      evidence_points: [string, string, string];
      creative_analogy: string;
      uncertainty: string;
      literal_translation: false;
    };
  };
  call_structure: {
    estimate_status: string;
    ground_truth_click_timestamps_available: false;
    estimate_note: string;
    estimated_click_count: number;
    estimated_click_onsets_seconds: number[];
    estimated_inter_click_intervals_seconds: number[];
    estimated_average_inter_click_interval_seconds: number | null;
    recording_duration_seconds: number;
    estimated_normalized_rhythm_pattern: number[];
    normalized_rhythm_definition: string;
  };
  coda_code_interpretation: {
    published_tempo_type: number | null;
    measured_rhythm: MeasuredRhythm;
    published_rhythm_match: {
      status: "matched" | "no_close_published_pattern";
      message: string;
      estimated_click_count: number;
      normalized_inter_click_intervals: number[];
      best_vs_second_best_margin: number | null;
      abstention_threshold_mse?: number | null;
      abstention_reason?: string | null;
      percentile_definition?: string;
      matches: Array<{
        rhythm_family_id: number;
        rhythm_family: string;
        published_coda_types: string[];
        raw_mse_distance: number;
        empirical_closeness_percentile: number;
        reference_sample_count: number;
      }>;
    };
    interpretation: {
      observed: {
        estimated_clicks: number;
        rhythm_family: string | null;
        tempo_type: number | null;
      };
      interaction_hypothesis: {
        role: string;
        evidence_level: string;
        explanation: string;
        supporting_statistics: Array<{ measurement: string; value: unknown }>;
        rule_triggered: string;
      };
      creative_analogy: { text: string; label: string };
      scientific_limits: string;
      scientific_sources: string[];
    };
  };
  coda_sequence: {
    probable_coda_count: number;
    rejected_click_count: number;
    rejected_clicks: Array<{ onset_seconds: number; reason: string }>;
    ambiguous_non_boundary_gaps: Array<{
      after_click_onset_seconds: number;
      before_click_onset_seconds: number;
      gap_seconds: number;
      status: string;
    }>;
    estimate_note: string;
    segmentation_method: {
      split_threshold_seconds: number;
      ambiguous_gap_lower_seconds: number;
      clear_boundary_seconds: number;
      boundary_rule: string;
    };
    sequence_interpretation: {
      pattern: string;
      explanation: string;
      measured_summary: string;
      conversational_role_summary: string;
      label: string;
    };
    segments: Array<{
      segment_id: string;
      start_time_seconds: number;
      end_time_seconds: number;
      click_count: number;
      click_onsets_seconds: number[];
      inter_click_intervals_seconds: number[];
      boundary_before: null | {
        status: "clear_estimated_boundary" | "ambiguous_estimated_boundary";
        gap_seconds: number;
        estimated: true;
      };
      uncertainty: string[];
      analysis: AnalyzeResponse["coda_code_interpretation"];
    }>;
  };
}

export async function analyzeAudio(file: File): Promise<AnalyzeResponse> {
  const baseUrl = import.meta.env.VITE_WHAM_API_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("VITE_WHAM_API_URL is not configured.");

  const body = new FormData();
  body.append("file", file, file.name);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/analyze`, { method: "POST", body });
  } catch {
    throw new Error("Network request failed");
  }
  const payload = (await response.json().catch(() => null)) as AnalyzeResponse | { detail?: string } | null;
  if (!response.ok) {
    const detail = payload && "detail" in payload ? payload.detail : undefined;
    throw new Error(detail || `Analysis service returned ${response.status}.`);
  }
  return payload as AnalyzeResponse;
}

export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function collapseEmbedding(value: unknown, expectedDimension = 1280): number[] {
  const vectors: number[][] = [];
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (node.length === expectedDimension && node.every((item) => typeof item === "number")) {
      vectors.push(node as number[]);
      return;
    }
    node.forEach(visit);
  };
  visit(value);
  if (!vectors.length) throw new Error(`The API did not return ${expectedDimension}-value embedding vectors.`);
  return Array.from({ length: expectedDimension }, (_, index) =>
    vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length,
  );
}
