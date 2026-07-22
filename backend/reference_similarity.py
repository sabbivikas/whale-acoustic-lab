"""Validated cosine ranking for pooled WhAM reference embeddings."""

import math
from bisect import bisect_right
from typing import Any


EXPECTED_DIMENSION = 1280


def _validated_vector(vector: Any, name: str) -> list[float]:
    if not isinstance(vector, list) or len(vector) != EXPECTED_DIMENSION:
        actual = len(vector) if isinstance(vector, list) else "non-list"
        raise ValueError(f"{name} must contain {EXPECTED_DIMENSION} values; received {actual}")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in vector):
        raise ValueError(f"{name} contains a non-numeric or non-finite value")
    return [float(value) for value in vector]


def cosine_similarity(left: Any, right: Any) -> float:
    left_values = _validated_vector(left, "query embedding")
    right_values = _validated_vector(right, "reference embedding")
    left_norm = math.sqrt(math.fsum(value * value for value in left_values))
    right_norm = math.sqrt(math.fsum(value * value for value in right_values))
    if left_norm == 0 or right_norm == 0:
        raise ValueError("cosine similarity is undefined for a zero-length vector")
    dot_product = math.fsum(a * b for a, b in zip(left_values, right_values))
    return max(-1.0, min(1.0, dot_product / (left_norm * right_norm)))


def reference_pair_scores(reference_index: dict) -> list[float]:
    recordings = reference_index.get("recordings")
    if not isinstance(recordings, list) or len(recordings) < 2:
        raise ValueError("reference index must contain at least two recordings")
    scores = [
        cosine_similarity(left.get("embedding"), right.get("embedding"))
        for index, left in enumerate(recordings)
        for right in recordings[index + 1 :]
    ]
    return sorted(scores)


def empirical_percentile(score: float, sorted_pair_scores: list[float]) -> float:
    if not sorted_pair_scores:
        raise ValueError("reference-pair similarity distribution is empty")
    if not math.isfinite(score):
        raise ValueError("similarity score must be finite")
    return 100.0 * bisect_right(sorted_pair_scores, score) / len(sorted_pair_scores)


def rank_references(
    query_embedding: Any,
    reference_index: dict,
    pair_scores: list[float] | None = None,
) -> list[dict]:
    query = _validated_vector(query_embedding, "query embedding")
    recordings = reference_index.get("recordings")
    if not isinstance(recordings, list) or not recordings:
        raise ValueError("reference index contains no recordings")
    distribution = pair_scores if pair_scores is not None else reference_pair_scores(reference_index)

    matches = []
    for recording in recordings:
        matches.append(
            {
                "reference_id": recording["id"],
                "original_dswp_filename": recording["file"].split("/")[-1],
                "source_url": recording["source_url"],
                "raw_cosine_similarity": cosine_similarity(query, recording.get("embedding")),
                "duration_seconds": recording["duration_seconds"],
                "sample_rate_hz": recording["sample_rate_hz"],
                "license": recording["license"],
                "dataset_location": recording["dataset_location"],
                "collection_period": recording["collection_period"],
            }
        )
    for match in matches:
        match["reference_percentile"] = empirical_percentile(
            match["raw_cosine_similarity"], distribution
        )
    return sorted(matches, key=lambda match: match["raw_cosine_similarity"], reverse=True)
