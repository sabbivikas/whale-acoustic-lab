import assert from "node:assert/strict";
import test from "node:test";
import { encodePcm16Wav, transitionRecordingState } from "./recorder";

test("encodes a mono 16-bit PCM WAV header and samples", () => {
  const wav = encodePcm16Wav(new Float32Array([-1, 0, 1]), 16_000); const view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF"); assert.equal(new TextDecoder().decode(wav.slice(8, 12)), "WAVE");
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 1); assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16); assert.equal(view.getUint32(40, true), 6); assert.equal(wav.length, 50);
});

test("recording state follows request, record, and stop", () => {
  let state = transitionRecordingState("idle", "request"); state = transitionRecordingState(state, "permission-granted"); state = transitionRecordingState(state, "stop"); assert.equal(state, "stopped");
});

test("recording cancellation cannot become a stopped upload", () => {
  const cancelled = transitionRecordingState("recording", "cancel"); assert.equal(cancelled, "cancelled");
  assert.throws(() => transitionRecordingState(cancelled, "stop"), /Invalid recording transition/);
});
