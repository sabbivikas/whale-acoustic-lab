import { aggregateCorpus, createCorpusRecord, deduplicateCorpusRecords } from "./corpus-aggregation";
import { buildCorpusExports, type CorpusExportInput } from "./corpus-export";
import { DEFAULT_CORPUS_FILTERS, filterCorpusRecords } from "./corpus-filter";
import { calculateOutlierScores } from "./corpus-outliers";
import { calculateDeterministicPca } from "./corpus-pca";
import { deleteSavedCorpus, listSavedCorpora, saveCorpusLocally, serializeCorpusForStorage, type SavedCorpus } from "./corpus-persistence";
import { calculateCorpusSimilarity } from "./corpus-similarity";
import type { CorpusFilterConfiguration, CorpusImportReport, CorpusRecord, OutlierRecord, PcaResult, SimilarityResult } from "./corpus-types";
import { parseResearchPackageFile, validateResearchPackage } from "./corpus-validation";

type ColorMode = "clicks" | "codas" | "status" | "source" | "family";
type MatrixSort = "filename" | "clicks" | "codas" | "outlier";

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]!));
const numberInput = (value: number | null): string => value === null ? "" : String(value);
const defaultReport = (): CorpusImportReport => ({ imported: 0, rejected: [], duplicates: [], missingEmbeddings: 0 });

function distribution(values: number[], label: string, formatter: (value: number) => string): string {
  if (!values.length) return `<article class="corpus-chart"><h3>${label}</h3><p>No values available.</p></article>`;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const binCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(values.length))));
  const bins = maximum === minimum ? [{ start: minimum, end: maximum, count: values.length }] : Array.from({ length: binCount }, (_, index) => {
    const start = minimum + (maximum - minimum) * index / binCount;
    const end = minimum + (maximum - minimum) * (index + 1) / binCount;
    return { start, end, count: values.filter((value) => value >= start && (index === binCount - 1 ? value <= end : value < end)).length };
  });
  const largest = Math.max(...bins.map((bin) => bin.count), 1);
  return `<article class="corpus-chart"><h3>${label}</h3><div>${bins.map((bin) => `<span title="${bin.count} recording values"><i style="height:${Math.max(4, bin.count / largest * 100)}%"></i><small>${formatter(bin.start)}${bin.end === bin.start ? "" : `–${formatter(bin.end)}`}</small></span>`).join("")}</div></article>`;
}

function categoricalDistribution(values: Record<string, number>, label: string): string {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return `<article class="corpus-chart"><h3>${label}</h3><p>No values available.</p></article>`;
  const largest = Math.max(...entries.map(([, count]) => count), 1);
  return `<article class="corpus-chart"><h3>${label}</h3><div>${entries.map(([name, count]) => `<span title="${count} annotations"><i style="height:${Math.max(4, count / largest * 100)}%"></i><small>${escapeHtml(name)}</small></span>`).join("")}</div></article>`;
}

export class CorpusWorkspace {
  private records: CorpusRecord[] = [];
  private importReport = defaultReport();
  private filters: CorpusFilterConfiguration = { ...DEFAULT_CORPUS_FILTERS };
  private outlierNeighborCount = 3;
  private colorMode: ColorMode = "clicks";
  private matrixSort: MatrixSort = "filename";
  private selectedHash: string | null = null;
  private savedCorpora: SavedCorpus[] = [];
  private statusMessage = "Corpus data stays in memory unless you explicitly save it locally.";

  constructor(private readonly container: HTMLElement) {
    this.render();
    void this.refreshSavedCorpora();
  }

  show(): void { this.render(); }

  private analysis(): { similarity: SimilarityResult; outliers: OutlierRecord[]; filtered: CorpusRecord[]; displaySimilarity: SimilarityResult; displayOutliers: OutlierRecord[]; pca: PcaResult } {
    const similarity = calculateCorpusSimilarity(this.records);
    const outliers = calculateOutlierScores(similarity, this.outlierNeighborCount);
    const filtered = filterCorpusRecords(this.records, this.filters, similarity, outliers);
    const displaySimilarity = calculateCorpusSimilarity(filtered);
    return { similarity, outliers, filtered, displaySimilarity, displayOutliers: calculateOutlierScores(displaySimilarity, this.outlierNeighborCount), pca: calculateDeterministicPca(filtered) };
  }

