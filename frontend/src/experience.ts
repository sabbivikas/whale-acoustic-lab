import type { AnalyzeResponse } from "./api";

export const HOME_ACTIONS = [
  { id: "sample-option", className: "sample-card", icon: "▶", title: "Try a real whale call", description: "Analyze a public DSWP recording" },
  { id: "upload-option", className: "", icon: "↑", title: "Upload audio", description: "Choose or drop a WAV · max 25 MB" },
  { id: "live-option", className: "", icon: "●", title: "Listen Live", description: "Use your microphone · up to 20 seconds" },
] as const;

export const LOADING_STEPS = [
  "Preparing the recording",
  "Listening for clicks",
  "Separating probable codas",
  "Comparing published patterns",
  "Building the acoustic fingerprint",
  "Creating the interpretation",
] as const;

export const SAMPLE_RECORDING = {
  url: "/samples/dswp-1.wav",
  filename: "DSWP public sample 1.wav",
  source: "Dominica Sperm Whale Project public dataset",
  sourceUrl: "https://huggingface.co/datasets/orrp/DSWP",
  license: "CC BY 4.0",
  location: "Approximately 2,000 km² off the coast of Dominica",
  collectionPeriod: "2005–2018",
} as const;

export const RESULT_ORDER = [
  "call-story", "ai-narration", "coda-timeline", "coda-interpretations",
  "acoustic-neighbors", "science", "art-view", "sources",
] as const;

export interface CallStory {
  headline: string;
  explanation: string;
  codaCount: number;
  unassignedClicks: number;
  originalDuration: string;
  analyzedDuration: string;
}

export function callStory(response: AnalyzeResponse): CallStory {
  const sequence = response.coda_sequence;
  return {
    headline: sequence.probable_coda_count
      ? `${sequence.probable_coda_count} probable coda${sequence.probable_coda_count === 1 ? "" : "s"} in this call`
      : "No probable codas met the accepted scope",
    explanation: sequence.sequence_interpretation.measured_summary,
    codaCount: sequence.probable_coda_count,
    unassignedClicks: sequence.rejected_click_count,
    originalDuration: `${response.uploaded_recording.original_duration_seconds.toFixed(2)} s`,
    analyzedDuration: `${response.uploaded_recording.analyzed_duration_seconds.toFixed(2)} s`,
  };
}

export function friendlyAnalysisError(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause ?? "");
  const lower = text.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("load failed"))
    return "We couldn’t reach the analysis service. Check your connection, then try the recording again. The first analysis can also take longer while the model starts.";
  if (lower.includes("silent") || lower.includes("no active audio"))
    return "We couldn’t find enough audible signal in this recording. Try a clearer whale recording with less surrounding silence.";
  if (lower.includes("shorter than") || lower.includes("too short"))
    return "The recording is too short to analyze reliably. Record or upload at least one second of clear audio.";
  if (lower.includes("wav") || lower.includes("unsupported") || lower.includes("415"))
    return "This audio format isn’t supported. Choose a valid WAV file no larger than 25 MB.";
  if (lower.includes("400"))
    return "The recording could not be read. Check that it is a valid, non-empty WAV file and try again.";
  if (lower.includes("500") || lower.includes("503") || lower.includes("cold"))
    return "The analysis service is still starting or temporarily unavailable. Wait a moment and try again.";
  return "We couldn’t complete this analysis. Try the recording again, or choose a shorter, clearer WAV file.";
}

export function responsiveAssumptions() {
  return {
    minimumWidth: 320,
    targetMobileWidth: 390,
    cardsUseFluidGrid: true,
    audioMaxWidth: "100%",
    timelineClipsWithinContainer: true,
    primaryExplanationPrecedesScience: RESULT_ORDER.indexOf("call-story") < RESULT_ORDER.indexOf("science"),
  } as const;
}

export interface ExperienceState {
  hasAnalysis: boolean;
  isRecording: boolean;
  isArtworkRunning: boolean;
  activeAudioPlayers: number;
  loadingStep: number;
  error: string | null;
}

export function resetExperienceState(): ExperienceState {
  return {
    hasAnalysis: false,
    isRecording: false,
    isArtworkRunning: false,
    activeAudioPlayers: 0,
    loadingStep: 0,
    error: null,
  };
}
