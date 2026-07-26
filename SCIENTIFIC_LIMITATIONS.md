# Scientific methods, reproducibility, and limitations

Whale Acoustic Lab is an exploratory acoustic-analysis interface. It is not a whale-language translator and does not establish literal meaning, individual identity, emotion, intent, clan, dialect, behavioral category, or biological discovery.

## Audio input, decoding, and trimming

The static browser accepts WAV and MP3 uploads up to 25 MiB and analyzes at
most 30 seconds. Web Audio `decodeAudioData` support depends on the browser;
an MP3 that one browser cannot decode must be tried in another supported form
or converted to WAV. Decoded channels are averaged into the same mono
floating-point PCM representation used by the existing browser pipeline, so
channel-specific spatial information is discarded. Lossy MP3 encoding can
alter transients and therefore affect estimated click timing.

The optional backend receives WAV submissions. `audio_decode.py` uses the
standard-library WAV reader for compatible files and FFmpeg for supported
alternatives, producing mono 16-bit PCM. In Bring Your Own Backend mode, an
MP3 is decoded locally and converted to a temporary mono PCM WAV in browser
memory before the user-initiated submission.

`audio_trimming.py` measures RMS in 20 ms frames and trims only before the first and after the last active frame. The threshold is the maximum of 5% of peak RMS, four times the mean RMS of the quietest 10% of frames, and `1e-5`. Peak RMS below `0.002` is rejected; the unpadded active span must be at least one second; 150 ms padding is restored around accepted boundaries. Interior gaps are never removed.

Trimming may fail or choose imperfect boundaries when target calls are quiet, room/boat noise is sustained, automatic gain control raises silence, unrelated sounds occur near an edge, or multiple sources overlap.

## Automatic click detection

`audio_analysis.py`:

1. clamps decoded mono samples to `[-1, 1]`;
2. applies first-order pre-emphasis `y[n] = x[n] - 0.97x[n-1]`;
3. squares the result and computes a centered 1 ms moving-average energy envelope;
4. uses `max(median + 10 × 1.4826 × MAD, 1% of peak energy, 1e-12)` as threshold;
5. takes the strongest sample from each contiguous above-threshold region; and
6. applies 40 ms non-maximum suppression, retaining the stronger nearby candidate.

Click timestamps are algorithmic estimates without public per-file ground truth. Reverberation, clipping, tag contact, mechanical noise, echolocation, overlapping whales, and weak clicks can create false detections or misses. Clicks less than 40 ms apart are intentionally merged.

## Inter-click intervals and normalized rhythm

An inter-click interval (ICI) is the difference between successive accepted click timestamps. Backend click summaries divide each ICI by the **mean ICI**. Published-family matching divides each ICI by the **sum of ICIs**; this unit-sum representation is compared only with equal-click-count families.

Research Mode locally recalculates timestamps and ICIs from non-rejected reviewed clicks. It reports arithmetic mean, median, population coefficient of variation, duration, unit-sum normalized rhythm, and the mean of the first/last half of ICIs. Regularity labels use coefficient-of-variation thresholds `≤0.12` (regular), `≤0.30` (variable), and `>0.30` (irregular). An ending pace within 10% of the beginning is “about the same”; a shorter ending mean is faster and a longer one is slower. These descriptive thresholds are not biological categories.

## Probable-coda segmentation

`coda_segmentation.py` uses a one-dimensional gap rule derived from EC1 examples:

- split threshold: `0.517216` s;
- ambiguity band: `0.485883–0.551720` s;
- fewer than three clicks: rejected from published-family scope; and
- more than ten clicks: not forced into an EC1 family.

At derivation time, the selected threshold had 96.190% balanced accuracy on the included within-coda and positive between-coda gap distributions. That value does not measure end-to-end detector accuracy on uploads. Overlapping codas, missed/extra clicks, unseen populations, noise, and context can invalidate the simple gap assumption.

## Published rhythm-family matching

`coda_code.py` calculates mean squared error (MSE) between a unit-sum uploaded rhythm vector and each equal-click-count EC1 family centroid. The displayed nearest family is the minimum-MSE candidate. Acceptance requires its MSE to be no greater than the click-count-specific 95th percentile of correctly classified leave-one-out distances. Otherwise the matcher abstains and the nearest family is labeled weak/outside the accepted range.

