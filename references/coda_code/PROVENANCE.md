# EC1 derived-index provenance

## Authority

The licensing and source authority is the Zenodo archive at https://zenodo.org/records/10817697, DOI `10.5281/zenodo.10817697`, published 2024-03-14. Its title is “Dataset and Codebase for paper on Contextual and Combinatorial Structure in Sperm Whale Vocalisations,” its creator is Pratyusha Sharma, and its Rights section specifies CC BY 4.0. Access for this audit: 2026-07-22.

This provenance statement applies to the DOI-pinned archive, not to unrelated future GitHub revisions.

## Local archived-source inventory

The following build inputs retain their archived filenames. Their SHA-256 values are recorded inside the generated indexes and match the current local bytes exactly.

| Archived filename | Local SHA-256 | Purpose |
|---|---|---|
| `DominicaCodas.csv` | `53dd44fbfb0040da93656aa44883954f3abe18dd6539e90c625af86a96db6b45` | EC1 coda type, click count, and ICI rows. |
| `sperm-whale-dialogues.csv` | `1856c8bf915cc5ae6f928aaa2036cbbc6ad8840bb6e4f6a96aaeb96953215da2` | Released dialogue timing, speaker, duration, and recording rows. |
| `rhythms.p` | `cd204bef55e7c296ac7f035babfc71b0e34ee8f81ad286c3e430186bc9f2238b` | Row-aligned saved integer rhythm-cluster identifiers. |
| `ornaments.p` | `8e37ba3e6ee9938286cc255be0a5fd07067fd8aa4b0393c8978e9968c1655f1d` | Row-aligned saved integer ornament flags. |

These raw build inputs are not required at runtime and remain excluded by the root `.gitignore`. The restricted unpickler in `backend/build_coda_code_index.py` permits only plain integer lists and forbids globals.

## Derived files approved for publication

| Derived file | Local SHA-256 | Local generation time | Generator |
|---|---|---|---|
| `rhythm_reference_index.json` | `1b199b48bf4719f43b451f433c50b006441894661cf2822c1118ff5ae8c25be4` | 2026-07-20 01:00:39 CDT | `backend/build_coda_code_index.py` |
| `dialogue_context_index.json` | `27bb79e4f5b5189dbd9d87f1195a25fe7b7c99e272339ee21c4f303a0786a65f` | 2026-07-20 01:00:39 CDT | `backend/build_coda_code_index.py` |
| `segmentation_thresholds.json` | `ff8813df7e4cf93997ef0704a1ccdec776d19fae938a599dc3aa892422df17ef` | 2026-07-20 00:11:32 CDT | `backend/build_segmentation_thresholds.py` |

Generation times come from local filesystem metadata because the schema-v1 JSON files do not embed a generation timestamp. The content hashes are the reproducible identifiers.

## Transformations and modifications

### `rhythm_reference_index.json`

1. Read 8,719 rows from `DominicaCodas.csv`.
2. Keep EC1 rows only.
3. Exclude `*-NOISE`, unmapped, and invalid rows.
4. Convert positive ICIs to unit-sum rhythm vectors.
5. Map published coda types into 18 disclosed rhythm families.
6. Calculate equal-click-count family centroids and MSE distance distributions.
7. Run leave-one-out nearest-family validation and derive click-count-specific 95th-percentile abstention thresholds from correctly classified examples.
8. Calculate same-click-count duration, coefficient-of-variation, and normalized-slope calibration quantiles.

The resulting index contains 7,268 included EC1 examples. It is a computed summary, not a copy of the raw table.

### `dialogue_context_index.json`

1. Read 3,840 mutually aligned rows/entries from `sperm-whale-dialogues.csv`, `rhythms.p`, and `ornaments.p`.
2. Validate exact row-count alignment and load the pickles through a restricted integer-list unpickler.
3. Apply the documented saved-cluster-to-published-family permutation after validating prototypes against EC1 means.
4. Retain 3–10-click, positive-duration rows with mapped families; do not reconstruct the 108 dialogue rows reported by the paper but absent from the release.
5. Calculate tempo bins from disclosed duration boundaries.
6. Group by the first six characters of `REC`, order by `TsTo`, and split exchanges on onset gaps of at least eight seconds.
7. Aggregate position, following-coda, preceding/following speaker, next-family, timing, and ornament statistics by rhythm-family/tempo combination.
8. Explicitly leave chorusing-change labels unavailable because no validated row-level target is present.

The result is an aggregate operational index, not semantic annotation or a translation.

### `segmentation_thresholds.json`

1. Extract positive within-coda ICIs from EC1 non-noise rows in `DominicaCodas.csv`.
2. Compute non-negative between-coda silent gaps from `sperm-whale-dialogues.csv`, grouped by the first six characters of `REC`; exclude overlapping pairs.
3. Select the split threshold that maximizes balanced accuracy between those two measured distributions.
4. Define the ambiguity lower bound as the within-coda 99th percentile and the clear-boundary value as the largest included within-coda ICI.
5. Record counts, quantiles, sensitivity, specificity, balanced accuracy, scope, and boundary rule.

## Runtime and publication boundary

The application and Modal image load only the three derived JSON files. Raw CSVs, pickles, notebooks, duplicated datasets, and temporary build outputs are unnecessary for runtime and remain excluded. The generators are retained as MIT-licensed reproducibility code, but CI does not execute them and no reference index is rebuilt during normal tests.
