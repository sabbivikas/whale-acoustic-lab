import type { AnalyzeResponse } from "./api";

export type AnnotationStatus = "accepted" | "rejected" | "uncertain";
export type AnnotationSource = "automatic" | "human_corrected";

export interface ResearchClick {
  id: string;
  timeSeconds: number;
  codaId: string | null;
  status: AnnotationStatus;
  note: string;
  source: AnnotationSource;
}

export interface ResearchCoda {
  id: string;
  startSeconds: number;
  endSeconds: number;
  status: AnnotationStatus;
  note: string;
  source: AnnotationSource;
}

export interface ResearchDocument {
  version: 1;
  audioSha256: string;
  durationSeconds: number;
  clicks: ResearchClick[];
  codas: ResearchCoda[];
  updatedAt: string;
}

export interface CodaMeasurements {
  clickCount: number;
  clickTimestamps: number[];
  interClickIntervals: number[];
  meanInterval: number | null;
  medianInterval: number | null;
  normalizedRhythm: number[];
  duration: number;
  regularity: "unmeasured" | "regular" | "variable" | "irregular";
  coefficientOfVariation: number | null;
  beginningMeanInterval: number | null;
  endingMeanInterval: number | null;
  beginningVersusEndingPace: "unmeasured" | "about the same pace" | "faster at the end" | "slower at the end";
}

const STORAGE_PREFIX = "whale-acoustic-lab:research:v1:";
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const now = (): string => new Date().toISOString();

function cloneDocument(document: ResearchDocument): ResearchDocument {
  return {
    ...document,
    clicks: document.clicks.map((click) => ({ ...click })),
    codas: document.codas.map((coda) => ({ ...coda })),
    updatedAt: now(),
  };
}

function codaAt(codas: ResearchCoda[], timeSeconds: number): string | null {
  return codas.find((coda) => timeSeconds >= coda.startSeconds && timeSeconds <= coda.endSeconds)?.id ?? null;
}

export function createResearchDocument(response: AnalyzeResponse, audioSha256: string): ResearchDocument {
  const codas: ResearchCoda[] = response.coda_sequence.segments.map((segment, index) => ({
    id: `auto-coda-${index + 1}`,
    startSeconds: segment.start_time_seconds,
    endSeconds: segment.end_time_seconds,
    status: "accepted",
    note: "",
    source: "automatic",
  }));
  const rejected = new Set(response.coda_sequence.rejected_clicks.map((click) => click.onset_seconds.toFixed(6)));
  const clicks: ResearchClick[] = response.call_structure.estimated_click_onsets_seconds.map((timeSeconds, index) => {
    const codaId = codaAt(codas, timeSeconds);
    return {
      id: `auto-click-${index + 1}`,
      timeSeconds,
      codaId,
      status: rejected.has(timeSeconds.toFixed(6)) || codaId === null ? "rejected" : "accepted",
      note: "",
      source: "automatic",
    };
  });
  return {
    version: 1,
    audioSha256,
    durationSeconds: response.uploaded_recording.analyzed_duration_seconds,
    clicks,
    codas,
    updatedAt: now(),
  };
}

export function addClick(document: ResearchDocument, timeSeconds: number): ResearchDocument {
  const next = cloneDocument(document);
  const time = Math.max(0, Math.min(next.durationSeconds, timeSeconds));
  next.clicks.push({
    id: `human-click-${Date.now()}-${next.clicks.length + 1}`,
    timeSeconds: time,
    codaId: codaAt(next.codas, time),
    status: "uncertain",
    note: "",
    source: "human_corrected",
  });
  next.clicks.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return next;
}

export function moveClick(document: ResearchDocument, clickId: string, timeSeconds: number): ResearchDocument {
  const next = cloneDocument(document);
  const click = next.clicks.find((item) => item.id === clickId);
  if (!click) return document;
  click.timeSeconds = Math.max(0, Math.min(next.durationSeconds, timeSeconds));
  click.codaId = codaAt(next.codas, click.timeSeconds);
  click.source = "human_corrected";
  next.clicks.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return next;
}

