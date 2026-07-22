# Whale Acoustic Lab research exports

Research Mode creates every export in the browser from the analysis response already held in memory and the reviewed annotation draft stored in `localStorage`. Exporting does not upload annotations, rerun WhAM, or alter the original backend analysis.

All filenames start with the first 12 characters of the recording's SHA-256 hash:

- `<hash12>_whale-research-package.json`
- `<hash12>_whale-annotations.csv`
- `<hash12>_raven-click-selections.txt`
- `<hash12>_raven-coda-selections.txt`

Numbers are serialized using JavaScript's full stored numeric representation. The interface may display rounded values for readability, but exports do not format numbers to a fixed number of decimal places.

## Scientific status

Automatic clicks and coda boundaries are estimates, not verified scientific ground truth. Human-reviewed values record researcher judgments and are also not necessarily scientific ground truth. Neither export type provides a literal interpretation of whale communication.

## JSON research package

Current schema: `whale_acoustic_lab_research_package`, version `1.0.0`.

Top-level fields:

| Field | Contents |
| --- | --- |
| `schema_name`, `schema_version` | Stable package identity and schema version. |
| `audio` | SHA-256, original filename, original and analyzed duration, trim boundaries, sample rate, channel count, and bit depth when returned by the backend. |
| `export_timestamp` | ISO 8601 time at which the download was generated. |
| `ground_truth_statement` | Explicit estimate and reviewed-annotation limitations. |
| `original_automatic_analysis` | Original click detections, timestamps, ICIs, normalized rhythm, coda boundaries, rejected clicks, and ambiguous gaps. |
| `reviewed_annotations` | Current click and coda records, statuses, notes, source labels, and locally recalculated per-coda measurements. |
| `human_corrections` | Comparison ledger containing added, modified, deleted, split, or joined records relative to the automatic document. |
| `existing_wham_embedding` | The embedding and returned dimension only when the embedding already exists in browser memory; otherwise `null`. |
| `existing_acoustic_neighbors` | Neighbor records already returned by the analysis response. |
| `detector_and_segmentation` | Existing click-estimation notes, normalized-rhythm definition, ground-truth availability flag, segmentation thresholds, and boundary rule. |
| `available_model_and_algorithm_identifiers` | Only identifiers already present in the response, including embedding dimension, processing hardware name, and existing narration metadata. |
| `scientific_limitations` | Product limitations plus relevant estimate notes returned by the backend. |

Each recalculated coda contains:

- click count and timestamps;
- inter-click intervals;
- mean and median interval;
- normalized rhythm;
- click-span coda duration;
- regularity and ICI coefficient of variation;
- beginning and ending mean interval;
- beginning-versus-ending pace.

Rejected clicks are excluded from local rhythm calculations. Uncertain clicks remain included and retain their uncertainty label.

## CSV annotation export

The CSV has one row for every current coda and click annotation.

Columns:

1. `record_type` (`click` or `coda`)
2. `recording_hash`
3. `coda_id`
4. `click_id`
5. `begin_time_seconds`
6. `end_time_seconds`
7. `inter_click_interval_seconds`
8. `status`
9. `source` (`automatic` or `human_corrected`)
10. `researcher_note`

Click exports use the onset for both begin and end because the current detector estimates point onsets rather than click-duration boundaries. A click ICI is measured from the preceding non-rejected click in the same coda. Rejected clicks have no recalculated ICI. Coda rows contain region begin/end times and no ICI.

CSV text follows standard quote escaping. Cells containing commas, quotes, newlines, or tabs are quoted, and embedded quotes are doubled. Text beginning with `=`, `+`, `-`, or `@` after optional whitespace receives a leading apostrophe to reduce spreadsheet formula execution risk. Numeric fields remain numeric.

## Raven click selection table

The click file is tab-delimited with one point selection per current click annotation. Columns are:

`Selection`, `View`, `Channel`, `Begin Time (s)`, `End Time (s)`, `Low Freq (Hz)`, `High Freq (Hz)`, `Coda ID`, `Click ID`, `Status`, `Source`, `Note`.

Begin and end times are identical because these are onset estimates. `Channel` is `1` because current annotations are not channel-specific. `Low Freq (Hz)` is `0`; `High Freq (Hz)` is the recording Nyquist frequency (`sample_rate_hz / 2`) because no manual frequency boundaries are collected in Research Mode.

## Raven coda selection table

The coda file uses the same columns and contains one region selection per current coda. Begin and end times are the reviewed coda boundaries. `Click ID` is empty. Frequency and channel conventions match the click table.

## Importing either table into Raven Pro

1. Open the corresponding recording in Raven Pro.
2. Use Raven's selection-table import command and select the exported `.txt` file.
3. Choose tab-delimited text and confirm that the first row contains column headers.
4. Keep time units in seconds and frequency units in hertz.
5. Confirm that the recording sample rate matches the export before using the Nyquist frequency column.
6. Review point selections for clicks and region selections for codas. Custom provenance columns (`Coda ID`, `Click ID`, `Status`, `Source`, and `Note`) should remain attached to the imported selections.

Raven versions may name the import command differently. Consult the Raven Pro documentation for the installed version if custom-column import options differ.
