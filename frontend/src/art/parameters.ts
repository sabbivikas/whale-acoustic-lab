import { hashWords, sfc32 } from "./prng";

export interface Form {
  x: number; y: number; radius: number; sides: number; rotation: number;
  hueShift: number; alpha: number; speed: number; phase: number; orbit: number;
}

export interface ArtParameters {
  seed: string; backgroundHue: number; primaryHue: number; accentHue: number;
  saturation: number; lightness: number; grain: number; lineWidth: number; forms: Form[];
}

const squash = (value: number): number => 1 / (1 + Math.exp(-value));
const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export function deriveParameters(embedding: number[], seed: string): ArtParameters {
  const values = embedding.map((value) => Math.round(value * 10_000) / 10_000);
  const random = sfc32(...hashWords(seed));
  const palette = values.slice(0, 32);
  const shapes = values.slice(32, 288);
  const positions = values.slice(288, 544);
  const sizes = values.slice(544, 672);
  const texture = values.slice(672, 1024);
  const motion = values.slice(1024, 1280);
  const sample = (group: number[], index: number) => squash(group[index % group.length] || 0);
  const count = 24 + Math.floor(sample(shapes, 0) * 17);

  return {
    seed,
    backgroundHue: 185 + sample(palette, 0) * 35,
    primaryHue: 165 + sample(palette, 7) * 80,
    accentHue: 285 + sample(palette, 19) * 70,
    saturation: 55 + sample(palette, 25) * 30,
    lightness: 48 + sample(palette, 29) * 18,
    grain: 0.035 + squash(mean(texture)) * 0.055,
    lineWidth: 0.8 + sample(texture, 91) * 2.4,
    forms: Array.from({ length: count }, (_, index) => ({
      x: 0.08 + ((sample(positions, index * 2) * 0.75 + random() * 0.17) % 0.84),
      y: 0.08 + ((sample(positions, index * 2 + 1) * 0.75 + random() * 0.17) % 0.84),
      radius: 22 + sample(sizes, index * 3) * 105,
      sides: 3 + Math.floor(sample(shapes, index * 5) * 6),
      rotation: random() * Math.PI * 2,
      hueShift: (sample(shapes, index * 7) - 0.5) * 75,
      alpha: 0.12 + sample(texture, index * 11) * 0.3,
      speed: 0.08 + sample(motion, index * 3) * 0.38,
      phase: random() * Math.PI * 2,
      orbit: 5 + sample(motion, index * 3 + 1) * 28,
    })),
  };
}
