import assert from "node:assert/strict";
import test from "node:test";
import { callStory, friendlyAnalysisError, HOME_ACTIONS, LOADING_STEPS, resetExperienceState, responsiveAssumptions, SAMPLE_RECORDING } from "./experience";
import type { AnalyzeResponse } from "./api";

function response(codas: number): AnalyzeResponse {
  return {
    uploaded_recording: { original_duration_seconds: 3.2, analyzed_duration_seconds: 2.5 },
    coda_sequence: {
      probable_coda_count: codas,
      rejected_click_count: 2,
      sequence_interpretation: {
        measured_summary: codas ? `We detected ${codas} probable codas.` : "No probable codas met the published scope.",
      },
    },
  } as AnalyzeResponse;
}

test("sample action points to an attributed repository WAV", () => {
  assert.match(SAMPLE_RECORDING.url, /\/samples\/.*\.wav$/);
  assert.doesNotMatch(SAMPLE_RECORDING.url, /\/{2,}/);
  assert.equal(SAMPLE_RECORDING.license, "CC BY 4.0");
  assert.match(SAMPLE_RECORDING.source, /Dominica Sperm Whale Project/);
});

test("all three homepage actions remain immediately available", () => {
  assert.deepEqual(HOME_ACTIONS.map((action) => action.id), ["sample-option", "upload-option", "live-option"]);
  assert.deepEqual(HOME_ACTIONS.map((action) => action.title), ["Try a real whale call", "Upload audio", "Listen Live"]);
  assert.match(HOME_ACTIONS[1].description, /WAV or MP3/);
});

test("loading experience has the six ordered non-percentage states", () => {
  assert.deepEqual([...LOADING_STEPS], [
    "Preparing the recording", "Listening for clicks", "Separating probable codas",
    "Measuring the rhythm", "Checking available comparisons", "Creating a deterministic explanation",
  ]);
  assert.ok(LOADING_STEPS.every(step => !step.includes("%")));
});

test("call story handles multi-coda and no-coda results", () => {
  assert.match(callStory(response(3)).headline, /3 probable codas/);
  assert.match(callStory(response(0)).headline, /No probable codas/);
  assert.equal(callStory(response(3)).unassignedClicks, 2);
});

test("errors are actionable and never expose raw transport text", () => {
  const network = friendlyAnalysisError(new Error("Failed to fetch"));
  assert.match(network, /backend/);
  assert.doesNotMatch(network, /Failed to fetch/);
  assert.match(friendlyAnalysisError(new Error("unsupported WAV")), /WAV or MP3/);
  assert.equal(
    friendlyAnalysisError(new Error("This MP3 could not be decoded by your browser. Try another MP3 or convert it to WAV.")),
    "This MP3 could not be decoded by your browser. Try another MP3 or convert it to WAV.",
  );
});

test("responsive assumptions keep story before science", () => {
  const assumptions = responsiveAssumptions();
  assert.equal(assumptions.targetMobileWidth, 390);
  assert.equal(assumptions.cardsUseFluidGrid, true);
  assert.equal(assumptions.primaryExplanationPrecedesScience, true);
});

test("analyze-another reset clears analysis, recording, art, audio, loading, and errors", () => {
  assert.deepEqual(resetExperienceState(), {
    hasAnalysis: false, isRecording: false, isArtworkRunning: false,
    activeAudioPlayers: 0, loadingStep: 0, error: null,
  });
});
