import type { AnalyzeResponse } from "./api";
import { decodeResearchAudio, type ResearchAudioData } from "./research-audio";
import { buildResearchExports, canExportResearchData, type ResearchExportInput, type ResearchExportSet } from "./research-export";
import {
  buildEvaluationExports,
  DEFAULT_CLICK_TOLERANCE_SECONDS,
  evaluateAnnotations,
  evaluationSummary,
  type AnnotationEvaluation,
} from "./research-evaluation";
import {
  addClick,
  annotateClick,
  annotateCoda,
  calculateCodaMeasurements,
  clearResearchDocument,
  createResearchDocument,
  deleteClick,
  joinAdjacentCodas,
  loadResearchDocument,
  moveClick,
  resizeCoda,
  restoreAutomaticDocument,
  saveResearchDocument,
  splitCoda,
  type AnnotationStatus,
  type ResearchCoda,
  type ResearchDocument,
} from "./research-model";

type Tool = "select" | "add" | "split";
type Drag = { type: "click"; id: string } | { type: "coda-start" | "coda-end"; id: string };

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character]!));
const seconds = (value: number | null): string => value === null ? "—" : `${value.toFixed(3)} s`;
const milliseconds = (value: number | null): string => value === null ? "—" : `${Math.round(value * 1000)} ms`;
const statusOptions = (selected: AnnotationStatus): string => (["accepted", "rejected", "uncertain"] as const)
  .map((status) => `<option value="${status}" ${status === selected ? "selected" : ""}>${status}</option>`).join("");

function colorFor(value: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [
    [3, 15, 25], [11, 50, 66], [20, 112, 119], [92, 190, 166], [232, 192, 121],
  ];
  const position = Math.max(0, Math.min(0.999, value)) * (stops.length - 1);
  const start = Math.floor(position);
  const mix = position - start;
  return stops[start].map((component, index) => Math.round(component + (stops[start + 1][index] - component) * mix)) as [number, number, number];
}

export class ResearchWorkspace {
  private readonly automatic: ResearchDocument;
  private document: ResearchDocument;
  private audioData?: ResearchAudioData;
  private tool: Tool = "select";
  private selectedClickId: string | null = null;
  private selectedCodaId: string | null;
  private drag: Drag | null = null;
  private frame = 0;
  private audioLoading = false;
  private evaluationToleranceSeconds = DEFAULT_CLICK_TOLERANCE_SECONDS;

  constructor(
    private readonly container: HTMLElement,
    private readonly response: AnalyzeResponse,
    private readonly file: File,
    private readonly audioSha256: string,
    private readonly audio: HTMLAudioElement,
  ) {
    this.automatic = createResearchDocument(response, audioSha256);
    this.document = loadResearchDocument(localStorage, audioSha256) ?? restoreAutomaticDocument(this.automatic);
    this.selectedCodaId = this.document.codas[0]?.id ?? null;
    this.render();
  }

