import assert from "node:assert/strict";
import test from "node:test";
import {
  addClick,
  annotateClick,
  calculateCodaMeasurements,
  deleteClick,
  joinAdjacentCodas,
  loadResearchDocument,
  moveClick,
  restoreAutomaticDocument,
  saveResearchDocument,
  splitCoda,
  type ResearchDocument,
  type StorageLike,
} from "./research-model";

const makeDocument = (times = [0, 0.2, 0.4, 0.6]): ResearchDocument => ({
  version: 1,
  audioSha256: "abc123",
  durationSeconds: 2,
  updatedAt: "2026-01-01T00:00:00.000Z",
  codas: [{ id: "c1", startSeconds: 0, endSeconds: 0.6, status: "accepted", note: "", source: "automatic" }],
  clicks: times.map((timeSeconds, index) => ({
    id: `p${index + 1}`,
    timeSeconds,
    codaId: "c1",
    status: "accepted",
    note: "",
    source: "automatic",
  })),
});

test("marker editing adds, moves, annotates, and deletes human-corrected clicks", () => {
  const added = addClick(makeDocument(), 0.3);
  const newClick = added.clicks.find((click) => click.source === "human_corrected")!;
  assert.equal(newClick.status, "uncertain");
  const moved = moveClick(added, newClick.id, 0.35);
  assert.equal(moved.clicks.find((click) => click.id === newClick.id)?.timeSeconds, 0.35);
  const annotated = annotateClick(moved, newClick.id, "accepted", "confirmed in spectrogram");
  assert.equal(annotated.clicks.find((click) => click.id === newClick.id)?.note, "confirmed in spectrogram");
  assert.equal(annotated.clicks.find((click) => click.id === newClick.id)?.source, "human_corrected");
  assert.equal(deleteClick(annotated, newClick.id).clicks.length, 4);
});

test("splitting a coda divides its clicks and marks both regions human corrected", () => {
  const split = splitCoda(makeDocument(), "c1", 0.3);
  assert.equal(split.codas.length, 2);
  assert.deepEqual(split.clicks.map((click) => click.codaId), ["c1", "c1", split.codas[1].id, split.codas[1].id]);
  assert.ok(split.codas.every((coda) => coda.source === "human_corrected"));
});

test("joining adjacent codas recombines the region and click assignments", () => {
  const split = splitCoda(makeDocument(), "c1", 0.3);
  const joined = joinAdjacentCodas(split, "c1", split.codas[1].id);
  assert.equal(joined.codas.length, 1);
  assert.ok(joined.clicks.every((click) => click.codaId === "c1"));
  assert.equal(joined.codas[0].source, "human_corrected");
});

test("recalculation reports even rhythm using the existing regularity rules", () => {
  const values = calculateCodaMeasurements(makeDocument(), "c1");
  assert.deepEqual(values.interClickIntervals, [0.2, 0.2, 0.2]);
  assert.equal(values.meanInterval, 0.2);
  assert.equal(values.medianInterval, 0.2);
  assert.deepEqual(values.normalizedRhythm, [0.333333, 0.333333, 0.333333]);
  assert.equal(values.regularity, "regular");
  assert.equal(values.coefficientOfVariation, 0);
  assert.equal(values.beginningVersusEndingPace, "about the same pace");
});

test("recalculation reports faster and slower endings", () => {
  assert.equal(calculateCodaMeasurements(makeDocument([0, 0.4, 0.65, 0.8]), "c1").beginningVersusEndingPace, "faster at the end");
  const slowing = makeDocument([0, 0.15, 0.4, 0.8]);
  slowing.codas[0].endSeconds = 0.8;
  assert.equal(calculateCodaMeasurements(slowing, "c1").beginningVersusEndingPace, "slower at the end");
});

test("rejected clicks are excluded from all recalculated values", () => {
  const document = annotateClick(makeDocument(), "p2", "rejected", "echo");
  const values = calculateCodaMeasurements(document, "c1");
  assert.equal(values.clickCount, 3);
  assert.deepEqual(values.interClickIntervals, [0.4, 0.2]);
});

test("documents serialize to localStorage and restore under the audio hash", () => {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  const document = addClick(makeDocument(), 1.25);
  saveResearchDocument(storage, document);
  assert.deepEqual(loadResearchDocument(storage, "abc123"), document);
  assert.equal(loadResearchDocument(storage, "another-hash"), null);
});

test("restoring automatic analysis returns an independent clean copy", () => {
  const automatic = makeDocument();
  const edited = addClick(automatic, 1.2);
  const restored = restoreAutomaticDocument(automatic);
  assert.equal(edited.clicks.length, 5);
  assert.equal(restored.clicks.length, 4);
  restored.clicks[0].note = "changed";
  assert.equal(automatic.clicks[0].note, "");
});
