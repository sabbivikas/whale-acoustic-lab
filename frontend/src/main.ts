import "./styles.css";
import "./passport.css";
import "./research.css";
import "./corpus.css";
import "./home-ocean.css";
import { analyzeAudio, collapseEmbedding, sha256, type AnalyzeResponse } from "./api";
import { deriveParameters } from "./art/parameters";
import { OceanRenderer } from "./art/canvas";
import { callStory, friendlyAnalysisError, HOME_ACTIONS, LOADING_STEPS, SAMPLE_RECORDING } from "./experience";
import { MicrophoneRecorder } from "./recorder";
import { ResearchWorkspace } from "./research-workspace";
import { CorpusWorkspace } from "./corpus-workspace";
import { mountLazyHomeOcean } from "./home-ocean-loader";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="shell" id="top">
  <header class="site-header">
    <button class="brand reset-home" type="button"><span class="mark">〰</span>WHALE ACOUSTIC LAB</button>
    <nav id="result-nav" class="result-nav hidden" aria-label="Analysis views">
      <button data-target="call-story" class="active">Call Story</button>
      <button data-target="science">Science</button>
      <button data-target="research">Research Mode</button>
      <button data-target="art-view">Art View</button>
    </nav>
    <div class="header-actions"><button id="corpus-nav-button" class="corpus-nav-button" type="button">Corpus Explorer</button><span class="eyebrow">EVIDENCE-GROUNDED · CETI WHAM</span></div>
  </header>

  <section id="home" class="home-experience">
    <div id="home-ocean" class="home-ocean" data-scene-state="idle" aria-hidden="true">
      <canvas id="home-ocean-canvas"></canvas>
      <div class="home-ocean-fallback">
        <span class="fallback-ray ray-one"></span><span class="fallback-ray ray-two"></span>
        <svg viewBox="0 0 960 520" role="presentation">
          <path class="fallback-whale-body" d="M176 243C183 178 252 138 374 137c153-2 280 48 350 119 47 47 84 61 137 67-46 12-81 32-119 66-69-36-161-54-273-51-135 4-245-17-312-67-31-23-55-31-81-28Z"/>
          <path class="fallback-whale-head" d="M174 239c-4-63 22-108 75-132 48-21 114-15 146 13 22 20 21 78 9 132-13 54-55 83-117 67-68-18-109-39-113-80Z"/>
          <path class="fallback-whale-jaw" d="M178 268c52 20 121 31 205 31-29 25-85 30-151 5-31-12-49-24-54-36Z"/>
          <path class="fallback-fin" d="M415 302c30 8 69 34 95 75-40-13-73-23-107-39Z"/>
          <path class="fallback-fluke" d="M728 260c59-25 117-24 165 14-46 8-80 29-110 58-17-34-35-56-55-72Zm12 50c58 10 104 37 138 79-48-12-94-5-132 15 10-36 8-67-6-94Z"/>
          <circle class="fallback-eye" cx="284" cy="225" r="4"/>
          <path class="fallback-scar" d="M430 210c38-20 72-17 104 4M510 276c28-8 55-5 82 7"/>
        </svg>
      </div>
      <div class="ocean-depth"></div>
    </div>
    <div class="home-copy">
      <p class="kicker">A closer listen below the surface</p>
      <h1>Explore the rhythm inside a sperm-whale call.</h1>
      <p class="lede">Upload, record, or try a public sample. Whale Acoustic Lab measures click timing, separates probable codas, and compares acoustic structure with published research.</p>
      <p class="science-promise"><strong>Scientific boundary:</strong> this app analyzes acoustic structure. It does not literally translate whale language.</p>
    </div>
    <div class="capture-stage">
      <input id="file" type="file" accept=".wav,audio/wav" hidden>
      <div id="capture-options" class="capture-grid">
        ${HOME_ACTIONS.map((action) => `<button id="${action.id}" class="capture-card ${action.className}" type="button"><span class="capture-icon ${action.id === "live-option" ? "live-icon" : ""}">${action.icon}</span><strong>${action.title}</strong><small>${action.description}</small></button>`).join("")}
        <p class="sample-attribution"><strong>Public sample:</strong> ${SAMPLE_RECORDING.source} · ${SAMPLE_RECORDING.license}<br>${SAMPLE_RECORDING.location} · collected ${SAMPLE_RECORDING.collectionPeriod}</p>
      </div>
      <div id="live-recorder" class="live-recorder hidden">
        <span class="kicker">Live microphone</span><h2>Play a whale recording near your microphone.</h2>
        <p>Recording stays in this session and is submitted only when you stop.</p>
        <canvas id="live-waveform"></canvas><strong id="recording-time">00:00.0 / 00:20.0</strong>
        <div><button id="stop-recording" class="primary">Stop & analyze</button><button id="cancel-recording">Cancel</button></div>
      </div>
      <div id="loading" class="analysis-loading hidden" aria-live="polite">
        <span class="spinner"></span><span class="kicker">Analyzing this recording</span>
        <h2 id="loading-status">Preparing the recording</h2>
        <ol id="loading-steps"></ol>
        <p>The first analysis can take longer while the WhAM model starts.</p>
      </div>
      <div id="error" class="error-panel hidden" role="alert"><strong>Analysis couldn’t finish</strong><p id="error-message"></p><div><button id="retry-analysis">Try again</button><button class="reset-home">Choose another recording</button></div></div>
    </div>
  </section>

  <section id="results" class="results hidden" aria-live="polite">
    <div class="result-toolbar"><div><span id="filename">Whale recording</span><small id="meta">Analysis complete</small></div><audio id="source-audio" controls></audio><button id="analyze-another">Analyze another call</button></div>
    <div id="passport"></div>
    <section id="research-view" class="research-view hidden" aria-label="Research annotation workspace"></section>
  </section>

  <section id="art-view" class="art-view hidden">
    <div class="section-heading"><span class="kicker">Deterministic acoustic artwork</span><h2>The call, mapped into motion</h2><p>The colors, shapes, positions, textures, and motion are deterministically mapped from the WhAM acoustic fingerprint. The artwork is an expressive visualization, not a scientific translation.</p></div>
    <div class="art-frame"><canvas id="art"></canvas></div>
    <div class="art-actions"><button id="replay">↺ Replay</button><button id="pause">Ⅱ Pause</button><button id="download" class="primary">↓ Download PNG</button><button class="return-story">Return to Call Story</button></div>
  </section>

  <section id="corpus-view" class="corpus-view hidden" aria-label="Browser-only corpus explorer"></section>

  <footer><span>Powered by Project CETI’s WhAM model</span><span>Acoustic structure · Not semantic translation</span></footer>