  start(): void {
    if (!this.audioData && !this.audioLoading) void this.loadAudio();
    cancelAnimationFrame(this.frame);
    const tick = () => {
      this.drawVisualization();
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  destroy(): void {
    this.stop();
    this.container.replaceChildren();
  }

  private async loadAudio(): Promise<void> {
    this.audioLoading = true;
    try {
      this.audioData = await decodeResearchAudio(
        this.file,
        this.response.uploaded_recording.trim_start_seconds,
        this.response.uploaded_recording.analyzed_duration_seconds,
      );
      this.render();
    } catch {
      const status = this.container.querySelector<HTMLElement>("[data-audio-status]");
      if (status) status.textContent = "The recording could not be decoded for the local spectrogram. Annotation controls remain available.";
    } finally {
      this.audioLoading = false;
    }
  }

  private persist(next: ResearchDocument): void {
    this.document = next;
    saveResearchDocument(localStorage, next);
    this.render();
    this.start();
  }

  private saveDraft(next: ResearchDocument): void {
    this.document = next;
    saveResearchDocument(localStorage, next);
  }

  private selectedCoda(): ResearchCoda | undefined {
    return this.document.codas.find((coda) => coda.id === this.selectedCodaId);
  }

  private render(): void {
    const codas = [...this.document.codas].sort((a, b) => a.startSeconds - b.startSeconds);
    if (this.selectedCodaId && !codas.some((coda) => coda.id === this.selectedCodaId)) this.selectedCodaId = codas[0]?.id ?? null;
    const selectedCoda = this.selectedCoda();
    const selectedClick = this.document.clicks.find((click) => click.id === this.selectedClickId);
    const measurements = selectedCoda ? calculateCodaMeasurements(this.document, selectedCoda.id) : null;
    const humanCount = this.document.clicks.filter((click) => click.source === "human_corrected").length
      + this.document.codas.filter((coda) => coda.source === "human_corrected").length;
    const exportReady = canExportResearchData(this.exportInput("1970-01-01T00:00:00.000Z"));
    const evaluation = evaluateAnnotations(this.automatic, this.document, this.evaluationToleranceSeconds);

    this.container.innerHTML = `
      <section class="research-header">
        <div><span class="kicker">Research Mode</span><h1>Review the automatic acoustic annotations</h1><p>Edit estimates locally without rerunning WhAM or changing the original server analysis.</p></div>
        <div class="research-save-state"><strong>${humanCount ? `${humanCount} human-corrected item${humanCount === 1 ? "" : "s"}` : "Automatic analysis unchanged"}</strong><small>Draft saved only in this browser · audio SHA-256 ${escapeHtml(this.audioSha256.slice(0, 12))}…</small><button type="button" data-restore>Restore automatic analysis</button></div>
      </section>
      <aside class="research-phone-notice" role="note"><strong>Precise editing works best on a larger screen.</strong> You can review this workspace on a phone, but use a tablet or desktop to place timing markers accurately.</aside>
      <section class="research-visual-panel" aria-labelledby="research-visual-title">
        <div class="research-panel-heading"><div><h2 id="research-visual-title">Synchronized waveform and spectrogram</h2><p data-audio-status>${this.audioData ? "Analyzed interval decoded locally in your browser." : "Preparing the local spectrogram…"}</p></div><div class="annotation-legend" aria-label="Annotation legend"><span class="legend-auto">Automatic</span><span class="legend-human">Human corrected</span><span class="legend-uncertain">Uncertain</span></div></div>
        <div class="research-tools" role="toolbar" aria-label="Waveform annotation tools">
          <button type="button" data-tool="select" class="${this.tool === "select" ? "active" : ""}" aria-pressed="${this.tool === "select"}">Select / move</button>
          <button type="button" data-tool="add" class="${this.tool === "add" ? "active" : ""}" aria-pressed="${this.tool === "add"}">＋ Add click</button>
          <button type="button" data-tool="split" class="${this.tool === "split" ? "active" : ""}" aria-pressed="${this.tool === "split"}">Split coda</button>
          <span>Drag markers or region edges. Arrow keys move a selected click by 1 ms; Shift + arrow uses 10 ms.</span>
        </div>
        <canvas class="research-canvas" width="1200" height="520" tabindex="0" aria-label="Editable waveform and spectrogram. Use Select, Add click, or Split coda tools. Select a marker and use arrow keys for precise timing."></canvas>
        <div class="research-time-axis" aria-hidden="true"><span>0.000 s</span><span>${(this.document.durationSeconds / 2).toFixed(3)} s</span><span>${this.document.durationSeconds.toFixed(3)} s</span></div>
      </section>
      <section class="research-edit-grid">
        <article class="research-editor">
          <div class="research-panel-heading"><div><span class="kicker">Coda regions</span><h2>Edit boundaries and disposition</h2></div><select data-coda-select aria-label="Selected coda">${codas.map((coda, index) => `<option value="${coda.id}" ${coda.id === this.selectedCodaId ? "selected" : ""}>Coda ${index + 1}</option>`).join("")}</select></div>
          ${selectedCoda ? `<div class="region-fields">
            <label>Begin time (s)<input data-coda-start type="number" min="0" max="${this.document.durationSeconds}" step="0.001" value="${selectedCoda.startSeconds.toFixed(3)}"></label>
            <label>End time (s)<input data-coda-end type="number" min="0" max="${this.document.durationSeconds}" step="0.001" value="${selectedCoda.endSeconds.toFixed(3)}"></label>
            <label>Status<select data-coda-status>${statusOptions(selectedCoda.status)}</select></label>
            <label class="wide">Researcher note<input data-coda-note maxlength="240" value="${escapeHtml(selectedCoda.note)}" placeholder="Optional short note"></label>
          </div><div class="region-actions"><button type="button" data-split-middle>Split at midpoint</button><button type="button" data-join-next ${codas.findIndex((coda) => coda.id === selectedCoda.id) >= codas.length - 1 ? "disabled" : ""}>Join next coda</button><button type="button" data-play-coda>▶ Play region</button></div>` : `<p>No probable coda regions were returned. Click markers can still be reviewed.</p>`}
        </article>
        <article class="research-editor">
          <span class="kicker">Selected click</span><h2>${selectedClick ? `${selectedClick.timeSeconds.toFixed(3)} seconds` : "Choose a marker"}</h2>
          ${selectedClick ? `<div class="region-fields">
            <label>Timestamp (s)<input data-click-time type="number" min="0" max="${this.document.durationSeconds}" step="0.001" value="${selectedClick.timeSeconds.toFixed(3)}"></label>
            <label>Status<select data-click-status>${statusOptions(selectedClick.status)}</select></label>
            <label class="wide">Researcher note<input data-click-note maxlength="240" value="${escapeHtml(selectedClick.note)}" placeholder="Optional short note"></label>
          </div><div class="region-actions"><button type="button" data-delete-click>Delete marker</button><span class="source-badge ${selectedClick.source}">${selectedClick.source === "automatic" ? "Automatic detection" : "Human corrected"}</span></div>` : `<p>Select a marker in the visualization or annotation table. Added and moved markers are always labeled human corrected.</p>`}
        </article>
      </section>
      ${measurements ? `<section class="research-measurements" aria-live="polite"><div class="research-panel-heading"><div><span class="kicker">Local recalculation · ${selectedCoda?.source === "human_corrected" ? "human-corrected region" : "automatic region"}</span><h2>Coda ${codas.findIndex((coda) => coda.id === selectedCoda?.id) + 1} measurements</h2></div><small>Rejected clicks are excluded; uncertain clicks remain included and visibly flagged.</small></div><div class="measurement-grid">
        <dl><dt>Click count</dt><dd>${measurements.clickCount}</dd></dl><dl><dt>Coda duration</dt><dd>${seconds(measurements.duration)}</dd></dl><dl><dt>Mean ICI</dt><dd>${milliseconds(measurements.meanInterval)}</dd></dl><dl><dt>Median ICI</dt><dd>${milliseconds(measurements.medianInterval)}</dd></dl><dl><dt>Regularity</dt><dd>${measurements.regularity}</dd></dl><dl><dt>ICI coefficient of variation</dt><dd>${measurements.coefficientOfVariation?.toFixed(3) ?? "—"}</dd></dl><dl><dt>Beginning vs ending pace</dt><dd>${measurements.beginningVersusEndingPace}</dd></dl>
      </div><div class="measurement-series"><p><strong>Click timestamps</strong> ${measurements.clickTimestamps.map((value) => value.toFixed(3)).join(" · ") || "—"}</p><p><strong>Inter-click intervals</strong> ${measurements.interClickIntervals.map((value) => value.toFixed(3)).join(" · ") || "—"}</p><p><strong>Normalized rhythm</strong> ${measurements.normalizedRhythm.map((value) => value.toFixed(4)).join(" · ") || "—"}</p></div></section>` : ""}
      ${this.renderEvaluation(evaluation)}
      <section class="annotation-table-panel"><div class="research-panel-heading"><div><span class="kicker">Annotation table</span><h2>Clicks and intervals</h2></div><small>Source records whether timing or annotation values still match the automatic analysis.</small></div>${this.renderTable(codas)}</section>
      <section class="research-export-panel" aria-labelledby="research-export-title">
        <div class="research-panel-heading"><div><span class="kicker">Local download tools</span><h2 id="research-export-title">Export Research Data</h2><p>Files are generated entirely in this browser from the automatic analysis and your current reviewed draft. Nothing is uploaded.</p></div><span class="export-ready ${exportReady ? "ready" : "blocked"}">${exportReady ? "Ready to export" : "Valid analysis required"}</span></div>
        <div class="research-export-grid">
          <article><h3>JSON research package</h3><p>Complete provenance, original estimates, reviewed annotations, corrections, recalculated measurements, existing embedding and acoustic neighbors.</p><button type="button" data-export="json" ${exportReady ? "" : "disabled"}>Download JSON</button></article>
          <article><h3>CSV annotations</h3><p>One row per click or coda annotation, with spreadsheet-safe text and full stored numeric precision.</p><button type="button" data-export="csv" ${exportReady ? "" : "disabled"}>Download CSV</button></article>
          <article><h3>Raven click table</h3><p>Tab-delimited point selections. Frequency bounds default to 0 Hz through the recording Nyquist frequency.</p><button type="button" data-export="ravenClicks" ${exportReady ? "" : "disabled"}>Download click table</button></article>
          <article><h3>Raven coda table</h3><p>Tab-delimited region selections with reviewed timing, status, source, and researcher notes.</p><button type="button" data-export="ravenCodas" ${exportReady ? "" : "disabled"}>Download coda table</button></article>
        </div>
        <p class="export-frequency-note"><strong>Raven frequency convention:</strong> because this workspace does not measure frequency boundaries manually, exports use 0 Hz as Low Freq and sample rate ÷ 2 as High Freq. Channel is 1 because current annotations are not channel-specific.</p>
        <p class="export-status" data-export-status aria-live="polite"></p>
      </section>
      <aside class="research-method-note"><strong>Scientific boundary</strong><p>This workspace edits measured timing annotations only. It does not infer literal whale meaning, change the original server calculations, or rerun the acoustic model.</p></aside>
    `;
    this.bindEvents();
    this.drawVisualization();
    this.drawEvaluation(evaluation);
  }

  private renderTable(codas: ResearchCoda[]): string {
    const grouped = codas.flatMap((coda, codaIndex) => {
      const clicks = this.document.clicks.filter((click) => click.codaId === coda.id).sort((a, b) => a.timeSeconds - b.timeSeconds);
      const codaRow = `<tr class="coda-table-row ${coda.status === "uncertain" ? "uncertain" : ""}"><td><button type="button" data-select-coda="${coda.id}">${codaIndex + 1}</button></td><td>Coda</td><td>${coda.startSeconds.toFixed(3)}</td><td>${coda.endSeconds.toFixed(3)}</td><td>—</td><td><span class="status-badge ${coda.status}">${coda.status}</span></td><td>${escapeHtml(coda.note) || "—"}</td><td><span class="source-badge ${coda.source}">${coda.source === "automatic" ? "automatic" : "human corrected"}</span></td></tr>`;
      const clickRows = clicks.map((click, clickIndex) => {
        const previous = clicks[clickIndex - 1];
        return `<tr class="${click.status === "uncertain" ? "uncertain" : ""}"><td>${codaIndex + 1}</td><td><button type="button" data-select-click="${click.id}">${clickIndex + 1}</button></td><td>${click.timeSeconds.toFixed(3)}</td><td>—</td><td>${previous ? (click.timeSeconds - previous.timeSeconds).toFixed(3) : "—"}</td><td><span class="status-badge ${click.status}">${click.status}</span></td><td>${escapeHtml(click.note) || "—"}</td><td><span class="source-badge ${click.source}">${click.source === "automatic" ? "automatic" : "human corrected"}</span></td></tr>`;
      });
      return [codaRow, ...clickRows];
    });
    const unassigned = this.document.clicks.filter((click) => click.codaId === null).sort((a, b) => a.timeSeconds - b.timeSeconds).map((click, index) => `<tr class="${click.status === "uncertain" ? "uncertain" : ""}"><td>—</td><td><button type="button" data-select-click="${click.id}">U${index + 1}</button></td><td>${click.timeSeconds.toFixed(3)}</td><td>—</td><td>—</td><td><span class="status-badge ${click.status}">${click.status}</span></td><td>${escapeHtml(click.note) || "—"}</td><td><span class="source-badge ${click.source}">${click.source === "automatic" ? "automatic" : "human corrected"}</span></td></tr>`);
    return `<div class="annotation-table-scroll"><table><thead><tr><th>Coda</th><th>Click</th><th>Begin time (s)</th><th>End time (s)</th><th>ICI (s)</th><th>Status</th><th>Researcher note</th><th>Source type</th></tr></thead><tbody>${[...grouped, ...unassigned].join("") || `<tr><td colspan="8">No click estimates are available.</td></tr>`}</tbody></table></div>`;
  }

  private bindEvents(): void {
    this.container.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.onclick = () => { this.tool = button.dataset.tool as Tool; this.render(); };
    });
    this.container.querySelector<HTMLButtonElement>("[data-restore]")!.onclick = () => {
      clearResearchDocument(localStorage, this.audioSha256);
      this.selectedClickId = null;
      this.selectedCodaId = this.automatic.codas[0]?.id ?? null;
      this.persist(restoreAutomaticDocument(this.automatic));
    };
    const codaSelect = this.container.querySelector<HTMLSelectElement>("[data-coda-select]");
    if (codaSelect) codaSelect.onchange = () => { this.selectedCodaId = codaSelect.value; this.selectedClickId = null; this.render(); };
    const selectedCoda = this.selectedCoda();
    if (selectedCoda) {
      const applyRange = () => {
        const start = Number(this.container.querySelector<HTMLInputElement>("[data-coda-start]")!.value);
        const end = Number(this.container.querySelector<HTMLInputElement>("[data-coda-end]")!.value);
        if (Number.isFinite(start) && Number.isFinite(end)) this.persist(resizeCoda(this.document, selectedCoda.id, start, end));
      };
      this.container.querySelector<HTMLInputElement>("[data-coda-start]")!.onchange = applyRange;
      this.container.querySelector<HTMLInputElement>("[data-coda-end]")!.onchange = applyRange;
      const codaStatus = this.container.querySelector<HTMLSelectElement>("[data-coda-status]")!;
      const codaNote = this.container.querySelector<HTMLInputElement>("[data-coda-note]")!;
      const codaAnnotation = () => annotateCoda(this.document, selectedCoda.id, codaStatus.value as AnnotationStatus, codaNote.value);
      codaStatus.onchange = () => this.persist(codaAnnotation());
      codaNote.oninput = () => this.saveDraft(codaAnnotation());
      this.container.querySelector<HTMLButtonElement>("[data-split-middle]")!.onclick = () => this.persist(splitCoda(this.document, selectedCoda.id, (selectedCoda.startSeconds + selectedCoda.endSeconds) / 2));
      this.container.querySelector<HTMLButtonElement>("[data-join-next]")!.onclick = () => {
        const codas = [...this.document.codas].sort((a, b) => a.startSeconds - b.startSeconds);
        const index = codas.findIndex((coda) => coda.id === selectedCoda.id);
        if (codas[index + 1]) this.persist(joinAdjacentCodas(this.document, selectedCoda.id, codas[index + 1].id));
      };
      this.container.querySelector<HTMLButtonElement>("[data-play-coda]")!.onclick = () => {
        this.audio.currentTime = this.response.uploaded_recording.trim_start_seconds + selectedCoda.startSeconds;
        const stopAt = this.response.uploaded_recording.trim_start_seconds + selectedCoda.endSeconds;
        this.audio.ontimeupdate = () => { if (this.audio.currentTime >= stopAt) { this.audio.pause(); this.audio.ontimeupdate = null; } };
        void this.audio.play();
      };
    }
    const selectedClick = this.document.clicks.find((click) => click.id === this.selectedClickId);
    if (selectedClick) {
      this.container.querySelector<HTMLInputElement>("[data-click-time]")!.onchange = (event) => this.persist(moveClick(this.document, selectedClick.id, Number((event.target as HTMLInputElement).value)));
      const clickStatus = this.container.querySelector<HTMLSelectElement>("[data-click-status]")!;
      const clickNote = this.container.querySelector<HTMLInputElement>("[data-click-note]")!;
      const clickAnnotation = () => annotateClick(this.document, selectedClick.id, clickStatus.value as AnnotationStatus, clickNote.value);
      clickStatus.onchange = () => this.persist(clickAnnotation());
      clickNote.oninput = () => this.saveDraft(clickAnnotation());
      this.container.querySelector<HTMLButtonElement>("[data-delete-click]")!.onclick = () => {
        this.selectedClickId = null;
        this.persist(deleteClick(this.document, selectedClick.id));
      };
    }
    this.container.querySelectorAll<HTMLButtonElement>("[data-select-click]").forEach((button) => {
      button.onclick = () => { this.selectedClickId = button.dataset.selectClick!; this.selectedCodaId = this.document.clicks.find((click) => click.id === this.selectedClickId)?.codaId ?? this.selectedCodaId; this.render(); };
    });
    this.container.querySelectorAll<HTMLButtonElement>("[data-select-coda]").forEach((button) => {
      button.onclick = () => { this.selectedCodaId = button.dataset.selectCoda!; this.selectedClickId = null; this.render(); };
    });
    this.container.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((button) => {
      button.onclick = () => this.downloadExport(button.dataset.export as keyof ResearchExportSet);
    });
    const tolerance = this.container.querySelector<HTMLInputElement>("[data-evaluation-tolerance]");
    if (tolerance) tolerance.onchange = () => {
      const milliseconds = Math.max(1, Math.min(100, Number(tolerance.value)));
      this.evaluationToleranceSeconds = (Number.isFinite(milliseconds) ? milliseconds : 10) / 1000;
      this.render();
    };
    this.container.querySelectorAll<HTMLButtonElement>("[data-evaluation-export]").forEach((button) => {
      button.onclick = () => this.downloadEvaluation(button.dataset.evaluationExport as "json" | "csv");
    });
    this.bindCanvas();
  }

