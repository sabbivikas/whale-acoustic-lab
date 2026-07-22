import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEvaluationExports,
  codaIntersectionOverUnion,
  deterministicEvaluationFilenames,
  evaluateAnnotations,
  evaluateClicks,
  evaluateCodas,
  matchClicksOneToOne,
  serializeEvaluationCsv,
  serializeEvaluationJson,
} from "./research-evaluation";
import type { ResearchClick, ResearchCoda, ResearchDocument } from "./research-model";

const hash = "abcdef0123456789".repeat(4);
const click = (id: string, timeSeconds: number): ResearchClick => ({ id, timeSeconds, codaId: "c1", status: "accepted", note: "", source: "automatic" });
const coda = (id: string, startSeconds: number, endSeconds: number): ResearchCoda => ({ id, startSeconds, endSeconds, status: "accepted", note: "", source: "automatic" });
const document = (clicks: ResearchClick[], codas: ResearchCoda[]): ResearchDocument => ({ version: 1, audioSha256: hash, durationSeconds: 5, updatedAt: "2026-07-21T00:00:00Z", clicks, codas });

test("perfect click matching produces complete agreement and zero timing error", () => {
  const automatic = [click("a1", 0.1), click("a2", 0.2), click("a3", 0.3)];
  const reviewed = [click("r1", 0.1), click("r2", 0.2), click("r3", 0.3)];
  const result = evaluateClicks(automatic, reviewed, 0.01);
  assert.equal(result.matchedCount, 3);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
  assert.equal(result.f1Score, 1);
  assert.equal(result.maximumTimingErrorSeconds, 0);
});

test("clicks just inside tolerance match while clicks just outside do not", () => {
  assert.equal(evaluateClicks([click("a", 1)], [click("r", 1.009)], 0.01).matchedCount, 1);
  assert.equal(evaluateClicks([click("a", 1)], [click("r", 1.011)], 0.01).matchedCount, 0);
});

test("one reviewed click cannot match multiple automatic clicks", () => {
  const result = matchClicksOneToOne([click("a1", 1), click("a2", 1.015)], [click("r1", 1.007)], 0.01);
  assert.equal(result.length, 1);
  assert.equal(new Set(result.map((match) => match.reviewedId)).size, 1);
});

test("extra automatic clicks are counted as unmatched automatic annotations", () => {
  const result = evaluateClicks([click("a1", 1), click("a2", 2)], [click("r1", 1)], 0.01);
  assert.equal(result.unmatchedAutomaticCount, 1);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 1);
});

test("missing automatic clicks are counted as unmatched reviewed annotations", () => {
  const result = evaluateClicks([click("a1", 1)], [click("r1", 1), click("r2", 2)], 0.01);
  assert.equal(result.unmatchedReviewedCount, 1);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 0.5);
});

test("empty annotation sets return zero counts and undefined rate metrics", () => {
  const result = evaluateClicks([], [], 0.01);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.precision, null);
  assert.equal(result.recall, null);
  assert.equal(result.f1Score, null);
  assert.equal(result.meanAbsoluteTimingErrorSeconds, null);
});

test("perfect coda overlap has IoU one and zero boundary error", () => {
  const result = evaluateCodas([coda("a", 0, 1)], [coda("r", 0, 1)]);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.meanIntersectionOverUnion, 1);
  assert.equal(result.meanAbsoluteBoundaryStartErrorSeconds, 0);
  assert.equal(result.meanAbsoluteBoundaryEndErrorSeconds, 0);
});

test("partial coda overlap uses intersection divided by union", () => {
  const result = evaluateCodas([coda("a", 0, 1)], [coda("r", 0.25, 1.25)]);
  assert.equal(codaIntersectionOverUnion(coda("a", 0, 1), coda("r", 0.25, 1.25)), 0.6);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.meanIntersectionOverUnion, 0.6);
});

test("one automatic coda overlapping multiple reviewed codas is a possible split error", () => {
  const result = evaluateCodas([coda("a", 0, 2)], [coda("r1", 0, 0.9), coda("r2", 1.1, 2)]);
  assert.equal(result.possibleSplitErrorCount, 1);
  assert.deepEqual(result.possibleSplitErrors[0], { automaticIds: ["a"], reviewedIds: ["r1", "r2"] });
});

test("multiple automatic codas overlapping one reviewed coda is a possible merge error", () => {
  const result = evaluateCodas([coda("a1", 0, 0.9), coda("a2", 1.1, 2)], [coda("r", 0, 2)]);
  assert.equal(result.possibleMergeErrorCount, 1);
  assert.deepEqual(result.possibleMergeErrors[0], { automaticIds: ["a1", "a2"], reviewedIds: ["r"] });
});

test("evaluation output is deterministic for identical inputs", () => {
  const automatic = document([click("a2", 2), click("a1", 1)], [coda("ca", 0, 2)]);
  const reviewed = document([click("r2", 2.002), click("r1", 1.001)], [coda("cr", 0.1, 2.1)]);
  assert.deepEqual(evaluateAnnotations(automatic, reviewed, 0.01), evaluateAnnotations(automatic, reviewed, 0.01));
});

test("evaluation JSON and CSV include every matched and unmatched annotation", () => {
  const automatic = document([click("a1", 1), click("a2", 2)], [coda("ca", 0.5, 2.2)]);
  const reviewed = document([click("r1", 1.002), click("r3", 3)], [coda("cr", 0.5, 2.2), coda("cr2", 2.5, 3.5)]);
  const evaluation = evaluateAnnotations(automatic, reviewed, 0.01);
  const input = { audioSha256: hash, evaluationTimestamp: "2026-07-21T12:00:00Z", evaluation };
  const json = JSON.parse(serializeEvaluationJson(input)) as Record<string, unknown>;
  assert.equal(json.algorithm_version, "annotation-evaluation-v1");
  assert.match(JSON.stringify(json.limitations), /review set/i);
  const csv = serializeEvaluationCsv(input);
  assert.equal(csv.trim().split("\r\n").length, 6);
  assert.match(csv, /unmatched_automatic/);
  assert.match(csv, /unmatched_reviewed/);
  const files = buildEvaluationExports(input);
  assert.equal(files.json.filename, "abcdef012345_annotation-evaluation.json");
  assert.equal(files.csv.filename, "abcdef012345_annotation-evaluation.csv");
  assert.deepEqual(deterministicEvaluationFilenames(hash), { json: files.json.filename, csv: files.csv.filename });
});

test("numeric edge cases clamp tolerance and reject zero-length coda unions", () => {
  const automatic = document([click("a", 1)], [coda("ca", 1, 1)]);
  const reviewed = document([click("r", 1.05)], [coda("cr", 1, 1)]);
  assert.equal(evaluateAnnotations(automatic, reviewed, 0).clickMatchingToleranceSeconds, 0.001);
  assert.equal(evaluateAnnotations(automatic, reviewed, 1).clickMatchingToleranceSeconds, 0.1);
  assert.equal(codaIntersectionOverUnion(automatic.codas[0], reviewed.codas[0]), 0);
  assert.equal(evaluateClicks([click("a", 1)], [click("r", 2)], Number.NaN).f1Score, null);
});
