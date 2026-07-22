import type { CorpusRecord, PcaResult } from "./corpus-types";
import { expectedEmbeddingDimension, normalizeEmbedding } from "./corpus-similarity";

function jacobiEigenDecomposition(input: number[][]): { values: number[]; vectors: number[][] } {
  const size = input.length;
  const matrix = input.map((row) => [...row]);
  const vectors: number[][] = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => row === column ? 1 : 0));
  const maxIterations = Math.max(1, 100 * size * size);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let row = 0;
    let column = 0;
    let largest = 0;
    for (let left = 0; left < size; left += 1) for (let right = left + 1; right < size; right += 1) {
      const value = Math.abs(matrix[left][right]);
      if (value > largest) { largest = value; row = left; column = right; }
    }
    if (largest < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * matrix[row][column], matrix[column][column] - matrix[row][row]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const leftDiagonal = matrix[row][row];
    const rightDiagonal = matrix[column][column];
    const offDiagonal = matrix[row][column];
    for (let index = 0; index < size; index += 1) {
      if (index === row || index === column) continue;
      const left = matrix[index][row];
      const right = matrix[index][column];
      matrix[index][row] = matrix[row][index] = cosine * left - sine * right;
      matrix[index][column] = matrix[column][index] = sine * left + cosine * right;
    }
    matrix[row][row] = cosine * cosine * leftDiagonal - 2 * sine * cosine * offDiagonal + sine * sine * rightDiagonal;
    matrix[column][column] = sine * sine * leftDiagonal + 2 * sine * cosine * offDiagonal + cosine * cosine * rightDiagonal;
    matrix[row][column] = 0;
    matrix[column][row] = 0;
    for (let index = 0; index < size; index += 1) {
      const left = vectors[index][row];
      const right = vectors[index][column];
      vectors[index][row] = cosine * left - sine * right;
      vectors[index][column] = sine * left + cosine * right;
    }
  }
  return { values: matrix.map((row, index) => Math.max(0, row[index])), vectors };
}

export function calculateDeterministicPca(records: CorpusRecord[]): PcaResult {
  const dimension = expectedEmbeddingDimension(records);
  const usable = records
    .filter((record) => dimension !== null && record.embeddingDimension === dimension && record.embedding?.length === dimension)
    .map((record) => ({ record, vector: normalizeEmbedding(record.embedding!) }))
    .filter((item): item is { record: CorpusRecord; vector: number[] } => item.vector !== null)
    .sort((a, b) => a.record.hash.localeCompare(b.record.hash));
  if (!usable.length) return { algorithmVersion: "deterministic-jacobi-pca-v1", points: [], explainedVariance: [0, 0], componentCount: 2 };
  if (usable.length === 1) return { algorithmVersion: "deterministic-jacobi-pca-v1", points: [{ hash: usable[0].record.hash, x: 0, y: 0 }], explainedVariance: [0, 0], componentCount: 2 };
  const means = Array.from({ length: dimension! }, (_, feature) => usable.reduce((sum, item) => sum + item.vector[feature], 0) / usable.length);
  const centered = usable.map((item) => item.vector.map((value, feature) => value - means[feature]));
  const gram = centered.map((left) => centered.map((right) => left.reduce((sum, value, feature) => sum + value * right[feature], 0)));
  const eigen = jacobiEigenDecomposition(gram);
  const order = eigen.values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value || a.index - b.index);
  const total = order.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const component = (rank: number): number[] => {
    const item = order[rank];
    if (!item || item.value <= 1e-15) return usable.map(() => 0);
    const values = usable.map((_, row) => eigen.vectors[row][item.index] * Math.sqrt(item.value));
    const anchor = values.reduce((best, value, index) => Math.abs(value) > Math.abs(values[best]) ? index : best, 0);
    return values[anchor] < 0 ? values.map((value) => -value) : values;
  };
  const first = component(0);
  const second = component(1);
  return {
    algorithmVersion: "deterministic-jacobi-pca-v1",
    points: usable.map((item, index) => ({ hash: item.record.hash, x: first[index], y: second[index] })),
    explainedVariance: [total ? (order[0]?.value ?? 0) / total : 0, total ? (order[1]?.value ?? 0) / total : 0],
    componentCount: 2,
  };
}
