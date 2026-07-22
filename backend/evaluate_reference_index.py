"""Evaluate pairwise geometry of the pooled WhAM DSWP reference index."""

import argparse
import json
import math
import statistics
from pathlib import Path

from reference_similarity import cosine_similarity


PROJECT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INDEX_PATH = PROJECT_DIR / "references" / "reference_index.json"
EXACT_DUPLICATE_TOLERANCE = 1e-12
NEAR_DUPLICATE_THRESHOLD = 0.9999


def percentile(sorted_values: list[float], percent: float) -> float:
    if not sorted_values:
        raise ValueError("cannot calculate a percentile of an empty collection")
    position = (len(sorted_values) - 1) * percent / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    fraction = position - lower
    return sorted_values[lower] * (1 - fraction) + sorted_values[upper] * fraction


def evaluate(index: dict) -> dict:
    recordings = index.get("recordings", [])
    if len(recordings) < 3:
        raise ValueError("at least three reference recordings are required")

    similarities = []
    neighbors = {recording["id"]: [] for recording in recordings}
    duplicate_pairs = []
    for left_index, left in enumerate(recordings):
        for right in recordings[left_index + 1 :]:
            score = cosine_similarity(left["embedding"], right["embedding"])
            similarities.append(score)
            neighbors[left["id"]].append((right["id"], score))
            neighbors[right["id"]].append((left["id"], score))
            if abs(1.0 - score) <= EXACT_DUPLICATE_TOLERANCE:
                duplicate_pairs.append({"left": left["id"], "right": right["id"], "score": score, "kind": "exact"})
            elif score >= NEAR_DUPLICATE_THRESHOLD:
                duplicate_pairs.append({"left": left["id"], "right": right["id"], "score": score, "kind": "near"})

    sorted_scores = sorted(similarities)
    nearest = []
    for recording in recordings:
        ranked = sorted(neighbors[recording["id"]], key=lambda item: item[1], reverse=True)
        nearest.append(
            {
                "reference_id": recording["id"],
                "nearest_reference_id": ranked[0][0],
                "nearest_neighbor_score": ranked[0][1],
                "second_nearest_reference_id": ranked[1][0],
                "second_nearest_score": ranked[1][1],
                "first_second_gap": ranked[0][1] - ranked[1][1],
            }
        )

    score_range = sorted_scores[-1] - sorted_scores[0]
    recommendation = {
        "display": "raw cosine similarity plus empirical percentile rank",
        "relative_score_definition": (
            "Empirical percentile rank is the percentage of all non-self reference-pair cosine "
            "scores less than or equal to the query/reference score."
        ),
        "reason": (
            f"The measured raw cosine range is {score_range:.6f}; percentile context exposes "
            "relative position within this reference index while retaining the unaltered cosine value."
        ),
        "warning": "Neither value is a probability, confidence, semantic match, or biological classification.",
    }
    return {
        "recording_count": len(recordings),
        "non_self_pair_count": len(sorted_scores),
        "summary": {
            "minimum": sorted_scores[0],
            "maximum": sorted_scores[-1],
            "mean": statistics.fmean(sorted_scores),
            "median": statistics.median(sorted_scores),
            "percentile_5": percentile(sorted_scores, 5),
            "percentile_95": percentile(sorted_scores, 95),
        },
        "nearest_neighbors": nearest,
        "duplicate_definition": {
            "exact": f"abs(1 - cosine) <= {EXACT_DUPLICATE_TOLERANCE}",
            "near": f"cosine >= {NEAR_DUPLICATE_THRESHOLD} and not exact",
        },
        "exact_or_near_duplicates": duplicate_pairs,
        "recommendation": recommendation,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX_PATH)
    args = parser.parse_args()
    with args.index.open(encoding="utf-8") as source:
        index = json.load(source)
    print(json.dumps(evaluate(index), indent=2))


if __name__ == "__main__":
    main()
