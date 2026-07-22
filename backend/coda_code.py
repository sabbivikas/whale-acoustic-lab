"""Local, evidence-bounded sperm-whale rhythm and interaction hypotheses."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Sequence

from measured_rhythm import describe_measured_rhythm


RHYTHM_FAMILIES = {
    0: ("3D", ("3D",)),
    1: ("3R", ("3R",)),
    2: ("4D", ("4D",)),
    3: ("4R family", ("4R1", "4R2")),
    4: ("1+3 family", ("1+31", "1+32")),
    5: ("1+1+3", ("1+1+3",)),
    6: ("5R family", ("5R1", "5R2", "5R3")),
    7: ("2+3", ("2+3",)),
    8: ("6R", ("6R",)),
    9: ("6i", ("6i",)),
    10: ("7D family", ("7D1", "7D2")),
    11: ("7i", ("7i",)),
    12: ("8D/R family", ("8D", "8R")),
    13: ("8i", ("8i",)),
    14: ("9R", ("9R",)),
    15: ("9i", ("9i",)),
    16: ("10R", ("10R",)),
    17: ("10i", ("10i",)),
}
CODA_TYPE_TO_FAMILY = {
    coda_type: family_id
    for family_id, (_, coda_types) in RHYTHM_FAMILIES.items()
    for coda_type in coda_types
}
TEMPO_BOUNDARIES_SECONDS = (0.45, 0.61, 0.93, 1.08)
MIN_CONTEXT_EXAMPLES = 20
NO_LITERAL_TRANSLATION = (
    "This is an evidence-based conversational-role hypothesis, not a literal translation. "
    "It does not identify a whale, emotion, clan, exact intent, or meaning."
)


class CodaCodeError(ValueError):
    """Raised when click timing cannot be compared with the published index."""


def normalize_intervals(intervals: Sequence[float]) -> list[float]:
    values = [float(value) for value in intervals]
    if not values or any(not math.isfinite(value) or value <= 0 for value in values):
        raise CodaCodeError("inter-click intervals must be finite positive values")
    duration = sum(values)
    if duration <= 0:
        raise CodaCodeError("coda duration must be positive")
    return [value / duration for value in values]


def mse(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or not left:
        raise CodaCodeError("rhythm vectors must have the same non-zero dimension")
    return sum((float(a) - float(b)) ** 2 for a, b in zip(left, right)) / len(left)


def tempo_type(duration_seconds: float) -> int:
    duration = float(duration_seconds)
    if not math.isfinite(duration) or duration <= 0:
        raise CodaCodeError("coda duration must be a finite positive value")
    for index, boundary in enumerate(TEMPO_BOUNDARIES_SECONDS):
        if duration < boundary:
            return index
    return 4


def empirical_closeness_percentile(distance: float, reference_distances: Sequence[float]) -> float:
    """Percent of reference distances at least as large; higher means closer."""
    if not reference_distances:
        raise CodaCodeError("reference distance distribution is empty")
    return 100.0 * sum(value >= distance for value in reference_distances) / len(reference_distances)


def load_coda_code_index(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as source:
        index = json.load(source)
    if index.get("schema_version") != 1 or not index.get("rhythm_families"):
        raise CodaCodeError("invalid or empty coda-code reference index")
    return index


def match_rhythm(
    intervals: Sequence[float],
    index: dict[str, Any],
    *,
    allow_abstention: bool = True,
) -> dict[str, Any]:
    normalized = normalize_intervals(intervals)
    click_count = len(normalized) + 1
    candidates = [
        family for family in index["rhythm_families"] if family["click_count"] == click_count
    ]
    if not candidates:
        return {
            "status": "no_close_published_pattern",
            "message": "No close published pattern found",
            "estimated_click_count": click_count,
            "normalized_inter_click_intervals": normalized,
            "matches": [],
            "best_vs_second_best_margin": None,
            "abstention_reason": "No published EC1 rhythm family has this click count.",
        }

    matches = []
    for family in candidates:
        distance = mse(normalized, family["centroid_normalized_intervals"])
        matches.append(
            {
                "rhythm_family_id": family["rhythm_family_id"],
                "rhythm_family": family["display_name"],
                "published_coda_types": family["published_coda_types"],
                "raw_mse_distance": distance,
                "empirical_closeness_percentile": empirical_closeness_percentile(
                    distance, family["reference_distances_to_centroid"]
                ),
                "reference_sample_count": family["reference_sample_count"],
            }
        )
    matches.sort(key=lambda item: (item["raw_mse_distance"], item["rhythm_family_id"]))
    margin = (
        matches[1]["raw_mse_distance"] - matches[0]["raw_mse_distance"]
        if len(matches) > 1
        else None
    )
    threshold = index["validation"]["abstention_thresholds_by_click_count"].get(
        str(click_count)
    )
    abstain = allow_abstention and (
        threshold is None or matches[0]["raw_mse_distance"] > float(threshold)
    )
    return {
        "status": "no_close_published_pattern" if abstain else "matched",
        "message": "No close published pattern found" if abstain else "Published pattern match found",
        "estimated_click_count": click_count,
        "normalized_inter_click_intervals": normalized,
        "matches": matches[:3],
        "best_vs_second_best_margin": margin,
        "abstention_threshold_mse": threshold,
        "abstention_reason": (
            "The nearest MSE distance exceeds the leave-one-out 95th-percentile threshold."
            if abstain
            else None
        ),
        "percentile_definition": (
            "The percentage of same-family reference codas whose distance to the family "
            "centroid is greater than or equal to this call's distance."
        ),
    }


def _evidence_level(sample_count: int, strongest_effect: float) -> str:
    if sample_count >= 100 and strongest_effect >= 0.25:
        return "strong dataset support"
    if sample_count >= 40 and strongest_effect >= 0.15:
        return "moderate dataset support"
    return "limited dataset support"


def interpret_conversational_role(
    rhythm_match: dict[str, Any],
    tempo: int | None,
    context_index: dict[str, Any],
) -> dict[str, Any]:
    """Apply deterministic, disclosed rules to public dialogue statistics."""
    observed = {
        "estimated_clicks": rhythm_match["estimated_click_count"],
        "rhythm_family": None,
        "tempo_type": tempo,
    }
    unclear = {
        "role": "Unclear",
        "evidence_level": "insufficient evidence",
        "explanation": (
            "The public timing and dialogue data do not provide enough consistent evidence "
            "for a conversational-role hypothesis."
        ),
        "supporting_statistics": [],
        "rule_triggered": "unclear_fallback",
    }
    if rhythm_match["status"] != "matched" or not rhythm_match["matches"]:
        return _interpretation_response(observed, unclear)

    best = rhythm_match["matches"][0]
    observed["rhythm_family"] = best["rhythm_family"]
    key = f'{best["rhythm_family_id"]}:{tempo}'
    stats = context_index.get("combinations", {}).get(key)
    if not stats or stats["example_count"] < MIN_CONTEXT_EXAMPLES:
        unclear["explanation"] = (
            f"Only {0 if not stats else stats['example_count']} validated dialogue examples "
            "share this rhythm and tempo; at least 20 are required."
        )
        return _interpretation_response(observed, unclear)

    opening = stats["position_frequencies"]["opening"]
    middle = stats["position_frequencies"]["middle"]
    ending = stats["position_frequencies"]["ending"]
    followed = stats["followed_by_coda_frequency"]
    different_after = stats["followed_by_different_speaker_frequency"]
    different_before = stats["preceded_by_different_speaker_frequency"]
    rules: list[tuple[str, float, str, str, list[dict[str, Any]]]] = []
    if opening >= 0.45 and opening - ending >= 0.15:
        rules.append(("Exchange opener", opening - ending, "opening_bias", "Calls with this structure appeared disproportionately near the opening of measured exchanges.", [
            {"measurement": "opening frequency", "value": opening},
            {"measurement": "ending frequency", "value": ending},
        ]))
    if ending >= 0.45 and ending - opening >= 0.15:
        rules.append(("Exchange closer", ending - opening, "ending_bias", "Calls with this structure appeared disproportionately near the ending of measured exchanges.", [
            {"measurement": "ending frequency", "value": ending},
            {"measurement": "opening frequency", "value": opening},
        ]))
    if different_before >= 0.65:
        rules.append(("Possible response", different_before - 0.5, "different_speaker_before", "Calls with this structure were frequently preceded by a different annotated speaker.", [
            {"measurement": "preceded by a different speaker", "value": different_before},
        ]))
    if followed >= 0.75 and different_after >= 0.60:
        rules.append(("Invites or maintains another turn", min(followed - 0.5, different_after - 0.5), "different_speaker_after", "Calls with this structure frequently appeared inside active exchanges and were often followed by a different annotated speaker.", [
            {"measurement": "followed by another coda", "value": followed},
            {"measurement": "followed by a different speaker", "value": different_after},
            {"measurement": "median time to following coda (seconds)", "value": stats["median_time_to_following_coda_seconds"]},
        ]))
    if middle >= 0.45 and followed >= 0.70:
        rules.append(("Exchange continuation", min(middle - 1 / 3, followed - 0.5), "middle_and_followed", "Calls with this structure were concentrated in the middle of exchanges and were usually followed by another coda.", [
            {"measurement": "middle frequency", "value": middle},
            {"measurement": "followed by another coda", "value": followed},
        ]))

    if not rules:
        unclear["supporting_statistics"] = [
            {"measurement": "validated examples", "value": stats["example_count"]},
            {"measurement": "opening / middle / ending", "value": [opening, middle, ending]},
        ]
        return _interpretation_response(observed, unclear)
    rules.sort(key=lambda item: (-item[1], item[0]))
    if len(rules) > 1 and abs(rules[0][1] - rules[1][1]) < 0.05:
        unclear["explanation"] = "Multiple conversational-role rules had similarly strong support, so the result is left unclear."
        unclear["supporting_statistics"] = [
            {"measurement": "competing rules", "value": [rules[0][0], rules[1][0]]}
        ]
        return _interpretation_response(observed, unclear)

    role, effect, rule, explanation, supporting = rules[0]
    supporting.insert(0, {"measurement": "validated examples", "value": stats["example_count"]})
    hypothesis = {
        "role": role,
        "evidence_level": _evidence_level(stats["example_count"], effect),
        "explanation": explanation,
        "supporting_statistics": supporting,
        "rule_triggered": rule,
    }
    return _interpretation_response(observed, hypothesis)


def _interpretation_response(observed: dict[str, Any], hypothesis: dict[str, Any]) -> dict[str, Any]:
    analogies = {
        "Exchange opener": "In human terms, this could feel like: I’m here—shall we begin?",
        "Exchange continuation": "In human terms, this could feel like: I’m still here; let’s keep this exchange going.",
        "Possible response": "In human terms, this could feel like: I heard a turn, and this may be part of the reply.",
        "Invites or maintains another turn": "In human terms, this could feel like: I’m here—are you still with me?",
        "Exchange closer": "In human terms, this could feel like: This exchange may be winding down.",
        "Associated with a chorusing transition": "In human terms, this could feel like: The interaction may be shifting.",
        "Unclear": "In human terms, no responsible conversational analogy is supported for this call.",
    }
    return {
        "observed": observed,
        "interaction_hypothesis": hypothesis,
        "creative_analogy": {
            "text": analogies[hypothesis["role"]],
            "label": "Creative analogy, not a literal translation",
        },
        "scientific_limits": NO_LITERAL_TRANSLATION,
        "scientific_sources": [
            "https://github.com/pratyushasharma/sw-combinatoriality",
            "https://doi.org/10.5281/zenodo.10817697",
            "https://www.nature.com/articles/s41467-024-47221-8",
        ],
    }


def analyze_coda_code(
    intervals: Sequence[float],
    rhythm_index: dict[str, Any],
    context_index: dict[str, Any],
    estimated_click_count: int | None = None,
) -> dict[str, Any]:
    values = [float(value) for value in intervals]
    click_count = estimated_click_count if estimated_click_count is not None else len(values) + 1
    if not values:
        rhythm = {
            "status": "no_close_published_pattern",
            "message": "No close published pattern found",
            "estimated_click_count": click_count,
            "normalized_inter_click_intervals": [],
            "matches": [],
            "best_vs_second_best_margin": None,
            "abstention_reason": "At least two estimated clicks are required.",
        }
        tempo = None
    else:
        duration = sum(values)
        rhythm = match_rhythm(values, rhythm_index)
        rhythm["estimated_click_count"] = click_count
        tempo = tempo_type(duration)
    return {
        "published_rhythm_match": rhythm,
        "published_tempo_type": tempo,
        "measured_rhythm": describe_measured_rhythm(
            values, click_count, rhythm, rhythm_index
        ),
        "interpretation": interpret_conversational_role(rhythm, tempo, context_index),
    }