  private renderEvaluation(evaluation: AnnotationEvaluation): string {
    const percent = (value: number | null): string => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
    const error = (value: number | null): string => value === null ? "—" : `${(value * 1000).toFixed(2)} ms`;
    const summary = evaluationSummary(evaluation);
    return `<section class="annotation-evaluation" aria-labelledby="annotation-evaluation-title">
      <div class="research-panel-heading"><div><span class="kicker">Automatic analysis compared with review set</span><h2 id="annotation-evaluation-title">Annotation Evaluation</h2><p>These values measure agreement with the current review set. The review set is not automatically scientific ground truth.</p></div><label class="tolerance-control">Click tolerance<input data-evaluation-tolerance type="number" min="1" max="100" step="1" value="${evaluation.clickMatchingToleranceSeconds * 1000}"><span>milliseconds</span></label></div>
      <p class="tolerance-explanation">The tolerance is the maximum absolute time difference allowed when pairing one automatic click with one reviewed click. Default 10 ms; configurable from 1–100 ms. Each click can be used in at most one pair.</p>
      <canvas class="evaluation-canvas" width="1200" height="290" role="img" aria-label="Aligned automatic and reviewed click markers and coda regions. Matched clicks are connected; unmatched automatic and reviewed annotations use separate colors."></canvas>
      <div class="evaluation-legend" aria-label="Evaluation legend"><span class="eval-match">Matched pair</span><span class="eval-auto">Unmatched automatic</span><span class="eval-review">Unmatched review set</span><span>Automatic and reviewed codas appear on separate rows</span></div>
      <div class="evaluation-summary" aria-live="polite">${summary.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p>Using coda IoU ≥ ${evaluation.codaMatchIntersectionOverUnionThreshold.toFixed(2)}, ${evaluation.codas.matchedCount} of ${evaluation.codas.reviewedCount} reviewed coda${evaluation.codas.reviewedCount === 1 ? "" : "s"} matched an automatic coda.</p></div>
      <div class="evaluation-metrics">
        <article><h3>Click comparison</h3><dl><dt>Automatic clicks</dt><dd>${evaluation.clicks.automaticCount}</dd><dt>Reviewed clicks</dt><dd>${evaluation.clicks.reviewedCount}</dd><dt>Matched clicks</dt><dd>${evaluation.clicks.matchedCount}</dd><dt>Unmatched automatic</dt><dd>${evaluation.clicks.unmatchedAutomaticCount}</dd><dt>Unmatched reviewed</dt><dd>${evaluation.clicks.unmatchedReviewedCount}</dd><dt>Precision</dt><dd>${percent(evaluation.clicks.precision)}</dd><dt>Recall</dt><dd>${percent(evaluation.clicks.recall)}</dd><dt>F1 score</dt><dd>${evaluation.clicks.f1Score?.toFixed(3) ?? "—"}</dd></dl></article>
        <article><h3>Click timing error</h3><dl><dt>Mean absolute error</dt><dd>${error(evaluation.clicks.meanAbsoluteTimingErrorSeconds)}</dd><dt>Median absolute error</dt><dd>${error(evaluation.clicks.medianAbsoluteTimingErrorSeconds)}</dd><dt>Maximum error</dt><dd>${error(evaluation.clicks.maximumTimingErrorSeconds)}</dd></dl></article>
        <article><h3>Coda comparison</h3><dl><dt>Automatic codas</dt><dd>${evaluation.codas.automaticCount}</dd><dt>Reviewed codas</dt><dd>${evaluation.codas.reviewedCount}</dd><dt>Matched codas</dt><dd>${evaluation.codas.matchedCount}</dd><dt>Possible split errors</dt><dd>${evaluation.codas.possibleSplitErrorCount}</dd><dt>Possible merge errors</dt><dd>${evaluation.codas.possibleMergeErrorCount}</dd><dt>Unmatched automatic</dt><dd>${evaluation.codas.unmatchedAutomaticCount}</dd><dt>Unmatched reviewed</dt><dd>${evaluation.codas.unmatchedReviewedCount}</dd></dl></article>
        <article><h3>Coda boundary comparison</h3><dl><dt>Mean start error</dt><dd>${error(evaluation.codas.meanAbsoluteBoundaryStartErrorSeconds)}</dd><dt>Mean end error</dt><dd>${error(evaluation.codas.meanAbsoluteBoundaryEndErrorSeconds)}</dd><dt>Mean region IoU</dt><dd>${evaluation.codas.meanIntersectionOverUnion?.toFixed(3) ?? "—"}</dd></dl></article>
      </div>
      <details class="evaluation-method"><summary>Matching algorithm and thresholds</summary><p>Clicks are sorted by time and matched with an order-preserving dynamic program. It first maximizes the number of one-to-one pairs within the selected tolerance, then minimizes total absolute timing error. Precision uses matched ÷ automatic; recall uses matched ÷ reviewed.</p><p>Codas are paired one-to-one when temporal intersection-over-union is at least ${evaluation.codaMatchIntersectionOverUnionThreshold.toFixed(2)}. The alignment maximizes the number of matches, then total IoU. A possible split error means one automatic region overlaps multiple reviewed regions; a possible merge error means multiple automatic regions overlap one reviewed region. These are review heuristics, not validated error labels.</p></details>
      <div class="evaluation-downloads"><button type="button" data-evaluation-export="json">Download evaluation JSON</button><button type="button" data-evaluation-export="csv">Download evaluation CSV</button><span data-evaluation-export-status aria-live="polite"></span></div>
    </section>`;
  }