export function deleteClick(document: ResearchDocument, clickId: string): ResearchDocument {
  if (!document.clicks.some((click) => click.id === clickId)) return document;
  const next = cloneDocument(document);
  next.clicks = next.clicks.filter((click) => click.id !== clickId);
  return next;
}

export function annotateClick(
  document: ResearchDocument,
  clickId: string,
  status: AnnotationStatus,
  note: string,
): ResearchDocument {
  const next = cloneDocument(document);
  const click = next.clicks.find((item) => item.id === clickId);
  if (!click) return document;
  click.status = status;
  click.note = note.slice(0, 240);
  click.source = "human_corrected";
  return next;
}

export function annotateCoda(
  document: ResearchDocument,
  codaId: string,
  status: AnnotationStatus,
  note: string,
): ResearchDocument {
  const next = cloneDocument(document);
  const coda = next.codas.find((item) => item.id === codaId);
  if (!coda) return document;
  coda.status = status;
  coda.note = note.slice(0, 240);
  coda.source = "human_corrected";
  return next;
}

export function resizeCoda(
  document: ResearchDocument,
  codaId: string,
  startSeconds: number,
  endSeconds: number,
): ResearchDocument {
  const next = cloneDocument(document);
  const coda = next.codas.find((item) => item.id === codaId);
  if (!coda) return document;
  const start = Math.max(0, Math.min(next.durationSeconds, startSeconds));
  const end = Math.max(start, Math.min(next.durationSeconds, endSeconds));
  coda.startSeconds = start;
  coda.endSeconds = end;
  coda.source = "human_corrected";
  next.clicks.forEach((click) => { click.codaId = codaAt(next.codas, click.timeSeconds); });
  return next;
}

export function splitCoda(document: ResearchDocument, codaId: string, atSeconds: number): ResearchDocument {
  const next = cloneDocument(document);
  const index = next.codas.findIndex((coda) => coda.id === codaId);
  if (index < 0) return document;
  const coda = next.codas[index];
  if (atSeconds <= coda.startSeconds || atSeconds >= coda.endSeconds) return document;
  const rightId = `human-coda-${Date.now()}-${next.codas.length + 1}`;
  const right: ResearchCoda = {
    ...coda,
    id: rightId,
    startSeconds: atSeconds,
    source: "human_corrected",
  };
  coda.endSeconds = atSeconds;
  coda.source = "human_corrected";
  next.codas.splice(index + 1, 0, right);
  next.clicks.forEach((click) => {
    if (click.codaId === codaId && click.timeSeconds >= atSeconds) click.codaId = rightId;
  });
  return next;
}

