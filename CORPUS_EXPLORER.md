# Corpus Explorer

Corpus Explorer is a browser-only workspace for comparing multiple Whale Acoustic Lab research packages. It does not accept audio, contact the analysis backend, rerun WhAM, or upload imported files.

## Accepted input

Import one or more JSON files exported from Research Mode with:

- `schema_name`: `whale_acoustic_lab_research_package`
- `schema_version`: `1.0.0`
- a complete 64-character audio SHA-256
- audio duration and sample-rate metadata
- original automatic click detections and coda boundaries
- current reviewed click and coda annotations
- a human-correction ledger

Files with malformed required fields or unsupported schema versions are rejected with a reason. Recordings are deduplicated by their complete audio SHA-256. Missing optional fields are reported without rejecting an otherwise usable package.

The explorer accepts an existing WhAM embedding only when it is numeric and has the expected 1,280-value dimension. Nested frame embeddings are collapsed with the same arithmetic-mean behavior used by the existing app. Missing, zero-magnitude, non-finite, or wrong-dimension embeddings are excluded from model-space calculations.

## Dashboard and filters

The dashboard reports recording, coda, click, annotation-source, annotation-status, correction, and incomplete-field counts. Histograms summarize reviewed click counts, reviewed coda durations, reviewed mean inter-click intervals, and reviewed rhythm regularity.

Filters can restrict the visible corpus by:

- reviewed click count;
- reviewed coda count;
- published rhythm family already present in the package;
- representative annotation status;
- presence of human corrections;
- presence of a compatible embedding;
- nearest-neighbor cosine similarity; and
- model-space outlier score.

Filters change the displayed projection and local exports. They never alter imported packages.

## Cosine similarity

Compatible embeddings are L2-normalized. Pairwise similarity is the dot product of two normalized vectors:

`cosine similarity = normalized A · normalized B`

Cosine distance is `1 - cosine similarity`. The matrix, nearest pairs, and per-recording nearest neighbor are deterministic because recordings and ties are ordered by full audio hash.

Similarity in WhAM model space does not establish whale identity, clan, dialect, meaning, intent, behavior, or biological relationship.

## PCA map

The two-dimensional map uses `deterministic-jacobi-pca-v1`:

1. keep compatible 1,280-value embeddings;
2. sort recordings by full audio hash;
3. L2-normalize each vector;
4. mean-center each feature;
5. form the sample Gram matrix;
6. compute its symmetric eigendecomposition with deterministic Jacobi rotations;
7. order components by descending eigenvalue with deterministic tie breaking; and
8. stabilize each component sign using its largest-magnitude coordinate.

The map reports the fraction of total variance represented by PC1 and PC2. PCA is a lossy projection. Visual proximity and apparent clusters require further investigation and must not be described as whale identity, clan, dialect, meaning, or behavior.

Points may be colored by reviewed click count, reviewed coda count, representative annotation status, presence of human correction, or a published rhythm-family label already stored in the package.

## Outlier scoring

For a researcher-selected neighbor count `k`, each compatible recording is compared with its nearest compatible neighbors. The score is:

`mean of (1 - cosine similarity) across the k nearest neighbors`

`k` is limited to the number of other compatible recordings. A single-recording corpus has no outlier score. Higher scores indicate recordings farther from their nearest neighbors in the imported WhAM model space. They are labeled only as model-space candidates for manual review, never as biological discoveries.

## Local exports

Four files are generated entirely in the browser:

1. `corpus-<id>_summary.json`
2. `corpus-<id>_recordings.csv`
3. `corpus-<id>_pairwise-similarity.csv`
4. `corpus-<id>_outlier-review.csv`

Every export includes the corpus schema and algorithm versions, sorted imported hashes, source research-package versions, current filters, PCA configuration and explained variance, similarity and outlier definitions, generation timestamp, and scientific limitations. CSV strings are quoted where required and leading spreadsheet formula characters are prefixed with an apostrophe.

The corpus ID is a deterministic FNV-1a 64-bit digest of the sorted, unique, complete audio hashes. It identifies this local set for reproducibility; it is not a security or content hash.

## Privacy and browser storage

Imported packages and calculated corpus state remain in browser memory by default. Nothing is saved automatically. Reloading or closing the page clears the in-memory corpus.

“Save this corpus locally” is an explicit action. It stores the imported research packages in IndexedDB on the current device. Saved corpora can be loaded or deleted from the same section. No annotation or corpus data is uploaded by this feature.

## Scientific limitations

- Automatic annotations are estimates.
- Researcher-reviewed annotations are review sets and are not automatically scientific ground truth.
- WhAM embeddings represent model-space acoustic structure, not a translation.
- Similarity does not establish shared meaning, identity, intent, clan, dialect, behavior, or biology.
- PCA discards information when projecting 1,280 dimensions into two.
- Outlier scores depend on the imported corpus, compatible embeddings, and selected `k`.
- Missing or incomplete package fields can affect summaries and filters.
- Any candidate identified here requires independent scientific review and appropriate validation data.
