export type RecordingState = "idle" | "requesting" | "recording" | "stopped" | "cancelled" | "error";
export type RecordingEvent = "request" | "permission-granted" | "stop" | "cancel" | "fail" | "reset";

export function transitionRecordingState(state: RecordingState, event: RecordingEvent): RecordingState {
  const transitions: Partial<Record<RecordingState, Partial<Record<RecordingEvent, RecordingState>>>> = {
    idle: { request: "requesting" }, requesting: { "permission-granted": "recording", cancel: "cancelled", fail: "error" },
    recording: { stop: "stopped", cancel: "cancelled", fail: "error" },
    stopped: { reset: "idle" }, cancelled: { reset: "idle" }, error: { reset: "idle" },
  };
  const next = transitions[state]?.[event];
  if (!next) throw new Error(`Invalid recording transition: ${state} -> ${event}`);
  return next;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be a positive integer.");
  const buffer = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => { const clamped = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + index * 2, clamped < 0 ? clamped * 32768 : clamped * 32767, true); });
  return new Uint8Array(buffer);
}

export class MicrophoneRecorder {
  state: RecordingState = "idle";
  private context?: AudioContext; private stream?: MediaStream; private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode; private processor?: ScriptProcessorNode; private chunks: Float32Array[] = [];
  private startedAt = 0; private cancelled = false;

  async start(): Promise<void> {
    this.state = transitionRecordingState(this.state, "request"); this.cancelled = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone recording is unavailable in this browser.");
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (this.cancelled) { this.stream.getTracks().forEach((track) => track.stop()); throw new DOMException("Recording cancelled", "AbortError"); }
      this.context = new AudioContext(); await this.context.resume(); this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = .7;
      this.processor = this.context.createScriptProcessor(4096, 1, 1); this.processor.onaudioprocess = (event) => this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      this.source.connect(this.analyser); this.analyser.connect(this.processor); this.processor.connect(this.context.destination);
      this.startedAt = performance.now(); this.state = transitionRecordingState(this.state, "permission-granted");
    } catch (error) { if (this.state === "requesting") this.state = transitionRecordingState(this.state, "fail"); await this.cleanup(); throw error; }
  }

  elapsedSeconds(): number { return this.state === "recording" ? (performance.now() - this.startedAt) / 1000 : 0; }
  levels(): Uint8Array { const values = new Uint8Array(this.analyser?.frequencyBinCount || 0); this.analyser?.getByteTimeDomainData(values); return values; }

  async stop(): Promise<{ file: File; durationSeconds: number }> {
    if (this.state !== "recording" || !this.context) throw new Error("No microphone recording is active.");
    this.state = transitionRecordingState(this.state, "stop"); const sampleRate = this.context.sampleRate;
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0); const samples = new Float32Array(length); let offset = 0;
    this.chunks.forEach((chunk) => { samples.set(chunk, offset); offset += chunk.length; }); await this.cleanup();
    if (!samples.length) throw new Error("The microphone recording was empty.");
    const durationSeconds = samples.length / sampleRate; const wav = encodePcm16Wav(samples, sampleRate);
    return { file: new File([wav.buffer as ArrayBuffer], `live-whale-${Date.now()}.wav`, { type: "audio/wav" }), durationSeconds };
  }

  async cancel(): Promise<void> { this.cancelled = true; if (this.state === "requesting" || this.state === "recording") this.state = transitionRecordingState(this.state, "cancel"); await this.cleanup(); }
  private async cleanup(): Promise<void> { this.processor?.disconnect(); this.analyser?.disconnect(); this.source?.disconnect(); this.stream?.getTracks().forEach((track) => track.stop()); if (this.context && this.context.state !== "closed") await this.context.close(); this.processor = undefined; this.analyser = undefined; this.source = undefined; this.stream = undefined; this.context = undefined; this.chunks = []; }
}