  private exportInput(exportedAt: string): ResearchExportInput {
    return {
      response: this.response,
      automatic: this.automatic,
      reviewed: this.document,
      originalFilename: this.file.name,
      exportedAt,
    };
  }

  private downloadExport(kind: keyof ResearchExportSet): void {
    const status = this.container.querySelector<HTMLElement>("[data-export-status]");
    try {
      const file = buildResearchExports(this.exportInput(new Date().toISOString()))[kind];
      const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.hidden = true;
      this.container.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (status) status.textContent = `${file.filename} was generated locally.`;
    } catch {
      if (status) status.textContent = "Export could not be generated because valid analyzed data is unavailable.";
    }
  }

  private downloadEvaluation(kind: "json" | "csv"): void {
    const status = this.container.querySelector<HTMLElement>("[data-evaluation-export-status]");
    try {
      const evaluation = evaluateAnnotations(this.automatic, this.document, this.evaluationToleranceSeconds);
      const file = buildEvaluationExports({ audioSha256: this.audioSha256, evaluationTimestamp: new Date().toISOString(), evaluation })[kind];
      const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.hidden = true;
      this.container.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (status) status.textContent = `${file.filename} was generated locally.`;
    } catch {
      if (status) status.textContent = "The evaluation export could not be generated.";
    }
  }