  private async importFiles(files: File[]): Promise<void> {
    const results = await Promise.all(files.map(async (file) => ({ file, validation: await parseResearchPackageFile(file) })));
    const rejected: CorpusImportReport["rejected"] = [];
    const incoming: CorpusRecord[] = [];
    results.forEach(({ file, validation }) => {
      if (!validation.valid) rejected.push({ filename: file.name, reasons: validation.errors });
      else incoming.push(createCorpusRecord(validation));
    });
    const deduplicated = deduplicateCorpusRecords(this.records, incoming);
    this.records = deduplicated.records;
    this.importReport = {
      imported: incoming.length - deduplicated.duplicates.length,
      rejected,
      duplicates: deduplicated.duplicates.map((record) => ({ filename: record.filename, audioSha256: record.hash })),
      missingEmbeddings: incoming.filter((record) => record.embedding === null).length,
    };
    this.statusMessage = `${this.importReport.imported} package${this.importReport.imported === 1 ? "" : "s"} added to the in-memory corpus.`;
    if (!this.selectedHash) this.selectedHash = this.records[0]?.hash ?? null;
    this.render();
  }

  private render(): void {
    const analysis = this.analysis();
    const aggregate = aggregateCorpus(analysis.filtered);
    const families = [...new Set(this.records.flatMap((record) => record.rhythmFamilies))].sort();
    const selected = analysis.filtered.find((record) => record.hash === this.selectedHash) ?? analysis.filtered[0] ?? null;
    if (selected) this.selectedHash = selected.hash;
    const outlierByHash = new Map(analysis.displayOutliers.map((item) => [item.hash, item]));
    const nearest = selected ? analysis.displaySimilarity.nearestByHash[selected.hash] : null;
    const selectedOutlier = selected ? outlierByHash.get(selected.hash) : null;
    this.container.innerHTML = `<section class="corpus-header"><div><span class="kicker">Browser-only researcher workspace</span><h1>Corpus Explorer</h1><p>Compare exported research packages and existing WhAM fingerprints locally. Imported files are never uploaded.</p></div><label class="corpus-import">Import research packages<input data-corpus-files type="file" accept="application/json,.json" multiple><span>Choose multiple JSON files</span></label></section>
      <aside class="corpus-privacy"><strong>Local by design</strong><span>Corpus state is held in memory by default. Closing or reloading this page clears it unless you explicitly use “Save this corpus locally.”</span></aside>
      ${this.renderImportReport()}
      ${this.records.length ? `<div class="corpus-layout"><aside class="corpus-filters">${this.renderFilters(families)}</aside><div class="corpus-content">
        <div class="corpus-showing"><strong>${analysis.filtered.length} of ${this.records.length} recordings shown</strong><button type="button" data-clear-corpus>Clear in-memory corpus</button></div>
        ${this.renderDashboard(aggregate)}
        ${this.renderEmbeddingSection(analysis.filtered, analysis.displaySimilarity, analysis.displayOutliers, analysis.pca, selected)}
        ${this.renderRecordDetails(selected, nearest, selectedOutlier)}
        ${this.renderExports(analysis.filtered, analysis.displaySimilarity, analysis.displayOutliers, analysis.pca)}
        ${this.renderPersistence()}
      </div></div>` : this.renderEmpty()}
      <p class="corpus-status" data-corpus-status aria-live="polite">${escapeHtml(this.statusMessage)}</p>`;
    this.bindEvents(analysis);
  }

  private renderEmpty(): string {
    return `<section class="corpus-empty"><span>⌁</span><h2>Import exported research packages to begin</h2><p>Accepted files use the <code>whale_acoustic_lab_research_package</code> schema version 1.0.0. Audio files are neither required nor accepted.</p></section>${this.renderPersistence()}`;
  }