export function joinAdjacentCodas(document: ResearchDocument, leftId: string, rightId: string): ResearchDocument {
  const ordered = [...document.codas].sort((a, b) => a.startSeconds - b.startSeconds);
  const leftIndex = ordered.findIndex((coda) => coda.id === leftId);
  if (leftIndex < 0 || ordered[leftIndex + 1]?.id !== rightId) return document;
  const next = cloneDocument(document);
  const left = next.codas.find((coda) => coda.id === leftId)!;
  const right = next.codas.find((coda) => coda.id === rightId)!;
  left.startSeconds = Math.min(left.startSeconds, right.startSeconds);
  left.endSeconds = Math.max(left.endSeconds, right.endSeconds);
  left.status = left.status === right.status ? left.status : "uncertain";
  left.note = [left.note, right.note].filter(Boolean).join(" · ").slice(0, 240);
  left.source = "human_corrected";
  next.codas = next.codas.filter((coda) => coda.id !== rightId).sort((a, b) => a.startSeconds - b.startSeconds);
  next.clicks.forEach((click) => {
    if (click.codaId === rightId) click.codaId = leftId;
  });
  return next;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function calculateCodaMeasurements(document: ResearchDocument, codaId: string, preservePrecision = false): CodaMeasurements {
  const numeric = preservePrecision ? (value: number): number => value : round;
  const coda = document.codas.find((item) => item.id === codaId);
  const clickTimestamps = document.clicks
    .filter((click) => click.codaId === codaId && click.status !== "rejected")
    .map((click) => click.timeSeconds)
    .sort((a, b) => a - b);
  const interClickIntervals = clickTimestamps.slice(1).map((time, index) => numeric(time - clickTimestamps[index]));
  const duration = clickTimestamps.length > 1
    ? numeric(clickTimestamps.at(-1)! - clickTimestamps[0])
    : coda ? numeric(coda.endSeconds - coda.startSeconds) : 0;
  if (!interClickIntervals.length) {
    return {
      clickCount: clickTimestamps.length,
      clickTimestamps,
      interClickIntervals,
      meanInterval: null,
      medianInterval: null,
      normalizedRhythm: [],
      duration,
      regularity: "unmeasured",
      coefficientOfVariation: null,
      beginningMeanInterval: null,
      endingMeanInterval: null,
      beginningVersusEndingPace: "unmeasured",
    };
  }
  const meanInterval = interClickIntervals.reduce((sum, value) => sum + value, 0) / interClickIntervals.length;
  const variance = interClickIntervals.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) / interClickIntervals.length;
  const coefficientOfVariation = interClickIntervals.length > 1 ? Math.sqrt(variance) / meanInterval : 0;
  // These are the documented conservative thresholds used by backend/measured_rhythm.py.
  const regularity = coefficientOfVariation <= 0.12 ? "regular" : coefficientOfVariation <= 0.30 ? "variable" : "irregular";
  const total = interClickIntervals.reduce((sum, value) => sum + value, 0);
  const window = Math.max(1, Math.floor(interClickIntervals.length / 2));
  const beginningMeanInterval = interClickIntervals.slice(0, window).reduce((sum, value) => sum + value, 0) / window;
  const endingMeanInterval = interClickIntervals.slice(-window).reduce((sum, value) => sum + value, 0) / window;
  const endingChange = (endingMeanInterval - beginningMeanInterval) / beginningMeanInterval;
  const beginningVersusEndingPace = Math.abs(endingChange) < 0.10
    ? "about the same pace"
    : endingChange < 0 ? "faster at the end" : "slower at the end";
  return {
    clickCount: clickTimestamps.length,
    clickTimestamps,
    interClickIntervals,
    meanInterval: numeric(meanInterval),
    medianInterval: numeric(median(interClickIntervals)),
    normalizedRhythm: interClickIntervals.map((value) => numeric(value / total)),
    duration,
    regularity,
    coefficientOfVariation: numeric(coefficientOfVariation),
    beginningMeanInterval: numeric(beginningMeanInterval),
    endingMeanInterval: numeric(endingMeanInterval),
    beginningVersusEndingPace,
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function researchStorageKey(audioSha256: string): string {
  return `${STORAGE_PREFIX}${audioSha256}`;
}

export function saveResearchDocument(storage: StorageLike, document: ResearchDocument): void {
  storage.setItem(researchStorageKey(document.audioSha256), JSON.stringify(document));
}

export function loadResearchDocument(storage: StorageLike, audioSha256: string): ResearchDocument | null {
  const raw = storage.getItem(researchStorageKey(audioSha256));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ResearchDocument>;
    if (value.version !== 1 || value.audioSha256 !== audioSha256 || !Array.isArray(value.clicks) || !Array.isArray(value.codas)) return null;
    return value as ResearchDocument;
  } catch {
    return null;
  }
}

export function clearResearchDocument(storage: StorageLike, audioSha256: string): void {
  storage.removeItem(researchStorageKey(audioSha256));
}

export function restoreAutomaticDocument(automatic: ResearchDocument): ResearchDocument {
  return cloneDocument(automatic);
}