MSE is a geometric distance, not a probability or confidence score. The empirical closeness percentile is the percentage of same-family reference distances at least as large as the query’s distance. A rhythm-family comparison does not establish meaning, identity, clan, dialect, intent, or behavior.

The contextual-role rules require minimum sample counts and disclosed position/speaker statistics. They are dataset associations, not causal functions or translations. GPT narration receives only compact calculated evidence, must preserve unclear roles, is schema-validated, and falls back deterministically; generated prose cannot make the underlying evidence stronger.

## WhAM embeddings and acoustic neighbors

The backend pins Project CETI WhAM source commit `00a8b787c040db23cd51ac4417481a09ac354985`. It extracts the published layer-10 representation, pools frames arithmetically to 1,280 values for reference matching, and uses cosine similarity against an existing DSWP index.

Cosine similarity is the normalized dot product. The reference percentile locates a score among stored non-self reference-pair similarities; it is not a probability. Embedding proximity can reflect recording conditions, noise, equipment, duration, or model behavior and does not establish biological or semantic similarity.

## Annotation Evaluation

Algorithm version: `annotation-evaluation-v1`. Click tolerance defaults to 0.010 s and is clamped to 0.001–0.100 s. An order-preserving dynamic program first maximizes the number of one-to-one pairs inside the inclusive tolerance and then minimizes total absolute timing error. Precision is matched/automatic, recall is matched/reviewed, and F1 is their harmonic mean; empty-set conventions are documented in `RESEARCH_EVALUATION.md`.

Coda IoU is `intersection duration / union duration`. An order-preserving one-to-one alignment accepts IoU `≥0.50`, maximizing match count and then total IoU. Split/merge candidates are overlap heuristics, not validated error diagnoses. A researcher-created review set can also contain mistakes and is not ground truth unless an external verification protocol establishes that status.

## Corpus Explorer

Schema version: `1.0.0`; algorithm version: `corpus-explorer-v1`; expected WhAM dimension: 1,280.

- **Cosine similarity:** L2-normalized vectors, computed locally.
- **PCA:** deterministic Jacobi eigendecomposition of the centered sample Gram matrix (`deterministic-jacobi-pca-v1`). Inputs and tie order are sorted by full audio hash; component signs are fixed using the largest-magnitude coordinate. Reported component variance is eigenvalue/total eigenvalue.
- **Outlier score:** mean cosine distance `(1 - similarity)` to the selected `k` nearest compatible recordings, bounded by corpus size.

PCA is a lossy two-dimensional projection. Visual clusters and outlier scores are model-space prompts for review, not whale identities, clans, dialects, meanings, behaviors, or discoveries. Small or homogeneous corpora make both views especially fragile.

## Schemas, versions, and deterministic identifiers

| Artifact | Version / identifier |
|---|---|
| Reference manifest | schema `1` |
| DSWP reference index | schema `1` |
| EC1 rhythm/context/segmentation indexes | schema `1` |
| Research draft | version `1`; `localStorage` key uses full audio SHA-256 |
| Research export package | `1.0.0` |
| Evaluation export | schema `1.0.0`; algorithm `annotation-evaluation-v1` |
| Corpus package | schema `1.0.0`; algorithm `corpus-explorer-v1` |
| PCA | `deterministic-jacobi-pca-v1` |
| Evidence prompt | `whale-evidence-narrator-v1` |
| Compact evidence | `whale-calculated-evidence-v1` |

Audio identifiers are browser-calculated SHA-256 values over original file bytes. Export names use the first 12 hexadecimal characters for convenience while packages retain the complete hash. Corpus IDs use deterministic 64-bit FNV-1a over sorted, unique full hashes; this ID is reproducible but is not a cryptographic integrity proof.

## Data and reproducibility boundaries

- The DSWP public files contain isolated codas without per-file identity, exact location/date, behavioral context, recording system, or ground-truth click annotations.
- Dataset-level collection facts must not be presented as per-file metadata.
- EC1-derived runtime indexes are modified material under the archived release’s CC BY 4.0 license. Raw build inputs remain excluded; provenance and transformations are documented under `references/coda_code/`.
- The paper reports 3,948 contextual codas while the released aligned tables contain 3,840; the missing 108 are not reconstructed.
- Browser timestamps, floating-point math, audio decoding, and browser visualization can vary slightly across platforms.
- Reference indexes are committed artifacts; CI validates them but intentionally does not rebuild them.
- WhAM checkpoints are not distributed here. Full reproduction of model inference requires separately obtaining and complying with their license.