  private renderImportReport(): string {
    const report = this.importReport;
    if (!report.imported && !report.rejected.length && !report.duplicates.length) return "";
    return `<section class="corpus-import-report"><dl><div><dt>Imported</dt><dd>${report.imported}</dd></div><div><dt>Rejected</dt><dd>${report.rejected.length}</dd></div><div><dt>Duplicates</dt><dd>${report.duplicates.length}</dd></div><div><dt>Missing embeddings</dt><dd>${report.missingEmbeddings}</dd></div></dl>${report.rejected.length ? `<details><summary>Rejected files and reasons</summary><ul>${report.rejected.map((item) => `<li><strong>${escapeHtml(item.filename)}</strong> — ${item.reasons.map(escapeHtml).join("; ")}</li>`).join("")}</ul></details>` : ""}${report.duplicates.length ? `<details><summary>Duplicate recordings</summary><ul>${report.duplicates.map((item) => `<li>${escapeHtml(item.filename)} — ${escapeHtml(item.audioSha256)}</li>`).join("")}</ul></details>` : ""}</section>`;
  }

  private renderFilters(families: string[]): string {
    const option = (value: string, label: string, selected: string | null) => `<option value="${value}" ${value === (selected ?? "") ? "selected" : ""}>${label}</option>`;
    return `<div class="corpus-filter-heading"><span class="kicker">Filters</span><button type="button" data-reset-filters>Reset</button></div>
      <fieldset><legend>Reviewed click count</legend><label>Minimum<input data-filter="minimumClickCount" type="number" min="0" value="${numberInput(this.filters.minimumClickCount)}"></label><label>Maximum<input data-filter="maximumClickCount" type="number" min="0" value="${numberInput(this.filters.maximumClickCount)}"></label></fieldset>
      <fieldset><legend>Reviewed coda count</legend><label>Minimum<input data-filter="minimumCodaCount" type="number" min="0" value="${numberInput(this.filters.minimumCodaCount)}"></label><label>Maximum<input data-filter="maximumCodaCount" type="number" min="0" value="${numberInput(this.filters.maximumCodaCount)}"></label></fieldset>
      <label>Rhythm family<select data-filter="rhythmFamily">${option("", "Any family", this.filters.rhythmFamily)}${families.map((family) => option(family, family, this.filters.rhythmFamily)).join("")}</select></label>
      <label>Annotation status<select data-filter="annotationStatus">${option("", "Any status", this.filters.annotationStatus)}${option("accepted", "Accepted", this.filters.annotationStatus)}${option("rejected", "Rejected present", this.filters.annotationStatus)}${option("uncertain", "Uncertain present", this.filters.annotationStatus)}</select></label>
      <label>Human corrections<select data-filter="humanCorrections">${option("any", "Any", this.filters.humanCorrections)}${option("yes", "Present", this.filters.humanCorrections)}${option("no", "None", this.filters.humanCorrections)}</select></label>
      <label>Embedding<select data-filter="embeddingAvailable">${option("any", "Any", this.filters.embeddingAvailable)}${option("yes", "Available", this.filters.embeddingAvailable)}${option("no", "Missing", this.filters.embeddingAvailable)}</select></label>
      <fieldset><legend>Nearest cosine similarity</legend><label>Minimum<input data-filter="minimumNearestSimilarity" type="number" min="-1" max="1" step="0.01" value="${numberInput(this.filters.minimumNearestSimilarity)}"></label><label>Maximum<input data-filter="maximumNearestSimilarity" type="number" min="-1" max="1" step="0.01" value="${numberInput(this.filters.maximumNearestSimilarity)}"></label></fieldset>
      <fieldset><legend>Outlier score</legend><label>Minimum<input data-filter="minimumOutlierScore" type="number" min="0" max="2" step="0.01" value="${numberInput(this.filters.minimumOutlierScore)}"></label><label>Maximum<input data-filter="maximumOutlierScore" type="number" min="0" max="2" step="0.01" value="${numberInput(this.filters.maximumOutlierScore)}"></label></fieldset>`;
  }

