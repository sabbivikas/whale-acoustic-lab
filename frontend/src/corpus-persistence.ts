import type { CorpusRecord, ResearchPackage } from "./corpus-types";

export interface SavedCorpus {
  schemaVersion: "1.0.0";
  corpusId: string;
  name: string;
  savedAt: string;
  audioHashes: string[];
  packages: ResearchPackage[];
}

const DATABASE_NAME = "whale-acoustic-lab-research";
const STORE_NAME = "saved-corpora";

export function deterministicCorpusId(hashes: string[]): string {
  const input = [...new Set(hashes)].sort().join("|");
  let value = 0xcbf29ce484222325n;
  for (const character of input) {
    value ^= BigInt(character.codePointAt(0)!);
    value = BigInt.asUintN(64, value * 0x100000001b3n);
  }
  return `corpus-${value.toString(16).padStart(16, "0")}`;
}

export function serializeCorpusForStorage(records: CorpusRecord[], name: string, savedAt: string): SavedCorpus {
  const audioHashes = records.map((record) => record.hash).sort();
  return {
    schemaVersion: "1.0.0",
    corpusId: deterministicCorpusId(audioHashes),
    name: name.trim() || `Corpus of ${records.length} recording${records.length === 1 ? "" : "s"}`,
    savedAt,
    audioHashes,
    packages: [...records].sort((left, right) => left.hash.localeCompare(right.hash)).map((record) => record.package),
  };
}

export function deserializeSavedCorpus(value: unknown): SavedCorpus | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<SavedCorpus>;
  if (candidate.schemaVersion !== "1.0.0" || typeof candidate.corpusId !== "string" || typeof candidate.name !== "string" || typeof candidate.savedAt !== "string" || !Array.isArray(candidate.audioHashes) || !Array.isArray(candidate.packages)) return null;
  if (!candidate.audioHashes.every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash))) return null;
  const packageHashes = candidate.packages.map((researchPackage) => researchPackage?.audio?.sha256).sort();
  if (packageHashes.length !== candidate.audioHashes.length || packageHashes.some((hash, index) => hash !== [...candidate.audioHashes!].sort()[index])) return null;
  if (candidate.corpusId !== deterministicCorpusId(candidate.audioHashes)) return null;
  return candidate as SavedCorpus;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "corpusId" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed."));
  });
}

export async function saveCorpusLocally(corpus: SavedCorpus): Promise<void> {
  const database = await openDatabase();
  try { await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(corpus)); }
  finally { database.close(); }
}

export async function listSavedCorpora(): Promise<SavedCorpus[]> {
  const database = await openDatabase();
  try {
    const values = await requestResult(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());
    return values.map(deserializeSavedCorpus).filter((value): value is SavedCorpus => value !== null).sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } finally { database.close(); }
}

export async function deleteSavedCorpus(corpusId: string): Promise<void> {
  const database = await openDatabase();
  try { await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(corpusId)); }
  finally { database.close(); }
}
