"""Build the local CC BY 4.0 rhythm and dialogue-context reference indexes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import pickle
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from coda_code import CODA_TYPE_TO_FAMILY, RHYTHM_FAMILIES, mse, normalize_intervals, tempo_type
from measured_rhythm import calibration_metrics


PROJECT_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = PROJECT_DIR / "references" / "coda_code" / "source"
OUTPUT_DIR = PROJECT_DIR / "references" / "coda_code"
RHYTHM_INDEX_PATH = OUTPUT_DIR / "rhythm_reference_index.json"
CONTEXT_INDEX_PATH = OUTPUT_DIR / "dialogue_context_index.json"
VALIDATION_PATH = OUTPUT_DIR / "VALIDATION.md"
EXPECTED_DIALOGUE_ROWS_IN_PAPER = 3948
EXCHANGE_GAP_SECONDS = 8.0

# The repository's mean_codas.p order is process-dependent because 3-rhythm.ipynb
# iterates a Python set. We validated each saved prototype against the EC1 means
# in DominicaCodas.csv; this permutation connects row-aligned rhythms.p values to
# the notebook's published 0..17 rhythm-family mapping.
SAVED_CLUSTER_TO_PUBLISHED_FAMILY = {
    0: 3, 1: 2, 2: 5, 3: 4, 4: 6, 5: 0, 6: 14, 7: 10, 8: 11,
    9: 12, 10: 9, 11: 15, 12: 1, 13: 13, 14: 17, 15: 7, 16: 8, 17: 16,
}


class SafeListUnpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str) -> Any:
        raise pickle.UnpicklingError(f"globals are forbidden in list artifact: {module}.{name}")


def _load_safe_list(path: Path) -> list[int]:
    with path.open("rb") as source:
        value = SafeListUnpickler(source).load()
    if not isinstance(value, list) or any(not isinstance(item, int) for item in value):
        raise ValueError(f"{path.name} is not a plain integer list")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _quantile(values: list[float], fraction: float) -> float:
    if not values:
        raise ValueError("cannot calculate a quantile of an empty list")
    ordered = sorted(values)
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _mean_vector(vectors: list[list[float]]) -> list[float]:
    return [statistics.fmean(vector[index] for vector in vectors) for index in range(len(vectors[0]))]


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def build_rhythm_index(rows: list[dict[str, str]]) -> dict[str, Any]:
    vectors: dict[int, list[list[float]]] = defaultdict(list)
    calibration_values: dict[int, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    excluded_noise = excluded_non_ec1 = excluded_invalid = 0
    for row in rows:
        if row["Clan"] != "EC1":
            excluded_non_ec1 += 1
            continue
        coda_type = row["CodaType"]
        if "NOISE" in coda_type or coda_type not in CODA_TYPE_TO_FAMILY:
            excluded_noise += 1
            continue
        clicks = int(row["nClicks"])
        try:
            intervals = [float(row[f"ICI{index}"]) for index in range(1, clicks)]
            vectors[CODA_TYPE_TO_FAMILY[coda_type]].append(normalize_intervals(intervals))
            for name, value in calibration_metrics(intervals).items():
                calibration_values[clicks][name].append(value)
        except (KeyError, ValueError):
            excluded_invalid += 1

    families = []
    centroids = {family: _mean_vector(items) for family, items in vectors.items()}
    for family_id in range(18):
        items = vectors[family_id]
        centroid = centroids[family_id]
        display_name, coda_types = RHYTHM_FAMILIES[family_id]
        families.append({
            "rhythm_family_id": family_id,
            "display_name": display_name,
            "published_coda_types": list(coda_types),
            "click_count": len(centroid) + 1,
            "centroid_normalized_intervals": centroid,
            "reference_sample_count": len(items),
            "reference_distances_to_centroid": sorted(mse(item, centroid) for item in items),
        })

    correct = 0
    total = 0
    correct_distances: dict[int, list[float]] = defaultdict(list)
    leave_one_out_records: list[tuple[int, float, bool]] = []
    confusion: Counter[tuple[int, int]] = Counter()
    by_click_count: dict[int, list[int]] = defaultdict(list)
    for family_id, centroid in centroids.items():
        by_click_count[len(centroid) + 1].append(family_id)
    for true_family, items in vectors.items():
        for index, item in enumerate(items):
            own_centroid = (
                [
                    (centroids[true_family][dimension] * len(items) - item[dimension]) / (len(items) - 1)
                    for dimension in range(len(item))
                ]
                if len(items) > 1 else centroids[true_family]
            )
            ranked = []
            for candidate in by_click_count[len(item) + 1]:
                candidate_centroid = own_centroid if candidate == true_family else centroids[candidate]
                ranked.append((mse(item, candidate_centroid), candidate))
            distance, predicted = min(ranked)
            total += 1
            confusion[(true_family, predicted)] += 1
            leave_one_out_records.append((len(item) + 1, distance, predicted == true_family))
            if predicted == true_family:
                correct += 1
                correct_distances[len(item) + 1].append(distance)

    thresholds = {
        str(clicks): _quantile(distances, 0.95)
        for clicks, distances in sorted(correct_distances.items())
    }
    accepted_records = [
        record for record in leave_one_out_records if record[1] <= thresholds[str(record[0])]
    ]
    accepted_correct = sum(record[2] for record in accepted_records)
    same_click_calibration = {}
    for clicks, metrics in sorted(calibration_values.items()):
        same_click_calibration[str(clicks)] = {
            "sample_count": len(metrics["duration_seconds"]),
            "duration_seconds_quantiles": {
                key: _quantile(metrics["duration_seconds"], fraction)
                for key, fraction in (("p10", .10), ("p25", .25), ("p50", .50), ("p75", .75), ("p90", .90))
            },
            "regularity_cv_quantiles": {
                "p33": _quantile(metrics["regularity_cv"], .33),
                "p67": _quantile(metrics["regularity_cv"], .67),
            },
            "absolute_normalized_slope_quantiles": {
                "p33": _quantile(metrics["absolute_normalized_slope"], .33),
                "p67": _quantile(metrics["absolute_normalized_slope"], .67),
            },
        }
    return {
        "schema_version": 1,
        "method": {
            "population": "EC1 rows only; all *-NOISE labels excluded",
            "rhythm_normalization": "Each ICI divided by total coda duration (sum of ICIs).",
            "comparison": "MSE against family mean, restricted to equal click count.",
            "percentile": "Percent of same-family reference distances greater than or equal to the query distance.",
            "abstention": "Per-click-count 95th percentile of correctly classified leave-one-out nearest-family MSE distances.",
            "measured_rhythm_calibration": "Duration, ICI-CV, and absolute normalized-slope quantiles, grouped only by equal click count in EC1.",
            "tempo_boundaries_seconds": [0.45, 0.61, 0.93, 1.08],
        },
        "source": {
            "file": "source/DominicaCodas.csv",
            "sha256": _sha256(SOURCE_DIR / "DominicaCodas.csv"),
            "license": "CC BY 4.0",
            "doi": "https://doi.org/10.5281/zenodo.10817697",
        },
        "row_counts": {
            "source": len(rows),
            "included": sum(len(items) for items in vectors.values()),
            "excluded_non_ec1": excluded_non_ec1,
            "excluded_noise_or_unmapped": excluded_noise,
            "excluded_invalid": excluded_invalid,
        },
        "validation": {
            "leave_one_out_examples": total,
            "leave_one_out_correct": correct,
            "leave_one_out_accuracy": correct / total,
            "post_abstention_accepted": len(accepted_records),
            "post_abstention_abstained": total - len(accepted_records),
            "post_abstention_coverage": len(accepted_records) / total,
            "post_abstention_accuracy_on_accepted": accepted_correct / len(accepted_records),
            "abstention_thresholds_by_click_count": thresholds,
            "confusion_counts": [
                {"true_family_id": true, "predicted_family_id": predicted, "count": count}
                for (true, predicted), count in sorted(confusion.items())
            ],
        },
        "same_click_count_calibration": same_click_calibration,
        "rhythm_families": families,
    }


def _group_exchanges(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    by_recording: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_recording[row["REC"][:6]].append(row)
    exchanges: list[list[dict[str, Any]]] = []
    for recording in sorted(by_recording):
        ordered = sorted(by_recording[recording], key=lambda row: (row["onset"], row["row_index"]))
        current: list[dict[str, Any]] = []
        previous_onset: float | None = None
        for row in ordered:
            if previous_onset is not None and row["onset"] - previous_onset >= EXCHANGE_GAP_SECONDS:
                if current:
                    exchanges.append(current)
                current = []
            current.append(row)
            previous_onset = row["onset"]
        if current:
            exchanges.append(current)
    return exchanges


def _position(index: int, size: int) -> str:
    if size <= 1:
        return "middle"
    fraction = index / (size - 1)
    if fraction <= 1 / 3:
        return "opening"
    if fraction >= 2 / 3:
        return "ending"
    return "middle"


def build_context_index(
    dialogue_rows: list[dict[str, str]], clusters: list[int], ornaments: list[int]
) -> dict[str, Any]:
    if not (len(dialogue_rows) == len(clusters) == len(ornaments)):
        raise ValueError("dialogue CSV, rhythms.p, and ornaments.p are not row aligned")
    prepared = []
    excluded_long = excluded_short = 0
    for row_index, (row, saved_cluster, ornament) in enumerate(zip(dialogue_rows, clusters, ornaments)):
        clicks = int(row["nClicks"])
        if clicks > 10:
            excluded_long += 1
        if clicks < 3:
            excluded_short += 1
        family = SAVED_CLUSTER_TO_PUBLISHED_FAMILY.get(saved_cluster)
        duration = float(row["Duration"])
        valid = 3 <= clicks <= 10 and family is not None and duration > 0
        prepared.append({
            **row,
            "row_index": row_index,
            "onset": float(row["TsTo"]),
            "duration": duration,
            "speaker": int(row["Whale"]),
            "clicks": clicks,
            "family": family,
            "tempo": tempo_type(duration) if valid else None,
            "ornament": bool(ornament),
            "valid": valid,
        })

    accum: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "examples": 0, "positions": Counter(), "followed": 0, "different_after": 0,
        "different_before": 0, "next_times": [], "next_families": Counter(), "ornaments": 0,
    })
    exchanges = _group_exchanges(prepared)
    multi_coda_exchanges = 0
    for exchange in exchanges:
        if len(exchange) > 1:
            multi_coda_exchanges += 1
        for index, row in enumerate(exchange):
            if not row["valid"]:
                continue
            key = f'{row["family"]}:{row["tempo"]}'
            bucket = accum[key]
            bucket["examples"] += 1
            bucket["positions"][_position(index, len(exchange))] += 1
            bucket["ornaments"] += int(row["ornament"])
            if index > 0:
                previous = exchange[index - 1]
                bucket["different_before"] += int(previous["speaker"] != row["speaker"])
            if index + 1 < len(exchange):
                following = exchange[index + 1]
                bucket["followed"] += 1
                bucket["different_after"] += int(following["speaker"] != row["speaker"])
                bucket["next_times"].append(following["onset"] - row["onset"])
                if following["valid"]:
                    bucket["next_families"][following["family"]] += 1

    combinations = {}
    for key, bucket in sorted(accum.items()):
        count = bucket["examples"]
        positions = bucket["positions"]
        combinations[key] = {
            "rhythm_family_id": int(key.split(":")[0]),
            "tempo_type": int(key.split(":")[1]),
            "example_count": count,
            "position_frequencies": {
                name: positions[name] / count for name in ("opening", "middle", "ending")
            },
            "followed_by_coda_frequency": bucket["followed"] / count,
            "followed_by_different_speaker_frequency": bucket["different_after"] / count,
            "preceded_by_different_speaker_frequency": bucket["different_before"] / count,
            "median_time_to_following_coda_seconds": (
                statistics.median(bucket["next_times"]) if bucket["next_times"] else None
            ),
            "most_common_next_rhythm_patterns": [
                {
                    "rhythm_family_id": family,
                    "rhythm_family": RHYTHM_FAMILIES[family][0],
                    "count": next_count,
                }
                for family, next_count in bucket["next_families"].most_common(3)
            ],
            "ornamentation": {
                "available": True,
                "count": bucket["ornaments"],
                "frequency": bucket["ornaments"] / count,
                "status": "row-aligned repository-derived annotation",
            },
            "chorusing_change": {
                "available": False,
                "reason": "The paper reports an aggregate association, but the repository does not provide a validated per-row chorusing-change label.",
            },
        }

    return {
        "schema_version": 1,
        "source": {
            "files": {
                name: {"sha256": _sha256(SOURCE_DIR / name)}
                for name in ("sperm-whale-dialogues.csv", "rhythms.p", "ornaments.p")
            },
            "license": "CC BY 4.0",
            "doi": "https://doi.org/10.5281/zenodo.10817697",
        },
        "alignment_validation": {
            "csv_rows": len(dialogue_rows),
            "rhythm_entries": len(clusters),
            "ornament_entries": len(ornaments),
            "row_alignment_accepted": True,
            "paper_reported_rows": EXPECTED_DIALOGUE_ROWS_IN_PAPER,
            "public_release_shortfall": EXPECTED_DIALOGUE_ROWS_IN_PAPER - len(dialogue_rows),
            "resolution": "Use only the 3,840 mutually aligned public rows; the absent 108 rows are not inferred.",
            "saved_cluster_to_published_family": SAVED_CLUSTER_TO_PUBLISHED_FAMILY,
        },
        "scope": {
            "excluded_over_10_clicks": excluded_long,
            "excluded_under_3_clicks": excluded_short,
            "included_rows": len(dialogue_rows) - excluded_long - excluded_short,
        },
        "grouping": {
            "recording_key": "first six characters of REC, matching repository notebooks",
            "ordering": "ascending TsTo within recording key",
            "exchange_boundary": "gap between consecutive coda onsets greater than or equal to 8 seconds",
            "position_bins": "normalized row position: <=1/3 opening, >=2/3 ending, otherwise middle",
            "important_note": "The notebooks use the same six-character key and eight-second window for speaker-specific call sequences. This index applies the disclosed eight-second boundary across all speakers to support multi-speaker exchange statistics; this is a dataset-derived operational definition, not a semantic annotation.",
        },
        "exchange_counts": {
            "all": len(exchanges),
            "multi_coda": multi_coda_exchanges,
        },
        "combinations": combinations,
    }


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build() -> tuple[dict[str, Any], dict[str, Any]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dominica_rows = _read_csv(SOURCE_DIR / "DominicaCodas.csv")
    dialogue_rows = _read_csv(SOURCE_DIR / "sperm-whale-dialogues.csv")
    rhythm_index = build_rhythm_index(dominica_rows)
    context_index = build_context_index(
        dialogue_rows,
        _load_safe_list(SOURCE_DIR / "rhythms.p"),
        _load_safe_list(SOURCE_DIR / "ornaments.p"),
    )
    _write_json(RHYTHM_INDEX_PATH, rhythm_index)
    _write_json(CONTEXT_INDEX_PATH, context_index)
    VALIDATION_PATH.write_text(
        "# Coda Code validation\n\n"
        f"- Included EC1 rhythm examples: {rhythm_index['row_counts']['included']:,}\n"
        f"- Leave-one-out nearest-family accuracy: {rhythm_index['validation']['leave_one_out_accuracy']:.3%} "
        f"({rhythm_index['validation']['leave_one_out_correct']:,}/{rhythm_index['validation']['leave_one_out_examples']:,})\n"
        f"- Post-abstention coverage: {rhythm_index['validation']['post_abstention_coverage']:.3%} "
        f"({rhythm_index['validation']['post_abstention_accepted']:,}/{rhythm_index['validation']['leave_one_out_examples']:,})\n"
        f"- Post-abstention accuracy among accepted examples: {rhythm_index['validation']['post_abstention_accuracy_on_accepted']:.3%}\n"
        f"- Aligned dialogue rows used: {context_index['scope']['included_rows']:,}/3,840\n"
        "- Paper/release discrepancy: paper states 3,948 dialogue codas; the released CSV and both aligned annotation lists contain 3,840. The absent 108 are not reconstructed.\n"
        "- Abstention: nearest rhythm MSE must be at or below the click-count-specific 95th percentile of correctly classified leave-one-out distances.\n"
        "- Context roles are deterministic dataset-derived hypotheses, not translations, probabilities, identities, emotions, or intent labels.\n",
        encoding="utf-8",
    )
    return rhythm_index, context_index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.parse_args()
    rhythm, context = build()
    print(json.dumps({
        "rhythm_examples": rhythm["row_counts"]["included"],
        "leave_one_out_accuracy": rhythm["validation"]["leave_one_out_accuracy"],
        "dialogue_examples": context["scope"]["included_rows"],
        "combinations": len(context["combinations"]),
    }, indent=2))


if __name__ == "__main__":
    main()