  private renderDashboard(aggregate: ReturnType<typeof aggregateCorpus>): string {
    return `<section class="corpus-dashboard"><div class="corpus-section-heading"><span class="kicker">Corpus dashboard</span><h2>Review-set overview</h2></div><div class="corpus-kpis"><dl><dt>Recordings</dt><dd>${aggregate.recordingCount}</dd></dl><dl><dt>With embeddings</dt><dd>${aggregate.recordingsWithEmbeddings}</dd></dl><dl><dt>Reviewed / automatic codas</dt><dd>${aggregate.totalReviewedCodas} / ${aggregate.totalAutomaticCodas}</dd></dl><dl><dt>Reviewed / automatic clicks</dt><dd>${aggregate.totalReviewedClicks} / ${aggregate.totalAutomaticClicks}</dd></dl></div>
      <div class="corpus-charts">${distribution(aggregate.clickCounts, "Click-count distribution", (value) => Math.round(value).toString())}${distribution(aggregate.codaDurationsSeconds, "Coda-duration distribution", (value) => `${value.toFixed(2)}s`)}${distribution(aggregate.meanInterClickIntervalsSeconds, "Mean ICI distribution", (value) => `${Math.round(value * 1000)}ms`)}${categoricalDistribution(aggregate.regularityDistribution, "Regularity distribution")}</div>
      <div class="corpus-breakdowns"><article><h3>Annotation source</h3><p><strong>${aggregate.humanCorrectedAnnotationCount}</strong> human corrected</p><p><strong>${aggregate.automaticAnnotationCount}</strong> still automatic</p></article><article><h3>Annotation status</h3><p>${aggregate.statusCounts.accepted} accepted · ${aggregate.statusCounts.rejected} rejected · ${aggregate.statusCounts.uncertain} uncertain</p></article><article><h3>Most corrections</h3>${aggregate.mostCorrected.slice(0, 5).map((item) => `<p><button data-select-record="${item.hash}">${escapeHtml(item.filename)}</button> <strong>${item.correctionCount}</strong></p>`).join("") || "<p>None</p>"}</article><article><h3>Missing or incomplete fields</h3>${aggregate.incomplete.slice(0, 5).map((item) => `<p><button data-select-record="${item.hash}">${escapeHtml(item.filename)}</button> ${item.missingFields.length}</p>`).join("") || "<p>None reported</p>"}</article></div></section>`;
  }

