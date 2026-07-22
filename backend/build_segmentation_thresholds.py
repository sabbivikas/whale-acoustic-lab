"""Derive coda-boundary thresholds from the stored official EC1 datasets."""

from __future__ import annotations

import bisect
import csv
import json
import math
from collections import defaultdict
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_DIR / "references" / "coda_code" / "source"
OUTPUT_PATH = PROJECT_DIR / "references" / "coda_code" / "segmentation_thresholds.json"
DOCUMENTATION_PATH = PROJECT_DIR / "references" / "coda_code" / "SEGMENTATION.md"


def quantile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    lower, upper = math.floor(position), math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def derive_thresholds(source_dir: Path = SOURCE_DIR) -> dict:
    within_coda: list[float] = []
    with (source_dir / "DominicaCodas.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row["Clan"] != "EC1" or "NOISE" in row["CodaType"]:
                continue
            for index in range(1, int(row["nClicks"])):
                interval = float(row[f"ICI{index}"])
                if interval > 0:
                    within_coda.append(interval)

    recordings: dict[str, list[tuple[float, float]]] = defaultdict(list)
    with (source_dir / "sperm-whale-dialogues.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            recordings[row["REC"][:6]].append((float(row["TsTo"]), float(row["Duration"])))
    between_coda: list[float] = []
    overlapping_pairs = 0
    for rows in recordings.values():
        rows.sort()
        for (onset, duration), (next_onset, _) in zip(rows, rows[1:]):
            silent_gap = next_onset - (onset + duration)
            if silent_gap >= 0:
                between_coda.append(silent_gap)
            else:
                overlapping_pairs += 1

    within_ordered = sorted(within_coda)
    between_ordered = sorted(between_coda)
    best = None
    for threshold in sorted(set(within_ordered + between_ordered)):
        within_specificity = bisect.bisect_right(within_ordered, threshold) / len(within_ordered)
        between_sensitivity = (
            len(between_ordered) - bisect.bisect_right(between_ordered, threshold)
        ) / len(between_ordered)
        balanced_accuracy = (within_specificity + between_sensitivity) / 2
        candidate = (balanced_accuracy, threshold, between_sensitivity, within_specificity)
        if best is None or candidate > best:
            best = candidate
    assert best is not None
    balanced_accuracy, split_threshold, sensitivity, specificity = best
    ambiguous_low = quantile(within_coda, 0.99)
    ambiguous_high = max(within_coda)

    probabilities = (0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99)
    return {
        "schema_version": 1,
        "split_threshold_seconds": split_threshold,
        "ambiguous_gap_lower_seconds": ambiguous_low,
        "clear_boundary_seconds": ambiguous_high,
        "boundary_rule": (
            "Split when consecutive estimated click onsets are separated by at least the "
            "balanced-accuracy threshold. Boundaries inside the empirical overlap band are "
            "ambiguous; gaps above the largest observed included EC1 within-coda ICI are clear."
        ),
        "derivation": {
            "within_coda": {
                "source": "EC1 non-noise rows in DominicaCodas.csv",
                "count": len(within_coda),
                "quantiles_seconds": {str(p): quantile(within_coda, p) for p in probabilities},
                "maximum_seconds": max(within_coda),
            },
            "between_coda": {
                "source": "Non-negative next onset minus current onset plus Duration, grouped by REC[:6] in sperm-whale-dialogues.csv",
                "count": len(between_coda),
                "overlapping_pairs_excluded": overlapping_pairs,
                "quantiles_seconds": {str(p): quantile(between_coda, p) for p in probabilities},
            },
            "balanced_accuracy": balanced_accuracy,
            "between_coda_sensitivity_at_threshold": sensitivity,
            "within_coda_specificity_at_threshold": specificity,
            "between_coda_sensitivity_at_clear_boundary": sum(
                gap > ambiguous_high for gap in between_coda
            ) / len(between_coda),
        },
        "scope": {
            "minimum_coda_clicks": 3,
            "maximum_coda_clicks": 10,
            "isolated_groups_under_minimum_are_rejected": True,
            "groups_over_maximum_are_rejected_instead_of_forced": True,
        },
    }


def main() -> None:
    thresholds = derive_thresholds()
    OUTPUT_PATH.write_text(json.dumps(thresholds, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    derivation = thresholds["derivation"]
    DOCUMENTATION_PATH.write_text(
        "# Automatic multi-coda segmentation\n\n"
        "All boundaries are waveform-derived estimates, not scientific annotations.\n\n"
        "## Measured distributions\n\n"
        f"- Included EC1 within-coda ICIs: {derivation['within_coda']['count']:,}. "
        f"Median {derivation['within_coda']['quantiles_seconds']['0.5']:.6f} s; "
        f"95th percentile {derivation['within_coda']['quantiles_seconds']['0.95']:.6f} s; "
        f"99th percentile {derivation['within_coda']['quantiles_seconds']['0.99']:.6f} s; "
        f"maximum {derivation['within_coda']['maximum_seconds']:.6f} s.\n"
        f"- Positive between-coda silent gaps: {derivation['between_coda']['count']:,}; "
        f"{derivation['between_coda']['overlapping_pairs_excluded']:,} overlapping pairs are excluded. "
        f"Median {derivation['between_coda']['quantiles_seconds']['0.5']:.6f} s; "
        f"5th percentile {derivation['between_coda']['quantiles_seconds']['0.05']:.6f} s.\n\n"
        "## Rule\n\n"
        f"- Split threshold: **{thresholds['split_threshold_seconds']:.6f} s**, selected by maximum balanced accuracy "
        f"({derivation['balanced_accuracy']:.3%}) between within-coda ICIs and positive between-coda silence.\n"
        f"- Ambiguity band: **{thresholds['ambiguous_gap_lower_seconds']:.6f}–{thresholds['clear_boundary_seconds']:.6f} s**, "
        "from the within-coda 99th percentile through its observed maximum.\n"
        f"- At the split threshold: between-coda sensitivity {derivation['between_coda_sensitivity_at_threshold']:.3%}; "
        f"within-coda specificity {derivation['within_coda_specificity_at_threshold']:.3%}.\n"
        f"- Gaps above {thresholds['clear_boundary_seconds']:.6f} s are clear because they exceed every included EC1 within-coda ICI; "
        f"this retains {derivation['between_coda_sensitivity_at_clear_boundary']:.3%} of positive between-coda gaps.\n\n"
        "## Limitations\n\n"
        "- Dialogue codas can overlap; negative silent gaps cannot teach a one-dimensional gap boundary and are reported separately.\n"
        "- Waveform click detection errors propagate into segmentation. Reverberation may add clicks and weak clicks may be missed.\n"
        "- Groups with fewer than three clicks are rejected as isolated/noise candidates. Groups above ten clicks are not forced into published coda families.\n"
        "- An ambiguous boundary is still a split when it exceeds the balanced-accuracy threshold, but its uncertainty is returned. Potential boundaries below that threshold remain marked without forcing a split.\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "split_threshold_seconds": thresholds["split_threshold_seconds"],
        "ambiguity_band_seconds": [
            thresholds["ambiguous_gap_lower_seconds"], thresholds["clear_boundary_seconds"]
        ],
        "balanced_accuracy": derivation["balanced_accuracy"],
    }, indent=2))


if __name__ == "__main__":
    main()