</main>`;

const get = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const home = get<HTMLElement>("#home"), results = get<HTMLElement>("#results"), passport = get<HTMLElement>("#passport");
const artView = get<HTMLElement>("#art-view"), researchView = get<HTMLElement>("#research-view"), corpusView = get<HTMLElement>("#corpus-view"), resultNav = get<HTMLElement>("#result-nav"), loading = get<HTMLElement>("#loading");
const corpusNavButton = get<HTMLButtonElement>("#corpus-nav-button");
const homeOcean = mountLazyHomeOcean(get<HTMLElement>("#home-ocean"));
const captureOptions = get<HTMLElement>("#capture-options"), livePanel = get<HTMLElement>("#live-recorder");
const input = get<HTMLInputElement>("#file"), audio = get<HTMLAudioElement>("#source-audio");
const liveCanvas = get<HTMLCanvasElement>("#live-waveform"), recordingTime = get<HTMLElement>("#recording-time");
const pauseButton = get<HTMLButtonElement>("#pause"), errorPanel = get<HTMLElement>("#error");
let renderer: OceanRenderer | undefined, audioUrl: string | undefined, microphone: MicrophoneRecorder | undefined;
let researchWorkspace: ResearchWorkspace | undefined;
const corpusWorkspace = new CorpusWorkspace(corpusView);
let liveFrame = 0, liveLimitTimer = 0, loadingTimer = 0, lastFile: File | undefined;

const safe = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
const formatSeconds = (value: number) => `${value.toFixed(3)} s`;
const stopAllAudio = () => document.querySelectorAll<HTMLAudioElement>("audio").forEach(player => { player.pause(); player.currentTime = 0; });

async function waveformPeaks(file: File, bucketCount = 600): Promise<number[]> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    return Array.from({ length: bucketCount }, (_, bucket) => {
      const start = Math.floor(bucket * channel.length / bucketCount), end = Math.max(start + 1, Math.floor((bucket + 1) * channel.length / bucketCount));
      let peak = 0; for (let index = start; index < end; index++) peak = Math.max(peak, Math.abs(channel[index])); return peak;
    });
  } finally { void context.close(); }
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], onsets: number[], duration: number): void {
  canvas.width = 900; canvas.height = 150; const context = canvas.getContext("2d")!; context.clearRect(0, 0, 900, 150);
  context.strokeStyle = "#5acdbc"; context.lineWidth = 1; context.beginPath();
  peaks.forEach((peak, index) => { const x = index / Math.max(1, peaks.length - 1) * 900, height = peak * 63; context.moveTo(x, 75 - height); context.lineTo(x, 75 + height); }); context.stroke();
  context.strokeStyle = "#f4b77a"; context.fillStyle = "#f4b77a"; context.lineWidth = 2; context.font = "16px DM Sans";
  onsets.forEach((onset, index) => { const x = onset / Math.max(duration, .001) * 900; context.beginPath(); context.moveTo(x, 8); context.lineTo(x, 142); context.stroke(); context.fillText(String(index + 1), x + 4, 20); });
}

function storyTimeline(response: AnalyzeResponse): HTMLElement {
  const timeline = document.createElement("div"); timeline.className = "story-timeline";
  const duration = Math.max(response.call_structure.recording_duration_seconds, .001);
  response.coda_sequence.segments.forEach((segment, index) => {
    const marker = document.createElement("button"); marker.type = "button"; marker.style.left = `${segment.start_time_seconds / duration * 100}%`; marker.style.width = `${Math.max(2, (segment.end_time_seconds - segment.start_time_seconds) / duration * 100)}%`;
    marker.innerHTML = `<span>Coda ${index + 1}</span>`; marker.onclick = () => document.querySelector<HTMLElement>(`[data-coda-card="${index}"]`)?.click(); timeline.append(marker);
  });
  if (!response.coda_sequence.segments.length) timeline.innerHTML = "<p>No accepted coda segments to place on the timeline.</p>";
  return timeline;
}

function renderCallStory(response: AnalyzeResponse): HTMLElement {
  const story = callStory(response), section = document.createElement("section"); section.id = "call-story"; section.className = "call-story product-section";
  section.innerHTML = `<div class="evidence-category measured">Measured from this recording</div><div class="story-heading"><div><span class="kicker">Your whale call story</span><h2>${safe(story.headline)}</h2><p>${safe(story.explanation)}</p></div><aside><strong>What is a coda?</strong><p>A coda is a rhythmic group of clicks sperm whales use while communicating.</p></aside></div><div class="story-metrics"><span><b>${story.codaCount}</b><small>probable codas</small></span><span><b>${story.unassignedClicks}</b><small>unassigned clicks</small></span><span><b>${story.originalDuration}</b><small>original duration</small></span><span><b>${story.analyzedDuration}</b><small>analyzed duration</small></span></div><h3 class="timeline-title">Where the probable codas occur</h3>`;
  section.append(storyTimeline(response)); return section;
}

function renderNarration(response: AnalyzeResponse): HTMLElement {
  const narration = response.ai_evidence_narration, content = narration.content, section = document.createElement("section"); section.id = "ai-narration"; section.className = "narration product-section";
  const status = narration.status === "generated" ? "Generated once from calculated evidence" : narration.status === "cache_hit" ? "Validated cached narration" : "Deterministic explanation · OpenAI unavailable or invalid";
  section.innerHTML = `<div class="evidence-category ai">AI-generated interpretation</div><div class="section-heading"><span class="kicker">AI evidence narration</span><h2>${safe(content.headline)}</h2><span class="narration-status">${safe(status)}</span><p>${safe(content.sequence_explanation)}</p></div><div class="narration-grid"><div><h3>Why it is interesting</h3><p>${safe(content.why_it_is_interesting)}</p><ul>${content.evidence_points.map(point => `<li>${safe(point)}</li>`).join("")}</ul></div><blockquote><small>Creative rhythm analogy · not literal meaning</small>${safe(content.creative_analogy)}</blockquote></div><p class="uncertainty"><strong>What remains unknown:</strong> ${safe(content.uncertainty)}</p>`;
  return section;
}

function playSegment(response: AnalyzeResponse, start: number, end: number): void {
  audio.currentTime = Math.max(0, response.uploaded_recording.trim_start_seconds + start - .08);
  const playbackEnd = Math.min(response.uploaded_recording.original_duration_seconds, response.uploaded_recording.trim_start_seconds + end + .2);
  audio.ontimeupdate = () => { if (audio.currentTime >= playbackEnd) { audio.pause(); audio.ontimeupdate = null; } }; void audio.play();
}

function renderCodaExplorer(response: AnalyzeResponse): HTMLElement {
  const section = document.createElement("section"); section.id = "coda-timeline"; section.className = "coda-explorer product-section";
  section.innerHTML = `<div class="evidence-category published">Measured + compared with published data</div><div class="section-heading"><span class="kicker">Coda timeline</span><h2>Explore each rhythmic phrase</h2><p>Choose a coda to separate what was measured, what matched published EC1 data, and what remains a conversational-role hypothesis.</p></div>`;
  const cards = document.createElement("div"); cards.className = "coda-cards"; const detail = document.createElement("article"); detail.className = "coda-detail"; detail.id = "coda-interpretations";
  const select = (index: number) => {
    const segment = response.coda_sequence.segments[index], measured = segment.analysis.measured_rhythm, values = measured.measurements;
    const family = measured.nearest_published_family, role = segment.analysis.interpretation.interaction_hypothesis;
    cards.querySelectorAll("button").forEach((button, cardIndex) => button.classList.toggle("active", cardIndex === index));
    detail.innerHTML = `<div class="coda-detail-heading"><span>Coda ${index + 1} · ${segment.start_time_seconds.toFixed(2)}–${segment.end_time_seconds.toFixed(2)} seconds</span><h3>${safe(measured.headline)}</h3></div><div class="coda-facts"><div><small>Measured rhythm</small><dl><dt>Clicks</dt><dd>${values.click_count}</dd><dt>Duration</dt><dd>${formatSeconds(values.total_duration_seconds)}</dd><dt>Direction</dt><dd>${safe(values.timing_direction)}</dd><dt>Grouping</dt><dd>${safe(values.click_grouping)}</dd><dt>Tempo type</dt><dd>${segment.analysis.published_tempo_type ?? "—"}</dd></dl></div><div><small>Published-family comparison</small><p><strong>${safe(family?.name ?? "No same-count family")}</strong></p><p>${family?.match_strength === "accepted" ? "Accepted: within the calibrated reference range." : "Weak nearest family: outside the accepted reference range."}</p></div><div><small>Conversational-role hypothesis</small><p><strong>Possible role: ${safe(role.role)}</strong></p><p>${safe(role.evidence_level)}. ${safe(role.explanation)}</p><p>Literal meaning remains unknown.</p></div></div><aside class="rhythm-analogy"><small>${safe(measured.creative_analogy.label)}</small><p>${safe(measured.creative_analogy.text)}</p></aside>`;
    const play = document.createElement("button"); play.className = "play-coda"; play.textContent = "▶ Play this coda"; play.onclick = () => playSegment(response, segment.start_time_seconds, segment.end_time_seconds); detail.append(play);
  };
  response.coda_sequence.segments.forEach((segment, index) => {
    const measured = segment.analysis.measured_rhythm, values = measured.measurements, family = measured.nearest_published_family;
    const card = document.createElement("button"); card.type = "button"; card.className = "coda-card"; card.dataset.codaCard = String(index);
    card.innerHTML = `<span>CODA ${String(index + 1).padStart(2, "0")}</span><strong>${safe(measured.headline)}</strong><small>${segment.start_time_seconds.toFixed(2)}–${segment.end_time_seconds.toFixed(2)}s · ${values.click_count} clicks</small><small>${safe(values.timing_direction)} · ${safe(values.click_grouping)}</small><i>${family?.match_strength === "accepted" ? "accepted" : "weak"} ${safe(family?.name ?? "family match")}</i>`;
    card.onclick = () => select(index); cards.append(card);
  });
  if (response.coda_sequence.segments.length) select(0); else detail.innerHTML = `<h3>No accepted coda interpretations</h3><p>The estimator found ${response.coda_sequence.rejected_click_count} unassigned click${response.coda_sequence.rejected_click_count === 1 ? "" : "s"}, but no group met the published three-to-ten-click scope. Try a clearer recording or review the measured waveform in Explore the science.</p>`;
  section.append(cards, detail); return section;
}

function renderNeighbors(response: AnalyzeResponse): HTMLElement {
  const section = document.createElement("section"); section.id = "acoustic-neighbors"; section.className = "neighbors product-section";
  section.innerHTML = `<div class="evidence-category published">Compared with published data</div><div class="section-heading"><span class="kicker">Listen to acoustic neighbors</span><h2>Nearby recordings in WhAM model space</h2><p>These are public recordings whose WhAM acoustic fingerprints are closest to your recording. Similarity does not prove shared meaning, identity, or intent.</p></div>`;
  const list = document.createElement("div"); list.className = "neighbor-grid";
  response.matches.forEach((match, index) => { const card = document.createElement("article"); card.innerHTML = `<span class="rank">${String(index + 1).padStart(2, "0")}</span><h3>${safe(match.reference_id)}</h3><p>${safe(match.original_dswp_filename)} · ${match.duration_seconds.toFixed(2)} seconds</p><dl><dt>Raw similarity</dt><dd>${match.raw_cosine_similarity.toFixed(6)}</dd><dt>Reference percentile</dt><dd>${match.reference_percentile.toFixed(1)}%</dd></dl>`; const player = document.createElement("audio"); player.controls = true; player.preload = "none"; player.src = match.source_url; player.setAttribute("aria-label", `Play reference ${index + 1}`); const source = document.createElement("a"); source.href = match.source_url; source.target = "_blank"; source.rel = "noreferrer"; source.textContent = `Source · ${match.license}`; card.append(player, source); list.append(card); });
  section.append(list); return section;
}

function renderScience(response: AnalyzeResponse, peaks: number[]): HTMLElement {
  const details = document.createElement("details"); details.id = "science"; details.className = "science product-section";
  details.innerHTML = `<summary><span><span class="kicker">Explore the science</span><strong>Measurements, matching, and limitations</strong></span><i>＋</i></summary><div class="science-body"><div class="term-grid"><article><h3>Estimated clicks</h3><p>Short high-energy events detected from this waveform. They are estimates, not hand-annotated ground truth.</p></article><article><h3>ICI</h3><p>Inter-click interval: the measured time between neighboring estimated clicks.</p></article><article><h3>Coefficient of variation</h3><p>How much the intervals vary relative to their average. Lower values describe more regular timing.</p></article><article><h3>MSE</h3><p>Mean squared error: the distance between this normalized rhythm and a published family’s average pattern. It is not confidence.</p></article><article><h3>Reference percentile</h3><p>Where a similarity score falls among public reference-to-reference comparisons. It is not a probability.</p></article><article><h3>WhAM fingerprint</h3><p>A 1,280-value model representation of acoustic structure, used for neighbors and deterministic art—not sent to GPT.</p></article></div></div>`;
  const body = details.querySelector<HTMLElement>(".science-body")!; const structure = document.createElement("section"); structure.className = "waveform-science";
  structure.innerHTML = `<h3>Measured waveform and click estimates</h3><p>${safe(response.uploaded_recording.trimming_applied ? `${response.uploaded_recording.original_duration_seconds.toFixed(2)} seconds recorded; ${response.uploaded_recording.analyzed_duration_seconds.toFixed(2)} seconds analyzed after surrounding silence was trimmed.` : "The complete recording was analyzed without trimming surrounding silence.")}</p>`;
  const canvas = document.createElement("canvas"); canvas.className = "measured-waveform"; drawWaveform(canvas, peaks, response.call_structure.estimated_click_onsets_seconds.map(value => value + response.uploaded_recording.trim_start_seconds), response.uploaded_recording.original_duration_seconds); structure.append(canvas);
  const intervals = document.createElement("p"); intervals.className = "technical-values"; intervals.textContent = response.call_structure.estimated_inter_click_intervals_seconds.length ? `Estimated ICIs: ${response.call_structure.estimated_inter_click_intervals_seconds.map(value => `${Math.round(value * 1000)} ms`).join(" · ")}` : "Not enough estimated clicks to calculate inter-click intervals."; structure.append(intervals); body.append(structure);
  return details;
}

function renderArtTeaser(): HTMLElement {
  const section = document.createElement("section"); section.className = "art-teaser product-section"; section.innerHTML = `<div><span class="kicker">Art View</span><h2>See the acoustic fingerprint become an artwork</h2><p>Every visual parameter comes deterministically from the WhAM fingerprint. It is expressive—not a translation.</p></div>`; const button = document.createElement("button"); button.textContent = "Open Art View →"; button.onclick = showArt; section.append(button); return section;
}

function renderSources(): HTMLElement {
  const section = document.createElement("section"); section.id = "sources"; section.className = "sources product-section";
  section.innerHTML = `<div class="section-heading"><span class="kicker">Sources and scientific limitations</span><h2>What supports this experience</h2></div><p class="limits-callout">Scientists have not translated sperm-whale language. This app analyzes acoustic structure and presents evidence-grounded hypotheses and creative analogies.</p><ul><li><a href="https://github.com/Project-CETI/wham" target="_blank" rel="noreferrer">Project CETI WhAM source</a> · MIT software license; model weights distributed separately</li><li><a href="https://huggingface.co/datasets/orrp/DSWP" target="_blank" rel="noreferrer">Dominica Sperm Whale Project public dataset</a> · CC BY 4.0</li><li><a href="https://www.nature.com/articles/s41467-024-47221-8" target="_blank" rel="noreferrer">Sharma et al., Nature Communications (2024)</a></li><li><a href="https://doi.org/10.5281/zenodo.10817697" target="_blank" rel="noreferrer">Zenodo EC1 data release</a> · CC BY 4.0</li></ul><button class="return-top">Return to top ↑</button>`;
  section.querySelector<HTMLButtonElement>(".return-top")!.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" }); return section;
}

function renderResults(response: AnalyzeResponse, peaks: number[]): void {
  passport.replaceChildren(renderCallStory(response), renderNarration(response), renderCodaExplorer(response), renderNeighbors(response), renderScience(response, peaks), renderArtTeaser(), renderSources());
}

function startLoading(): void {
  captureOptions.classList.add("hidden"); livePanel.classList.add("hidden"); errorPanel.classList.add("hidden"); loading.classList.remove("hidden");
  let index = 0; const list = get<HTMLOListElement>("#loading-steps"); list.replaceChildren(...LOADING_STEPS.map((step, stepIndex) => { const item = document.createElement("li"); item.textContent = step; item.classList.toggle("active", stepIndex === 0); return item; }));
  get("#loading-status").textContent = LOADING_STEPS[0]; window.clearInterval(loadingTimer); loadingTimer = window.setInterval(() => { index = Math.min(index + 1, LOADING_STEPS.length - 1); get("#loading-status").textContent = LOADING_STEPS[index]; list.querySelectorAll("li").forEach((item, itemIndex) => { item.classList.toggle("done", itemIndex < index); item.classList.toggle("active", itemIndex === index); }); }, 1600);
}

function stopLoading(): void { window.clearInterval(loadingTimer); loading.classList.add("hidden"); }

async function processFile(file: File): Promise<void> {
  lastFile = file;
  if (!file.name.toLowerCase().endsWith(".wav") || file.size > 25 * 1024 * 1024) { showError("This audio format isn’t supported. Choose a valid WAV file no larger than 25 MB."); return; }
  startLoading(); stopAllAudio(); if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = URL.createObjectURL(file); audio.src = audioUrl;
  try {
    const [seed, response, peaks] = await Promise.all([sha256(file), analyzeAudio(file), waveformPeaks(file)]);
    if (response.embedding_dimension !== 1280) throw new Error("The acoustic fingerprint had an unexpected shape.");
    const vector = collapseEmbedding(response.embedding, response.embedding_dimension); renderer?.pause(); renderer = new OceanRenderer(get<HTMLCanvasElement>("#art"), deriveParameters(vector, seed)); renderer.pause(); pauseButton.textContent = "▶ Play";
    renderResults(response, peaks); researchWorkspace?.destroy(); researchWorkspace = new ResearchWorkspace(researchView, response, file, seed, audio); get("#filename").textContent = file.name; get("#meta").textContent = `${response.coda_sequence.probable_coda_count} probable codas · ${response.processing_time_seconds.toFixed(1)} seconds processing`;
    home.classList.add("hidden"); results.classList.remove("hidden"); resultNav.classList.remove("hidden"); artView.classList.add("hidden"); window.scrollTo({ top: 0 });
  } catch (cause) { showError(friendlyAnalysisError(cause)); }
  finally { stopLoading(); }
}

function showError(message: string): void { stopLoading(); captureOptions.classList.add("hidden"); livePanel.classList.add("hidden"); errorPanel.classList.remove("hidden"); get("#error-message").textContent = message; }

async function analyzeSample(): Promise<void> {
  startLoading();
  try { const response = await fetch(SAMPLE_RECORDING.url); if (!response.ok) throw new Error("Sample unavailable"); const blob = await response.blob(); await processFile(new File([blob], SAMPLE_RECORDING.filename, { type: "audio/wav" })); }
  catch (cause) { showError(cause instanceof Error && cause.message === "Sample unavailable" ? "The public sample could not be loaded. Try uploading a WAV file instead." : friendlyAnalysisError(cause)); }
}

function showStory(): void { corpusView.classList.add("hidden"); corpusNavButton.classList.remove("active"); artView.classList.add("hidden"); results.classList.remove("hidden"); passport.classList.remove("hidden"); researchView.classList.add("hidden"); researchWorkspace?.stop(); renderer?.pause(); resultNav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.getAttribute("data-target") === "call-story")); document.querySelector("#call-story")?.scrollIntoView({ behavior: "smooth" }); }
function showScience(): void { showStory(); const science = get<HTMLDetailsElement>("#science"); science.open = true; science.scrollIntoView({ behavior: "smooth" }); resultNav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.getAttribute("data-target") === "science")); }
function showResearch(): void { corpusView.classList.add("hidden"); corpusNavButton.classList.remove("active"); artView.classList.add("hidden"); results.classList.remove("hidden"); passport.classList.add("hidden"); researchView.classList.remove("hidden"); renderer?.pause(); researchWorkspace?.start(); resultNav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.getAttribute("data-target") === "research")); window.scrollTo({ top: 0, behavior: "smooth" }); }
function showArt(): void { corpusView.classList.add("hidden"); corpusNavButton.classList.remove("active"); results.classList.add("hidden"); artView.classList.remove("hidden"); researchWorkspace?.stop(); renderer?.resume(); pauseButton.textContent = "Ⅱ Pause"; resultNav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.getAttribute("data-target") === "art-view")); window.scrollTo({ top: 0, behavior: "smooth" }); }
function showCorpus(): void { stopAllAudio(); renderer?.pause(); researchWorkspace?.stop(); home.classList.add("hidden"); results.classList.add("hidden"); artView.classList.add("hidden"); corpusView.classList.remove("hidden"); corpusNavButton.classList.add("active"); resultNav.querySelectorAll("button").forEach(button => button.classList.remove("active")); corpusWorkspace.show(); window.scrollTo({ top: 0, behavior: "smooth" }); }

async function resetExperience(): Promise<void> {
  stopAllAudio(); renderer?.pause(); researchWorkspace?.destroy(); researchWorkspace = undefined; window.clearInterval(loadingTimer); window.clearTimeout(liveLimitTimer); cancelAnimationFrame(liveFrame); if (microphone) await microphone.cancel(); microphone = undefined; if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = undefined; audio.removeAttribute("src"); audio.load(); input.value = ""; lastFile = undefined; passport.replaceChildren(); researchView.replaceChildren(); results.classList.add("hidden"); artView.classList.add("hidden"); corpusView.classList.add("hidden"); corpusNavButton.classList.remove("active"); resultNav.classList.add("hidden"); loading.classList.add("hidden"); livePanel.classList.add("hidden"); errorPanel.classList.add("hidden"); captureOptions.classList.remove("hidden"); home.classList.remove("hidden"); recordingTime.textContent = "00:00.0 / 00:20.0"; window.scrollTo({ top: 0, behavior: "smooth" });
}

function drawLiveInput(): void { if (!microphone || microphone.state !== "recording") return; const values = microphone.levels(), context = liveCanvas.getContext("2d")!; liveCanvas.width = 700; liveCanvas.height = 150; context.clearRect(0, 0, 700, 150); context.strokeStyle = "#66d9c7"; context.lineWidth = 2; context.beginPath(); values.forEach((value, index) => { const x = index / Math.max(1, values.length - 1) * 700, y = value / 255 * 150; index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.stroke(); const elapsed = Math.min(20, microphone.elapsedSeconds()); recordingTime.textContent = `00:${elapsed.toFixed(1).padStart(4, "0")} / 00:20.0`; liveFrame = requestAnimationFrame(drawLiveInput); }
async function startLive(): Promise<void> { captureOptions.classList.add("hidden"); livePanel.classList.remove("hidden"); errorPanel.classList.add("hidden"); microphone = new MicrophoneRecorder(); try { await microphone.start(); drawLiveInput(); liveLimitTimer = window.setTimeout(() => void finishLive(), 20_000); } catch (cause) { showError(friendlyAnalysisError(cause)); } }
async function finishLive(): Promise<void> { if (!microphone || microphone.state !== "recording") return; cancelAnimationFrame(liveFrame); window.clearTimeout(liveLimitTimer); try { const result = await microphone.stop(); microphone = undefined; if (result.durationSeconds < 1) throw new Error("recording shorter than one second"); await processFile(result.file); } catch (cause) { showError(friendlyAnalysisError(cause)); } }
async function cancelLive(): Promise<void> { if (microphone) await microphone.cancel(); microphone = undefined; livePanel.classList.add("hidden"); captureOptions.classList.remove("hidden"); }

get<HTMLButtonElement>("#sample-option").onclick = () => void analyzeSample(); get<HTMLButtonElement>("#upload-option").onclick = () => input.click(); get<HTMLButtonElement>("#live-option").onclick = () => void startLive();
get<HTMLButtonElement>("#stop-recording").onclick = () => void finishLive(); get<HTMLButtonElement>("#cancel-recording").onclick = () => void cancelLive(); input.onchange = () => { if (input.files?.[0]) void processFile(input.files[0]); };
get<HTMLButtonElement>("#retry-analysis").onclick = () => { if (lastFile) void processFile(lastFile); else void resetExperience(); }; get<HTMLButtonElement>("#analyze-another").onclick = () => void resetExperience(); document.querySelectorAll<HTMLButtonElement>(".reset-home").forEach(button => button.onclick = () => void resetExperience());
get<HTMLButtonElement>("#replay").onclick = () => { renderer?.replay(); pauseButton.textContent = "Ⅱ Pause"; }; pauseButton.onclick = () => { if (!renderer) return; renderer.isRunning() ? renderer.pause() : renderer.resume(); pauseButton.textContent = renderer.isRunning() ? "Ⅱ Pause" : "▶ Play"; }; get<HTMLButtonElement>("#download").onclick = () => renderer?.download(); get<HTMLButtonElement>(".return-story").onclick = showStory;
resultNav.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.onclick = () => button.dataset.target === "art-view" ? showArt() : button.dataset.target === "research" ? showResearch() : button.dataset.target === "science" ? showScience() : showStory());
corpusNavButton.onclick = showCorpus;
captureOptions.addEventListener("dragover", event => { event.preventDefault(); captureOptions.classList.add("dragging"); }); captureOptions.addEventListener("dragleave", () => captureOptions.classList.remove("dragging")); captureOptions.addEventListener("drop", event => { event.preventDefault(); captureOptions.classList.remove("dragging"); const file = event.dataTransfer?.files[0]; if (file) void processFile(file); });
window.addEventListener("beforeunload", () => { homeOcean.dispose(); stopAllAudio(); renderer?.pause(); researchWorkspace?.stop(); if (microphone) void microphone.cancel(); });