  private renderEmbeddingSection(records: CorpusRecord[], similarity: SimilarityResult, outliers: OutlierRecord[], pca: PcaResult, selected: CorpusRecord | null): string {
    const outlierByHash = new Map(outliers.map((item) => [item.hash, item.score]));
    const ordered = [...records].filter((record) => similarity.compatibleHashes.includes(record.hash)).sort((left, right) => {
      if (this.matrixSort === "clicks") return right.reviewedClickCount - left.reviewedClickCount || left.hash.localeCompare(right.hash);
      if (this.matrixSort === "codas") return right.reviewedCodaCount - left.reviewedCodaCount || left.hash.localeCompare(right.hash);
      if (this.matrixSort === "outlier") return (outlierByHash.get(right.hash) ?? -1) - (outlierByHash.get(left.hash) ?? -1) || left.hash.localeCompare(right.hash);
      return left.filename.localeCompare(right.filename) || left.hash.localeCompare(right.hash);
    });
    return `<section class="corpus-embeddings"><div class="corpus-section-heading"><span class="kicker">Existing WhAM fingerprints</span><h2>Model-space comparison</h2><p>${similarity.compatibleHashes.length} compatible embedding${similarity.compatibleHashes.length === 1 ? "" : "s"}${similarity.expectedDimension ? ` · expected dimension ${similarity.expectedDimension}` : ""}. Outliers are candidates for manual review, not biological discoveries.</p></div>
      <div class="embedding-controls"><label>PCA point color<select data-color-mode><option value="clicks" ${this.colorMode === "clicks" ? "selected" : ""}>Click count</option><option value="codas" ${this.colorMode === "codas" ? "selected" : ""}>Coda count</option><option value="status" ${this.colorMode === "status" ? "selected" : ""}>Annotation status</option><option value="source" ${this.colorMode === "source" ? "selected" : ""}>Automatic vs human corrected</option><option value="family" ${this.colorMode === "family" ? "selected" : ""}>Nearest published rhythm family</option></select></label><label>Outlier neighbors (k)<input data-outlier-k type="number" min="1" max="${Math.max(1, similarity.compatibleHashes.length - 1)}" value="${this.outlierNeighborCount}"></label><label>Matrix sort<select data-matrix-sort><option value="filename" ${this.matrixSort === "filename" ? "selected" : ""}>Filename</option><option value="clicks" ${this.matrixSort === "clicks" ? "selected" : ""}>Click count</option><option value="codas" ${this.matrixSort === "codas" ? "selected" : ""}>Coda count</option><option value="outlier" ${this.matrixSort === "outlier" ? "selected" : ""}>Outlier score</option></select></label></div>
      <div class="pca-layout"><div>${this.renderPca(records, pca, selected)}<p class="pca-note">PC1 explained variance ${(pca.explainedVariance[0] * 100).toFixed(1)}% · PC2 ${(pca.explainedVariance[1] * 100).toFixed(1)}%. PCA uses L2-normalized compatible embeddings and does not establish identity, clan, dialect, meaning, or behavior.</p></div><div class="nearest-pairs"><h3>Nearest recording pairs</h3>${similarity.pairs.slice(0, 8).map((pair) => `<button data-select-record="${pair.leftHash}"><span>${escapeHtml(this.records.find((record) => record.hash === pair.leftHash)?.filename ?? pair.leftHash.slice(0, 12))}</span><i>↔</i><span>${escapeHtml(this.records.find((record) => record.hash === pair.rightHash)?.filename ?? pair.rightHash.slice(0, 12))}</span><strong>${pair.similarity.toFixed(4)}</strong></button>`).join("") || "<p>At least two compatible embeddings are required.</p>"}</div></div>
      ${this.renderSimilarityMatrix(ordered, similarity)}
      <div class="corpus-neighbor-table"><h3>Each recording’s nearest neighbor and outlier score</h3><div><table><thead><tr><th>Recording</th><th>Nearest neighbor</th><th>Similarity</th><th>Outlier score</th><th>k</th></tr></thead><tbody>${ordered.map((record) => { const neighbor = similarity.nearestByHash[record.hash]; const outlier = outliers.find((item) => item.hash === record.hash); return `<tr><td><button data-select-record="${record.hash}">${escapeHtml(record.filename)}</button></td><td>${escapeHtml(this.records.find((item) => item.hash === neighbor?.hash)?.filename ?? "—")}</td><td>${neighbor?.similarity.toFixed(5) ?? "—"}</td><td>${outlier?.score?.toFixed(5) ?? "—"}</td><td>${outlier?.neighborCountUsed ?? 0}</td></tr>`; }).join("")}</tbody></table></div></div>
    </section>`;
  }

