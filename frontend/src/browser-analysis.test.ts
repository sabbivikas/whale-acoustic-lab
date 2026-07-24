import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzePcm, localArtVector } from "./browser-analysis";
import publicSample from "./data/dswp-1-analysis.v1.json";
import { analyzeWithBackend, type AnalyzeResponse } from "./api";

function pulseTrain(times: number[], duration = 2, sampleRate = 8_000): Float32Array {
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  for (const time of times) {
    const center = Math.round(time * sampleRate);
    for (let offset = -3; offset <= 3; offset += 1) {
      const index = center + offset;
      if (index >= 0 && index < samples.length) samples[index] += 1 - Math.abs(offset) / 4;
    }
  }
  return samples;
}

test("transparent browser click detector measures a local pulse train", () => {
  const measured = analyzePcm(pulseTrain([0.4, 0.6, 0.8, 1.0]), 8_000);
  assert.equal(measured.estimated_click_count, 4);
  assert.deepEqual(
    (measured.estimated_inter_click_intervals_seconds as number[]).map((value) => Number(value.toFixed(3))),
    [0.2, 0.2, 0.2],
  );
});

test("browser-only analysis module contains no network primitive", () => {
  const source = readFileSync(new URL("./browser-analysis.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/);
});

test("the bundled public sample is versioned, attributed, and precomputed without inference", () => {
  assert.equal(publicSample.schema_version, "whale-public-sample-analysis-v1");
  assert.equal(publicSample.analysis_mode, "precomputed_public_sample");
  assert.equal(publicSample.precomputed_source.audio_sha256, "8d2ff688c55f4fa77ac4ecde320b71dbdc8d409db899bbcf80ed235ecc009057");
  assert.equal(publicSample.precomputed_source.network_or_inference_used, false);
  assert.equal(publicSample.embedding_dimension, 1280);
  assert.equal(publicSample.embedding.length, 1280);
  assert.ok(publicSample.matches.length > 0);
});

test("local artwork fallback is deterministic and is not exposed as an embedding", () => {
  const response = publicSample as unknown as AnalyzeResponse;
  const first = localArtVector({ ...response, embedding: null, embedding_dimension: null }, "12345678abcdef");
  const second = localArtVector({ ...response, embedding: null, embedding_dimension: null }, "12345678abcdef");
  assert.deepEqual(first, second);
  assert.equal(first.length, 1280);
});

test("production UI has no compiled backend environment or implicit analysis request", () => {
  const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  assert.ok(!(main + api).includes(["VITE", "WHAM", "API", "URL"].join("_")));
  assert.match(main, /preparedResponse \? Promise\.resolve\(preparedResponse\)/);
  assert.match(main, /researcherBackendUrl \? analyzeWithBackend/);
  assert.match(main, /: analyzeInBrowser\(file\)/);
});

test("bring-your-own backend rejects credentialed and non-HTTPS remote URLs before upload", async () => {
  const unusedFile = {} as File;
  await assert.rejects(() => analyzeWithBackend(unusedFile, "http://research.example/analyze"));
  const credentialedUrl = `https://${["user", "password"].join(":")}@research.example`;
  await assert.rejects(() => analyzeWithBackend(unusedFile, credentialedUrl));
  await assert.rejects(() => analyzeWithBackend(unusedFile, "https://research.example?token=not-allowed"));
});
