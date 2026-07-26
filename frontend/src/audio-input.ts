import { encodePcm16Wav } from "./recorder";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_ANALYSIS_SECONDS = 30;

export type SupportedAudioFormat = "WAV" | "MP3";

export interface DecodedAudioInput {
  format: SupportedAudioFormat;
  originalFilename: string;
  sampleRate: number;
  durationSeconds: number;
  channelCount: number;
  samples: Float32Array;
}

export class AudioInputError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "AudioInputError";
  }
}

const WAV_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave"]);
const MP3_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3"]);
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "audio/octet-stream", "binary/octet-stream"]);

export function detectAudioFormat(file: Pick<File, "name" | "type">): SupportedAudioFormat | null {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  if (WAV_MIME_TYPES.has(mime) || (GENERIC_MIME_TYPES.has(mime) && name.endsWith(".wav"))) return "WAV";
  if (MP3_MIME_TYPES.has(mime) || (GENERIC_MIME_TYPES.has(mime) && name.endsWith(".mp3"))) return "MP3";
  return null;
}

export function validateAudioFile(file: Pick<File, "name" | "type" | "size">): SupportedAudioFormat {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AudioInputError("This recording is larger than 25 MB. Choose a WAV or MP3 file no larger than 25 MB.");
  }
  const format = detectAudioFormat(file);
  if (!format) {
    throw new AudioInputError("This audio format isn’t supported. Choose a WAV or MP3 file no larger than 25 MB.");
  }
  return format;
}

export function mixChannelsToMono(channels: readonly Float32Array[]): Float32Array {
  if (!channels.length) return new Float32Array();
  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let index = 0; index < length; index += 1) mono[index] += channel[index] / channels.length;
  }
  return mono;
}

type AudioContextFactory = () => Pick<AudioContext, "decodeAudioData" | "close">;

export async function decodeAudioFile(
  file: File,
  contextFactory: AudioContextFactory = () => new AudioContext(),
): Promise<DecodedAudioInput> {
  const format = validateAudioFile(file);
  const context = contextFactory();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
  } catch {
    if (format === "MP3") {
      throw new AudioInputError("This MP3 could not be decoded by your browser. Try another MP3 or convert it to WAV.");
    }
    throw new AudioInputError("This WAV could not be decoded by your browser. Try another WAV file.");
  } finally {
    void context.close();
  }
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || !buffer.length) {
    throw new AudioInputError(`This ${format} could not be decoded by your browser. Try another ${format} file.`);
  }
  if (buffer.duration > MAX_ANALYSIS_SECONDS + 1e-6) {
    throw new AudioInputError("This recording is longer than 30 seconds. Choose a WAV or MP3 clip up to 30 seconds.");
  }
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  return {
    format,
    originalFilename: file.name,
    sampleRate: buffer.sampleRate,
    durationSeconds: buffer.duration,
    channelCount: buffer.numberOfChannels,
    samples: mixChannelsToMono(channels),
  };
}

export function createBackendPcmWav(decoded: DecodedAudioInput): File {
  const wav = encodePcm16Wav(decoded.samples, decoded.sampleRate);
  const stem = decoded.originalFilename.replace(/\.[^.]+$/, "") || "recording";
  return new File([wav.buffer as ArrayBuffer], `${stem}.decoded.wav`, { type: "audio/wav" });
}

export function waveformPeaksFromSamples(samples: Float32Array, bucketCount = 600): number[] {
  return Array.from({ length: bucketCount }, (_, bucket) => {
    const start = Math.floor(bucket * samples.length / bucketCount);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * samples.length / bucketCount));
    let peak = 0;
    for (let index = start; index < Math.min(end, samples.length); index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
    return peak;
  });
}