  private renderPca(records: CorpusRecord[], pca: PcaResult, selected: CorpusRecord | null): string {
    if (!pca.points.length) return `<div class="pca-empty">No compatible embeddings available for PCA.</div>`;
    const xs = pca.points.map((point) => point.x), ys = pca.points.map((point) => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scaleX = (value: number) => 45 + (value - minX) / Math.max(1e-12, maxX - minX) * 610;
    const scaleY = (value: number) => 330 - (value - minY) / Math.max(1e-12, maxY - minY) * 285;
    const color = (record: CorpusRecord): string => {
      if (this.colorMode === "status") return record.representativeStatus === "accepted" ? "#62d6c3" : record.representativeStatus === "uncertain" ? "#e6b867" : "#da7772";
      if (this.colorMode === "source") return record.humanCorrectionCount ? "#e5a468" : "#65d9c6";
      if (this.colorMode === "family") { const text = record.rhythmFamilies[0] ?? "none"; let seed = 0; for (const char of text) seed = (seed * 31 + char.charCodeAt(0)) >>> 0; return `hsl(${seed % 360} 58% 62%)`; }
      const value = this.colorMode === "clicks" ? record.reviewedClickCount : record.reviewedCodaCount;
      const maximum = Math.max(1, ...records.map((item) => this.colorMode === "clicks" ? item.reviewedClickCount : item.reviewedCodaCount));
      return `hsl(${185 - value / maximum * 120} 62% 61%)`;
    };
    return `<svg class="pca-map" viewBox="0 0 700 370" role="img" aria-label="Deterministic two-dimensional PCA map of compatible WhAM embeddings"><line x1="45" y1="330" x2="665" y2="330"/><line x1="45" y1="35" x2="45" y2="330"/><text x="620" y="355">PC1</text><text x="10" y="25">PC2</text>${pca.points.map((point) => { const record = records.find((item) => item.hash === point.hash)!; return `<g data-pca-point="${record.hash}" tabindex="0" role="button" aria-label="${escapeHtml(record.filename)}, select recording"><circle cx="${scaleX(point.x)}" cy="${scaleY(point.y)}" r="${record.hash === selected?.hash ? 10 : 7}" fill="${color(record)}"/><title>${escapeHtml(record.filename)} · ${record.hash.slice(0, 12)}</title></g>`; }).join("")}</svg>`;
  }

  private renderSimilarityMatrix(ordered: CorpusRecord[], similarity: SimilarityResult): string {
    if (!ordered.length) return `<div class="similarity-matrix"><h3>Pairwise similarity matrix</h3><p>No compatible embeddings.</p></div>`;
    const index = new Map(similarity.compatibleHashes.map((hash, position) => [hash, position]));
    return `<div class="similarity-matrix"><h3>Sortable cosine-similarity matrix</h3><div><table><thead><tr><th>Recording</th>${ordered.map((record) => `<th title="${escapeHtml(record.filename)}">${escapeHtml(record.filename.slice(0, 12))}</th>`).join("")}</tr></thead><tbody>${ordered.map((row) => `<tr><th><button data-select-record="${row.hash}">${escapeHtml(row.filename)}</button></th>${ordered.map((column) => { const value = similarity.matrix[index.get(row.hash)!][index.get(column.hash)!]; const lightness = Math.max(20, Math.min(70, 25 + (value + 1) / 2 * 45)); return `<td style="background:hsl(171 38% ${lightness}%)" title="${value}">${value.toFixed(3)}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  }

  private renderRecordDetails(record: CorpusRecord | null, nearest: SimilarityResult["nearestByHash"][string] | null, outlier: OutlierRecord | null | undefined): string {
    if (!record) return "";
    const limitations = record.package.scientific_limitations ?? [];
    const regularity = Object.entries(record.regularityCounts).map(([label, count]) => `${label}: ${count}`).join(", ") || "Not available";
    const meanIci = record.meanInterClickIntervalsSeconds.length ? record.meanInterClickIntervalsSeconds.reduce((sum, value) => sum + value, 0) / record.meanInterClickIntervalsSeconds.length : null;
    return `<section class="corpus-record-detail"><div class="corpus-section-heading"><span class="kicker">Selected recording</span><h2>${escapeHtml(record.filename)}</h2><p>${record.hash}</p></div><div class="record-detail-grid"><dl><dt>Reviewed / automatic clicks</dt><dd>${record.reviewedClickCount} / ${record.automaticClickCount}</dd><dt>Reviewed / automatic codas</dt><dd>${record.reviewedCodaCount} / ${record.automaticCodaCount}</dd><dt>Human corrections</dt><dd>${record.humanCorrectionCount}</dd><dt>Rhythm families present</dt><dd>${escapeHtml(record.rhythmFamilies.join(", ") || "Not available")}</dd><dt>Reviewed coda durations</dt><dd>${record.codaDurationsSeconds.map((value) => `${value}s`).join(", ") || "Not available"}</dd><dt>Mean reviewed ICI</dt><dd>${meanIci === null ? "Not available" : `${meanIci}s`}</dd><dt>Regularity measurements</dt><dd>${escapeHtml(regularity)}</dd></dl><dl><dt>Embedding</dt><dd>${record.embedding ? `${record.embeddingDimension} values` : "Missing or unusable"}</dd><dt>Nearest neighbor</dt><dd>${escapeHtml(this.records.find((item) => item.hash === nearest?.hash)?.filename ?? "—")}${nearest ? ` · ${nearest.similarity.toFixed(5)}` : ""}</dd><dt>Outlier score</dt><dd>${outlier?.score?.toFixed(5) ?? "—"}</dd><dt>Provenance package</dt><dd>Research package ${escapeHtml(record.packageVersion)}</dd><dt>Export timestamp</dt><dd>${escapeHtml(record.package.export_timestamp)}</dd><dt>Audio duration</dt><dd>${record.originalDurationSeconds}s original · ${record.analyzedDurationSeconds}s analyzed</dd><dt>Sample rate</dt><dd>${record.sampleRateHz} Hz</dd></dl></div><details><summary>Detector, segmentation, and model provenance</summary><pre>${escapeHtml(JSON.stringify({ detector_and_segmentation: record.package.detector_and_segmentation, model_and_algorithm_identifiers: record.package.available_model_and_algorithm_identifiers }, null, 2))}</pre></details><details><summary>Acoustic neighbors already stored in package</summary><pre>${escapeHtml(JSON.stringify(record.package.existing_acoustic_neighbors ?? [], null, 2))}</pre></details><details><summary>Scientific limitations</summary><ul>${limitations.map((value) => `<li>${escapeHtml(value)}</li>`).join("") || "<li>No package-specific limitations were supplied.</li>"}</ul></details></section>`;
  }

  private exportInput(records: CorpusRecord[], similarity: SimilarityResult, outliers: OutlierRecord[], pca: PcaResult): CorpusExportInput {
    return { records, filters: this.filters, similarity, pca, outliers, outlierNeighborCount: this.outlierNeighborCount, generationTimestamp: new Date().toISOString() };
  }

  private renderExports(records: CorpusRecord[], similarity: SimilarityResult, outliers: OutlierRecord[], pca: PcaResult): string {
    const disabled = records.length ? "" : "disabled";
    return `<section class="corpus-exports"><div class="corpus-section-heading"><span class="kicker">Local corpus downloads</span><h2>Export filtered corpus data</h2><p>Exports include the current filter configuration, algorithms, explained variance, definitions, timestamp, and scientific limitations.</p></div><div><button data-corpus-export="summary" ${disabled}>Corpus summary JSON</button><button data-corpus-export="recordings" ${disabled}>Recording CSV</button><button data-corpus-export="similarities" ${disabled}>Pairwise similarity CSV</button><button data-corpus-export="outliers" ${disabled}>Outlier-review CSV</button></div></section>`;
  }

  private renderPersistence(): string {
    return `<section class="corpus-persistence"><div><span class="kicker">Optional browser storage</span><h2>Saved local corpora</h2><p>Saving is explicit and uses IndexedDB on this device. Imported files are never saved automatically.</p></div>${this.records.length ? `<div class="save-corpus"><input data-corpus-name maxlength="80" placeholder="Optional corpus name"><button type="button" data-save-corpus>Save this corpus locally</button></div>` : ""}<div class="saved-corpus-list">${this.savedCorpora.map((corpus) => `<article><div><strong>${escapeHtml(corpus.name)}</strong><small>${corpus.audioHashes.length} recordings · ${escapeHtml(corpus.savedAt)}</small></div><button data-load-corpus="${corpus.corpusId}">Load</button><button data-delete-corpus="${corpus.corpusId}">Delete</button></article>`).join("") || "<p>No locally saved corpora.</p>"}</div></section>`;
  }

  private bindEvents(analysis: ReturnType<CorpusWorkspace["analysis"]>): void {
    const files = this.container.querySelector<HTMLInputElement>("[data-corpus-files]");
    if (files) files.onchange = () => { if (files.files?.length) void this.importFiles([...files.files]); };
    this.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-filter]").forEach((control) => {
      control.onchange = () => {
        const key = control.dataset.filter as keyof CorpusFilterConfiguration;
        const target = this.filters as unknown as Record<string, unknown>;
        if (control instanceof HTMLInputElement) target[key] = control.value === "" ? null : Number(control.value);
        else target[key] = control.value === "" ? null : control.value;
        this.render();
      };
    });
    this.container.querySelector<HTMLButtonElement>("[data-reset-filters]")?.addEventListener("click", () => { this.filters = { ...DEFAULT_CORPUS_FILTERS }; this.render(); });
    this.container.querySelector<HTMLButtonElement>("[data-clear-corpus]")?.addEventListener("click", () => { this.records = []; this.selectedHash = null; this.importReport = defaultReport(); this.statusMessage = "The in-memory corpus was cleared."; this.render(); });
    this.container.querySelector<HTMLSelectElement>("[data-color-mode]")?.addEventListener("change", (event) => { this.colorMode = (event.target as HTMLSelectElement).value as ColorMode; this.render(); });
    this.container.querySelector<HTMLInputElement>("[data-outlier-k]")?.addEventListener("change", (event) => { this.outlierNeighborCount = Math.max(1, Number((event.target as HTMLInputElement).value) || 1); this.render(); });
    this.container.querySelector<HTMLSelectElement>("[data-matrix-sort]")?.addEventListener("change", (event) => { this.matrixSort = (event.target as HTMLSelectElement).value as MatrixSort; this.render(); });
    this.container.querySelectorAll<HTMLElement>("[data-select-record], [data-pca-point]").forEach((element) => {
      const select = () => { this.selectedHash = element.dataset.selectRecord ?? element.dataset.pcaPoint ?? null; this.render(); this.container.querySelector(".corpus-record-detail")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
      element.onclick = select;
      element.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } };
    });
    this.container.querySelectorAll<HTMLButtonElement>("[data-corpus-export]").forEach((button) => button.onclick = () => this.downloadCorpusExport(button.dataset.corpusExport as "summary" | "recordings" | "similarities" | "outliers", analysis));
    this.container.querySelector<HTMLButtonElement>("[data-save-corpus]")?.addEventListener("click", () => void this.saveCurrentCorpus());
    this.container.querySelectorAll<HTMLButtonElement>("[data-load-corpus]").forEach((button) => button.onclick = () => void this.loadSaved(button.dataset.loadCorpus!));
    this.container.querySelectorAll<HTMLButtonElement>("[data-delete-corpus]").forEach((button) => button.onclick = () => void this.deleteSaved(button.dataset.deleteCorpus!));
  }

  private downloadCorpusExport(kind: "summary" | "recordings" | "similarities" | "outliers", analysis: ReturnType<CorpusWorkspace["analysis"]>): void {
    const file = buildCorpusExports(this.exportInput(analysis.filtered, analysis.displaySimilarity, analysis.displayOutliers, analysis.pca))[kind];
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename; anchor.hidden = true; this.container.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
    this.statusMessage = `${file.filename} was generated locally.`;
    const status = this.container.querySelector<HTMLElement>("[data-corpus-status]"); if (status) status.textContent = this.statusMessage;
  }

  private async refreshSavedCorpora(): Promise<void> {
    try { this.savedCorpora = await listSavedCorpora(); this.render(); }
    catch { this.statusMessage = "IndexedDB is unavailable; the corpus remains in memory only."; }
  }

  private async saveCurrentCorpus(): Promise<void> {
    try {
      const name = this.container.querySelector<HTMLInputElement>("[data-corpus-name]")?.value ?? "";
      const corpus = serializeCorpusForStorage(this.records, name, new Date().toISOString());
      await saveCorpusLocally(corpus); this.statusMessage = `${corpus.name} was saved to IndexedDB on this device.`; await this.refreshSavedCorpora();
    } catch { this.statusMessage = "The corpus could not be saved locally."; this.render(); }
  }

  private async loadSaved(corpusId: string): Promise<void> {
    const saved = this.savedCorpora.find((corpus) => corpus.corpusId === corpusId);
    if (!saved) return;
    const records = saved.packages.map(validateResearchPackage).filter((result) => result.valid).map(createCorpusRecord);
    this.records = deduplicateCorpusRecords([], records).records; this.selectedHash = this.records[0]?.hash ?? null; this.importReport = { imported: this.records.length, rejected: [], duplicates: [], missingEmbeddings: this.records.filter((record) => !record.embedding).length }; this.statusMessage = `${saved.name} was loaded from IndexedDB.`; this.render();
  }

  private async deleteSaved(corpusId: string): Promise<void> {
    try { await deleteSavedCorpus(corpusId); this.statusMessage = "The saved local corpus was deleted."; await this.refreshSavedCorpora(); }
    catch { this.statusMessage = "The saved corpus could not be deleted."; this.render(); }
  }
}