  private bindCanvas(): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>(".research-canvas")!;
    const atTime = (event: PointerEvent): number => {
      const bounds = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(this.document.durationSeconds, (event.clientX - bounds.left) / bounds.width * this.document.durationSeconds));
    };
    const closestClick = (time: number): string | null => {
      const tolerance = this.document.durationSeconds * 10 / Math.max(1, canvas.clientWidth);
      const click = this.document.clicks.reduce<ResearchDocument["clicks"][number] | null>((best, candidate) => Math.abs(candidate.timeSeconds - time) < Math.abs((best?.timeSeconds ?? Number.POSITIVE_INFINITY) - time) ? candidate : best, null);
      return click && Math.abs(click.timeSeconds - time) <= tolerance ? click.id : null;
    };
    canvas.onpointerdown = (event) => {
      const time = atTime(event);
      if (this.tool === "add") { const next = addClick(this.document, time); this.selectedClickId = next.clicks.find((click) => click.source === "human_corrected" && Math.abs(click.timeSeconds - time) < 0.00001)?.id ?? null; this.persist(next); return; }
      const coda = this.document.codas.find((item) => time >= item.startSeconds && time <= item.endSeconds);
      if (this.tool === "split") { if (coda) { this.selectedCodaId = coda.id; this.persist(splitCoda(this.document, coda.id, time)); } return; }
      const clickId = closestClick(time);
      if (clickId) {
        this.selectedClickId = clickId;
        this.selectedCodaId = this.document.clicks.find((click) => click.id === clickId)?.codaId ?? this.selectedCodaId;
        this.drag = { type: "click", id: clickId };
        canvas.setPointerCapture(event.pointerId);
        this.drawVisualization();
        return;
      }
      const boundaryTolerance = this.document.durationSeconds * 9 / Math.max(1, canvas.clientWidth);
      const boundary = this.document.codas.flatMap((item) => [
        { distance: Math.abs(item.startSeconds - time), drag: { type: "coda-start" as const, id: item.id } },
        { distance: Math.abs(item.endSeconds - time), drag: { type: "coda-end" as const, id: item.id } },
      ]).sort((a, b) => a.distance - b.distance)[0];
      if (boundary && boundary.distance <= boundaryTolerance) {
        this.selectedCodaId = boundary.drag.id;
        this.drag = boundary.drag;
        canvas.setPointerCapture(event.pointerId);
      } else if (coda) {
        this.selectedCodaId = coda.id;
        this.selectedClickId = null;
        this.render();
      } else {
        this.audio.currentTime = this.response.uploaded_recording.trim_start_seconds + time;
        this.drawVisualization();
      }
    };
    canvas.onpointermove = (event) => {
      if (!this.drag) return;
      const time = atTime(event);
      if (this.drag.type === "click") this.document = moveClick(this.document, this.drag.id, time);
      else {
        const coda = this.document.codas.find((item) => item.id === this.drag!.id);
        if (coda) this.document = this.drag.type === "coda-start"
          ? resizeCoda(this.document, coda.id, Math.min(time, coda.endSeconds), coda.endSeconds)
          : resizeCoda(this.document, coda.id, coda.startSeconds, Math.max(time, coda.startSeconds));
      }
      this.drawVisualization();
      this.drawEvaluation(evaluateAnnotations(this.automatic, this.document, this.evaluationToleranceSeconds));
    };
    canvas.onpointerup = () => { if (this.drag) { this.drag = null; this.persist(this.document); } };
    canvas.onkeydown = (event) => {
      if (!this.selectedClickId) return;
      const click = this.document.clicks.find((item) => item.id === this.selectedClickId);
      if (!click) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const amount = event.shiftKey ? 0.01 : 0.001;
        this.persist(moveClick(this.document, click.id, click.timeSeconds + (event.key === "ArrowLeft" ? -amount : amount)));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault(); this.selectedClickId = null; this.persist(deleteClick(this.document, click.id));
      }
    };
  }

  private drawVisualization(): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>(".research-canvas");
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;
    const waveformTop = 44;
    const waveformHeight = 145;
    const spectrogramTop = 216;
    const spectrogramHeight = 235;
    const regionTop = 468;
    const regionHeight = 34;
    const x = (time: number): number => time / Math.max(0.001, this.document.durationSeconds) * width;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#031018";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#87aaa5";
    context.font = "600 14px sans-serif";
    context.fillText("WAVEFORM", 18, 26);
    context.fillText("SPECTROGRAM", 18, 208);
    context.fillText("CODA REGIONS", 18, 491);

    if (this.audioData) {
      const { samples, spectrogram } = this.audioData;
      context.strokeStyle = "#78d9ca";
      context.lineWidth = 1.5;
      context.beginPath();
      const samplesPerPixel = Math.max(1, Math.floor(samples.length / width));
      for (let pixel = 0; pixel < width; pixel += 1) {
        let minimum = 1;
        let maximum = -1;
        const start = pixel * samplesPerPixel;
        for (let sample = start; sample < Math.min(samples.length, start + samplesPerPixel); sample += 1) {
          minimum = Math.min(minimum, samples[sample]);
          maximum = Math.max(maximum, samples[sample]);
        }
        const middle = waveformTop + waveformHeight / 2;
        context.moveTo(pixel, middle - maximum * waveformHeight * 0.46);
        context.lineTo(pixel, middle - minimum * waveformHeight * 0.46);
      }
      context.stroke();
      if (spectrogram.length) {
        const bins = spectrogram[0].length;
        const image = context.createImageData(spectrogram.length, bins);
        spectrogram.forEach((frame, column) => frame.forEach((value, bin) => {
          const [red, green, blue] = colorFor(value);
          const offset = ((bins - 1 - bin) * spectrogram.length + column) * 4;
          image.data[offset] = red; image.data[offset + 1] = green; image.data[offset + 2] = blue; image.data[offset + 3] = 255;
        }));
        const buffer = document.createElement("canvas");
        buffer.width = spectrogram.length; buffer.height = bins;
        buffer.getContext("2d")!.putImageData(image, 0, 0);
        context.imageSmoothingEnabled = true;
        context.drawImage(buffer, 0, spectrogramTop, width, spectrogramHeight);
      }
    } else {
      context.fillStyle = "#5f7d79";
      context.font = "15px sans-serif";
      context.fillText("Decoding locally…", width / 2 - 55, waveformTop + waveformHeight / 2);
    }

    this.document.codas.forEach((coda, index) => {
      const left = x(coda.startSeconds);
      const right = x(coda.endSeconds);
      const isSelected = coda.id === this.selectedCodaId;
      context.fillStyle = coda.status === "uncertain" ? "#e6b76c33" : coda.status === "rejected" ? "#d56c6830" : coda.source === "human_corrected" ? "#d8976230" : "#55cdbd22";
      context.fillRect(left, waveformTop, Math.max(2, right - left), spectrogramTop + spectrogramHeight - waveformTop);
      context.fillStyle = isSelected ? "#d7f6ef" : "#8eb5b0";
      context.fillRect(left, regionTop, Math.max(2, right - left), regionHeight);
      context.fillStyle = "#062027";
      context.font = "600 13px sans-serif";
      context.fillText(`C${index + 1}`, left + 7, regionTop + 22);
      context.fillStyle = coda.source === "human_corrected" ? "#e3a66f" : "#69d8c6";
      context.fillRect(left - 2, regionTop - 5, 4, regionHeight + 10);
      context.fillRect(right - 2, regionTop - 5, 4, regionHeight + 10);
    });

    this.document.clicks.forEach((click) => {
      const markerX = x(click.timeSeconds);
      context.save();
      context.strokeStyle = click.status === "uncertain" ? "#f2c978" : click.status === "rejected" ? "#dc7976" : click.source === "human_corrected" ? "#e4a16b" : "#7de1d2";
      context.lineWidth = click.id === this.selectedClickId ? 4 : 2;
      if (click.status === "uncertain") context.setLineDash([7, 5]);
      context.beginPath(); context.moveTo(markerX, waveformTop); context.lineTo(markerX, spectrogramTop + spectrogramHeight); context.stroke();
      context.restore();
    });
    const analyzedTime = this.audio.currentTime - this.response.uploaded_recording.trim_start_seconds;
    if (analyzedTime >= 0 && analyzedTime <= this.document.durationSeconds) {
      context.strokeStyle = "#ffffff"; context.lineWidth = 1; context.beginPath(); context.moveTo(x(analyzedTime), 0); context.lineTo(x(analyzedTime), regionTop - 5); context.stroke();
    }
  }

  private drawEvaluation(evaluation: AnnotationEvaluation): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>(".evaluation-canvas");
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    const width = canvas.width;
    const duration = Math.max(0.001, this.document.durationSeconds);
    const position = (time: number): number => 105 + time / duration * (width - 130);
    const automaticMatched = new Map(evaluation.clicks.matches.map((match) => [match.automaticId, match]));
    const reviewedMatched = new Set(evaluation.clicks.matches.map((match) => match.reviewedId));
    const matchedAutomaticCodas = new Set(evaluation.codas.matches.map((match) => match.automaticId));
    const matchedReviewedCodas = new Set(evaluation.codas.matches.map((match) => match.reviewedId));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#031018";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "600 13px sans-serif";
    context.fillStyle = "#87a9a4";
    context.fillText("AUTO CLICKS", 12, 48);
    context.fillText("REVIEW SET", 12, 108);
    context.fillText("AUTO CODAS", 12, 196);
    context.fillText("REVIEW CODAS", 12, 246);
    context.strokeStyle = "#315057";
    context.lineWidth = 1;
    [60, 120, 205, 255].forEach((y) => { context.beginPath(); context.moveTo(105, y); context.lineTo(width - 25, y); context.stroke(); });

    evaluation.clicks.matches.forEach((match) => {
      context.strokeStyle = "#5ed9c5aa";
      context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(position(match.automaticTimeSeconds), 60); context.lineTo(position(match.reviewedTimeSeconds), 120); context.stroke();
    });
    this.automatic.clicks.forEach((click) => {
      context.strokeStyle = automaticMatched.has(click.id) ? "#72decd" : "#db7773";
      context.lineWidth = 3;
      context.beginPath(); context.moveTo(position(click.timeSeconds), 45); context.lineTo(position(click.timeSeconds), 74); context.stroke();
    });
    this.document.clicks.filter((click) => click.status !== "rejected").forEach((click) => {
      context.strokeStyle = reviewedMatched.has(click.id) ? "#72decd" : "#e6ad67";
      context.lineWidth = 3;
      context.beginPath(); context.moveTo(position(click.timeSeconds), 105); context.lineTo(position(click.timeSeconds), 134); context.stroke();
    });

    this.automatic.codas.forEach((coda) => {
      context.fillStyle = matchedAutomaticCodas.has(coda.id) ? "#3fae9b99" : "#b75d5a99";
      context.fillRect(position(coda.startSeconds), 188, Math.max(2, position(coda.endSeconds) - position(coda.startSeconds)), 25);
    });
    this.document.codas.filter((coda) => coda.status !== "rejected").forEach((coda) => {
      context.fillStyle = matchedReviewedCodas.has(coda.id) ? "#3fae9b99" : "#c98d4eaa";
      context.fillRect(position(coda.startSeconds), 238, Math.max(2, position(coda.endSeconds) - position(coda.startSeconds)), 25);
    });
    context.fillStyle = "#72918d";
    context.font = "10px ui-monospace, monospace";
    context.fillText("0 s", 105, 281);
    const endLabel = `${duration.toFixed(3)} s`;
    context.fillText(endLabel, width - 25 - context.measureText(endLabel).width, 281);
  }
}
