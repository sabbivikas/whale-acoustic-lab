import type { CorpusAggregate, CorpusRecord, PackageValidationResult, ResearchPackage } from "./corpus-types";
import type { AnnotationStatus } from "./research-model";

const object = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function rhythmFamilies(researchPackage: ResearchPackage): string[] {
  const families = new Set<string>();
  const inspect = (value: unknown): void => {
    const item = object(value);
    if (!item) return;
    if (typeof item.rhythm_family === "string") families.add(item.rhythm_family);
    const nearest = object(item.nearest_published_family);
    if (nearest && typeof nearest.name === "string") families.add(nearest.name);
    const analysis = object(item.analysis);
    const measured = analysis ? object(analysis.measured_rhythm) : null;
    const measuredNearest = measured ? object(measured.nearest_published_family) : null;
    if (measuredNearest && typeof measuredNearest.name === "string") families.add(measuredNearest.name);
  };
  researchPackage.original_automatic_analysis.coda_boundaries.forEach(inspect);
  researchPackage.reviewed_annotations.recalculated_codas?.forEach(inspect);
  return [...families].sort();
}

export function createCorpusRecord(validation: PackageValidationResult): CorpusRecord {
  if (!validation.valid || !validation.package) throw new Error("A valid research package is required.");
  const researchPackage = validation.package;
  const reviewedAnnotations = [...researchPackage.reviewed_annotations.clicks, ...researchPackage.reviewed_annotations.codas];
  const statusCounts = { accepted: 0, rejected: 0, uncertain: 0 };
  const sourceCounts = { automatic: 0, human_corrected: 0 };
  reviewedAnnotations.forEach((annotation) => {
    statusCounts[annotation.status] += 1;
    sourceCounts[annotation.source] += 1;
  });
  const measurements = researchPackage.reviewed_annotations.recalculated_codas ?? [];
  const codaDurationsSeconds: number[] = [];
  const meanInterClickIntervalsSeconds: number[] = [];
  const regularityCounts: Record<string, number> = {};
  measurements.forEach((entry) => {
    const duration = number(entry.measurements?.duration);
    const meanInterval = number(entry.measurements?.meanInterval);
    if (duration !== null) codaDurationsSeconds.push(duration);
    if (meanInterval !== null) meanInterClickIntervalsSeconds.push(meanInterval);
    if (typeof entry.measurements?.regularity === "string") regularityCounts[entry.measurements.regularity] = (regularityCounts[entry.measurements.regularity] ?? 0) + 1;
  });
  if (!codaDurationsSeconds.length) researchPackage.reviewed_annotations.codas.forEach((coda) => {
    if (coda.status !== "rejected") codaDurationsSeconds.push(coda.endSeconds - coda.startSeconds);
  });
  const missingFields = [...validation.warnings];
  if (!researchPackage.detector_and_segmentation || !Object.keys(researchPackage.detector_and_segmentation).length) missingFields.push("Detector or segmentation settings are missing.");
  if (!researchPackage.available_model_and_algorithm_identifiers || !Object.keys(researchPackage.available_model_and_algorithm_identifiers).length) missingFields.push("Model or algorithm identifiers are missing.");
  const representativeStatus: AnnotationStatus = statusCounts.uncertain > 0 ? "uncertain" : statusCounts.rejected > 0 ? "rejected" : "accepted";
  return {
    hash: researchPackage.audio.sha256,
    filename: researchPackage.audio.original_filename,
    packageVersion: researchPackage.schema_version,
    package: researchPackage,
    originalDurationSeconds: researchPackage.audio.original_duration_seconds,
    analyzedDurationSeconds: researchPackage.audio.analyzed_duration_seconds,
    sampleRateHz: researchPackage.audio.sample_rate_hz,
    automaticClickCount: researchPackage.original_automatic_analysis.click_detections.length,
    reviewedClickCount: researchPackage.reviewed_annotations.clicks.length,
    automaticCodaCount: researchPackage.original_automatic_analysis.coda_boundaries.length,
    reviewedCodaCount: researchPackage.reviewed_annotations.codas.length,
    humanCorrectionCount: researchPackage.human_corrections.length,
    automaticAnnotationCount: sourceCounts.automatic,
    humanCorrectedAnnotationCount: sourceCounts.human_corrected,
    statusCounts,
    representativeStatus,
    codaDurationsSeconds,
    meanInterClickIntervalsSeconds,
    regularityCounts,
    rhythmFamilies: rhythmFamilies(researchPackage),
    embedding: validation.embedding ?? null,
    embeddingDimension: validation.embeddingDimension ?? null,
    embeddingIssue: validation.warnings.find((warning) => /embedding/i.test(warning)) ?? null,
    missingFields: [...new Set(missingFields)],
  };
}

export function deduplicateCorpusRecords(existing: CorpusRecord[], incoming: CorpusRecord[]): { records: CorpusRecord[]; duplicates: CorpusRecord[] } {
  const hashes = new Set(existing.map((record) => record.hash));
  const records = [...existing];
  const duplicates: CorpusRecord[] = [];
  incoming.forEach((record) => {
    if (hashes.has(record.hash)) duplicates.push(record);
    else { hashes.add(record.hash); records.push(record); }
  });
  return { records, duplicates };
}

export function aggregateCorpus(records: CorpusRecord[]): CorpusAggregate {
  const regularityDistribution: Record<string, number> = {};
  records.forEach((record) => Object.entries(record.regularityCounts).forEach(([label, count]) => { regularityDistribution[label] = (regularityDistribution[label] ?? 0) + count; }));
  return {
    recordingCount: records.length,
    recordingsWithEmbeddings: records.filter((record) => record.embedding !== null).length,
    totalReviewedCodas: records.reduce((sum, record) => sum + record.reviewedCodaCount, 0),
    totalAutomaticCodas: records.reduce((sum, record) => sum + record.automaticCodaCount, 0),
    totalReviewedClicks: records.reduce((sum, record) => sum + record.reviewedClickCount, 0),
    totalAutomaticClicks: records.reduce((sum, record) => sum + record.automaticClickCount, 0),
    automaticAnnotationCount: records.reduce((sum, record) => sum + record.automaticAnnotationCount, 0),
    humanCorrectedAnnotationCount: records.reduce((sum, record) => sum + record.humanCorrectedAnnotationCount, 0),
    statusCounts: records.reduce((totals, record) => ({ accepted: totals.accepted + record.statusCounts.accepted, rejected: totals.rejected + record.statusCounts.rejected, uncertain: totals.uncertain + record.statusCounts.uncertain }), { accepted: 0, rejected: 0, uncertain: 0 }),
    clickCounts: records.map((record) => record.reviewedClickCount),
    codaDurationsSeconds: records.flatMap((record) => record.codaDurationsSeconds),
    meanInterClickIntervalsSeconds: records.flatMap((record) => record.meanInterClickIntervalsSeconds),
    regularityDistribution,
    mostCorrected: records.map((record) => ({ hash: record.hash, filename: record.filename, correctionCount: record.humanCorrectionCount })).sort((a, b) => b.correctionCount - a.correctionCount || a.hash.localeCompare(b.hash)).slice(0, 10),
    incomplete: records.filter((record) => record.missingFields.length > 0).map((record) => ({ hash: record.hash, filename: record.filename, missingFields: record.missingFields })),
  };
}
