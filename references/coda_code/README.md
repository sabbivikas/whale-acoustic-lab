# Coda Code research reference

This local reference library reproduces timing-pattern analyses from Sharma et al. (2024). It is used only for structural comparison and deterministic, dataset-derived conversational-role hypotheses. It is not a whale-language translator.

## Sources and license

- Pratyusha Sharma, Shane Gero, Roger Payne, David F. Gruber, Daniela Rus, Antonio Torralba, and Jacob Andreas. “Contextual and combinatorial structure in sperm whale vocalisations.” *Nature Communications* 15, 3617 (2024). https://doi.org/10.1038/s41467-024-47221-8
- Official code and data: https://github.com/pratyushasharma/sw-combinatoriality
- DOI-pinned archive: https://doi.org/10.5281/zenodo.10817697
- The DOI-pinned Zenodo archive is licensed Creative Commons Attribution 4.0 International (CC BY 4.0). The three runtime JSON indexes are modified/derived material under that license. See `ATTRIBUTION.md`, `LICENSE.md`, `PROVENANCE.md`, and `provenance.json`. This statement applies to the archived release, not unrelated future GitHub revisions.

## Included official source files

- `source/DominicaCodas.csv`: 8,719 coda rows; the index uses EC1 rows and excludes noise/unmapped labels.
- `source/sperm-whale-dialogues.csv`: 3,840 released dialogue rows.
- `source/rhythms.p`: 3,840 row-aligned saved rhythm-cluster identifiers.
- `source/ornaments.p`: 3,840 row-aligned repository-derived ornament flags.

The pickle files are loaded by a restricted unpickler that accepts only plain integer lists. They are never accepted from users.

## Generated files

- `rhythm_reference_index.json`: 18 published rhythm families, equal-click-count centroids, empirical distance distributions, tempo boundaries, and leave-one-out abstention metrics.
- `dialogue_context_index.json`: disclosed exchange grouping, position/following-speaker statistics, next-rhythm counts, ornament availability, source hashes, and the dataset discrepancy record.
- `segmentation_thresholds.json`: measured within-coda and between-coda gap distributions, the balanced-accuracy split threshold, and ambiguity band.
- `VALIDATION.md`: concise measured evaluation results.
- `SEGMENTATION.md`: threshold derivation, measured operating characteristics, and segmentation limitations.
- `provenance.json`: machine-readable source authority, checksums, generation scripts, local generation times, and publication decisions.

Only the three runtime JSON indexes and their attribution/provenance documents are approved for publication. The CSV and pickle build inputs remain excluded because the application does not require them at runtime.

Regenerate locally with `PYTHONPATH=backend python3 backend/build_coda_code_index.py` from the project root. This requires only the Python standard library.

Regenerate segmentation measurements with `PYTHONPATH=backend python3 backend/build_segmentation_thresholds.py`.

## Scientific boundaries

- Click timestamps from uploaded audio remain waveform-derived estimates, not DSWP annotations.
- Rhythm matches are nearest published EC1 timing patterns, not probabilities or identities.
- Context statistics are associations within the released dialogue table. They do not establish causal communicative function.
- The paper reports 3,948 contextual codas, while the released CSV and both aligned annotation lists contain 3,840. The missing 108 are not available here and are not reconstructed.
- The repository provides an aggregate association between ornamentation and changes in chorusing. It does not provide a validated per-row chorusing-transition target, so this index does not assign that role.
- Creative analogies are deterministic presentation copy and are always labelled “not a literal translation.”
