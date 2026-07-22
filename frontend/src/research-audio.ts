export interface ResearchAudioData {
  samples: Float32Array;
  sampleRate: number;
  durationSeconds: number;
  spectrogram: Float32Array[];
}

function monoSamples(buffer: AudioBuffer, startSample: number, endSample: number): Float32Array {
  const length = Math.max(0, endSample - startSample);
  const result = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) result[index] += source[startSample + index] / buffer.numberOfChannels;
  }
  return result;
}

export function calculateSpectrogram(samples: Float32Array, columns = 320, bins = 96): Float32Array[] {
  if (!samples.length) return [];
  const windowSize = 256;
  const frames = Math.max(1, Math.min(columns, Math.ceil(samples.length / 128)));
  const output: Float32Array[] = [];
  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;
  for (let frame = 0; frame < frames; frame += 1) {
    const center = frames === 1 ? 0 : Math.round(frame / (frames - 1) * (samples.length - 1));
    const start = center - Math.floor(windowSize / 2);
    const magnitudes = new Float32Array(bins);
    for (let bin = 0; bin < bins; bin += 1) {
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < windowSize; index += 1) {
        const sourceIndex = start + index;
        const sample = sourceIndex >= 0 && sourceIndex < samples.length ? samples[sourceIndex] : 0;
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (windowSize - 1));
        const angle = 2 * Math.PI * bin * index / windowSize;
        real += sample * window * Math.cos(angle);
        imaginary -= sample * window * Math.sin(angle);
      }
      const decibels = 20 * Math.log10(Math.hypot(real, imaginary) + 1e-7);
      magnitudes[bin] = decibels;
      globalMin = Math.min(globalMin, decibels);
      globalMax = Math.max(globalMax, decibels);
    }
    output.push(magnitudes);
  }
  const floor = Math.max(globalMin, globalMax - 72);
  const range = Math.max(1, globalMax - floor);
  output.forEach((frame) => {
    frame.forEach((value, index) => { frame[index] = Math.max(0, Math.min(1, (value - floor) / range)); });
  });
  return output;
}

export async function decodeResearchAudio(file: File, trimStartSeconds: number, durationSeconds: number): Promise<ResearchAudioData> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const start = Math.max(0, Math.floor(trimStartSeconds * buffer.sampleRate));
    const end = Math.min(buffer.length, Math.ceil((trimStartSeconds + durationSeconds) * buffer.sampleRate));
    const samples = monoSamples(buffer, start, end);
    return {
      samples,
      sampleRate: buffer.sampleRate,
      durationSeconds: samples.length / buffer.sampleRate,
      spectrogram: calculateSpectrogram(samples),
    };
  } finally {
    void context.close();
  }
}
