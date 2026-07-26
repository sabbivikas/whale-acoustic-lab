import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AudioInputError,
  MAX_UPLOAD_BYTES,
  createBackendPcmWav,
  decodeAudioFile,
  detectAudioFormat,
  mixChannelsToMono,
  validateAudioFile,
} from "./audio-input";

function file(name: string, type: string, size = 4): File {
  const bytes = new Uint8Array(size);
  return {
    name,
    type,
    size,
    arrayBuffer: async () => bytes.buffer,
  } as File;
}

function audioBuffer(channels: number[][], sampleRate = 8_000): AudioBuffer {
  const data = channels.map((channel) => Float32Array.from(channel));
  return {
    duration: data[0].length / sampleRate,
    length: data[0].length,
    numberOfChannels: data.length,
    sampleRate,
    getChannelData: (channel: number) => data[channel],
  } as AudioBuffer;
}

function context(buffer?: AudioBuffer): Pick<AudioContext, "decodeAudioData" | "close"> {
  return {
    decodeAudioData: async () => {
      if (!buffer) throw new DOMException("bad audio", "EncodingError");
      return buffer;
    },
    close: async () => undefined,
  };
}

test("accepts valid MP3 MIME types and decodes them locally", async () => {
  const decoded = await decodeAudioFile(
    file("recording.bin", "audio/mpeg"),
    () => context(audioBuffer([[0, 0.5, -0.5, 0]])),
  );
  assert.equal(decoded.format, "MP3");
  assert.equal(decoded.originalFilename, "recording.bin");
  assert.equal(decoded.sampleRate, 8_000);
  assert.equal(decoded.channelCount, 1);
});

test("accepts uppercase MP3 and empty or generic MIME types by extension", () => {
  assert.equal(detectAudioFormat(file("CALL.MP3", "")), "MP3");
  assert.equal(detectAudioFormat(file("CALL.MP3", "application/octet-stream")), "MP3");
  assert.equal(detectAudioFormat(file("CALL.MP3", "audio/octet-stream")), "MP3");
  assert.equal(detectAudioFormat(file("CALL.MP3", "audio/mp3")), "MP3");
});

test("reports the required browser MP3 decoding failure", async () => {
  await assert.rejects(
    () => decodeAudioFile(file("broken.mp3", "audio/mpeg"), () => context()),
    (error: unknown) => error instanceof AudioInputError
      && error.message === "This MP3 could not be decoded by your browser. Try another MP3 or convert it to WAV.",
  );
});

test("rejects oversized MP3 before decoding", () => {
  assert.throws(
    () => validateAudioFile(file("large.mp3", "audio/mpeg", MAX_UPLOAD_BYTES + 1)),
    /larger than 25 MB/,
  );
});

test("rejects decoded recordings longer than 30 seconds", async () => {
  await assert.rejects(
    () => decodeAudioFile(
      file("long.mp3", "audio/mpeg"),
      () => context(audioBuffer([new Array(31).fill(0)], 1)),
    ),
    /longer than 30 seconds/,
  );
});

test("stereo channels are averaged into the existing mono PCM representation", () => {
  const mono = mixChannelsToMono([
    Float32Array.from([1, 0.5, -1]),
    Float32Array.from([-1, 0.5, 1]),
  ]);
  assert.deepEqual([...mono], [0, 0.5, 0]);
});

test("MP3 backend handoff is an in-memory mono PCM WAV", async () => {
  const decoded = await decodeAudioFile(
    file("field-call.mp3", "audio/mpeg"),
    () => context(audioBuffer([[0, 0.25, -0.25, 0]], 8_000)),
  );
  const wav = createBackendPcmWav(decoded);
  const bytes = new Uint8Array(await wav.arrayBuffer());
  assert.equal(wav.name, "field-call.decoded.wav");
  assert.equal(wav.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
});

test("WAV validation and decoding behavior remains unchanged", async () => {
  assert.equal(detectAudioFormat(file("call.wav", "audio/wav")), "WAV");
  const decoded = await decodeAudioFile(
    file("call.wav", "audio/wav"),
    () => context(audioBuffer([[0, 1, 0]], 12_000)),
  );
  assert.equal(decoded.format, "WAV");
  assert.deepEqual([...decoded.samples], [0, 1, 0]);
});

test("browser-only audio preparation contains no network request", () => {
  const source = readFileSync(new URL("./audio-input.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/);
});

test("picker and upload copy advertise both supported formats", () => {
  const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  assert.match(main, /accept="\.wav,\.mp3,audio\/wav,audio\/x-wav,audio\/mpeg,audio\/mp3"/);
  assert.match(main, /WAV and MP3 uploads/);
  assert.match(main, /createBackendPcmWav\(decoded\)/);
});
