"""Deterministic, non-semantic descriptions of measured coda rhythm."""

from __future__ import annotations

import math
import statistics
from typing import Any, Sequence


ANALOGY_LABEL = "Creative musical analogy based only on rhythm — not literal whale meaning"
_NUMBER_WORDS = {
    2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
    7: "seven", 8: "eight", 9: "nine", 10: "ten",
}


def _quantile(values: Sequence[float], fraction: float) -> float:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        raise ValueError("cannot calculate a quantile of an empty sequence")
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def normalized_linear_slope(values: Sequence[float]) -> tuple[float, float]:
    """Return OLS slope divided by mean and the regression R-squared."""
    ys = [float(value) for value in values]
    if len(ys) < 2 or statistics.fmean(ys) == 0:
        return 0.0, 0.0
    xs = list(range(len(ys)))
    mean_x = statistics.fmean(xs)
    mean_y = statistics.fmean(ys)
    denominator = sum((value - mean_x) ** 2 for value in xs)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denominator
    predicted = [mean_y + slope * (x - mean_x) for x in xs]
    total = sum((value - mean_y) ** 2 for value in ys)
    residual = sum((value - estimate) ** 2 for value, estimate in zip(ys, predicted))
    r_squared = 1.0 if total == 0 else max(0.0, 1.0 - residual / total)
    return slope / mean_y, r_squared


def calibration_metrics(intervals: Sequence[float]) -> dict[str, float]:
    values = [float(value) for value in intervals]
    mean = statistics.fmean(values)
    slope, _ = normalized_linear_slope(values)
    return {
        "duration_seconds": sum(values),
        "regularity_cv": statistics.pstdev(values) / mean if len(values) > 1 else 0.0,
        "absolute_normalized_slope": abs(slope),
    }


def _calibration(index: dict[str, Any], click_count: int) -> dict[str, Any]:
    supplied = index.get("same_click_count_calibration", {}).get(str(click_count))
    if supplied:
        return supplied
    # Conservative documented fallbacks keep old/local indexes readable.
    return {
        "sample_count": 0,
        "duration_seconds_quantiles": {"p10": 0.35, "p25": 0.55, "p50": 0.85, "p75": 1.15, "p90": 1.60},
        "regularity_cv_quantiles": {"p33": 0.12, "p67": 0.30},
        "absolute_normalized_slope_quantiles": {"p33": 0.035, "p67": 0.10},
    }


def _grouping(values: list[float], regularity: str, duration: float, calibration: dict[str, Any]) -> tuple[str, int]:
    median = statistics.median(values)
    deviations = [abs(value - median) for value in values]
    mad = statistics.median(deviations)
    separators = [
        value for value in values
        if value >= 1.75 * median and (mad == 0 or value > median + 2.5 * mad)
    ]
    if separators:
        return "separated into groups", len(separators) + 1
    if duration <= calibration["duration_seconds_quantiles"]["p10"] and regularity != "irregular":
        return "tightly clustered", 1
    if regularity == "regular":
        return "evenly spaced", 1
    return "irregular", 1


def _direction(values: list[float], calibration: dict[str, Any]) -> tuple[str, float, float]:
    slope, r_squared = normalized_linear_slope(values)
    even_limit = calibration["absolute_normalized_slope_quantiles"]["p33"]
    if abs(slope) <= even_limit:
        return "approximately even", slope, r_squared
    if r_squared >= 0.60:
        return ("accelerating" if slope < 0 else "decelerating"), slope, r_squared
    return "mixed", slope, r_squared


def _headline(
    click_count: int,
    pace: str,
    regularity: str,
    direction: str,
    grouping: str,
    group_count: int,
    unusual: bool,
    ending_change: float,
) -> str:
    count = _NUMBER_WORDS.get(click_count, str(click_count))
    article = "An" if unusual or direction in {"accelerating", "approximately even"} else "A"
    if grouping == "separated into groups":
        groups = _NUMBER_WORDS.get(group_count, str(group_count))
        return f"A {count}-click coda divided into {groups} rhythmic groups"
    if unusual and ending_change <= -30:
        return f"An unusual {count}-click coda with a tightly grouped ending"
    if direction in {"accelerating", "decelerating"}:
        prefix = "unusual " if unusual else ""
        return f"{article} {prefix}{direction} {count}-click coda"
    if regularity == "regular":
        pace_prefix = f"{pace}, " if pace in {"fast", "slow"} else ""
        return f"A {pace_prefix}regular {count}-click coda"
    if unusual:
        return f"An unusual {count}-click coda with irregular timing"
    return f"A {count}-click coda with {regularity} timing"


def describe_measured_rhythm(
    intervals: Sequence[float],
    click_count: int,
    rhythm_match: dict[str, Any],
    rhythm_index: dict[str, Any],
) -> dict[str, Any]:
    values = [float(value) for value in intervals]
    if not values:
        return {
            "headline": "No measurable coda rhythm",
            "explanation": "At least two estimated clicks are needed to measure a rhythm.",
            "creative_analogy": {"text": "No musical analogy is available.", "label": ANALOGY_LABEL},
            "measurements": {},
            "sequence_descriptor": "unmeasured phrase",
        }

    calibration = _calibration(rhythm_index, click_count)
    duration = sum(values)
    mean = statistics.fmean(values)
    median = statistics.median(values)
    cv = statistics.pstdev(values) / mean if len(values) > 1 else 0.0
    regularity_limits = calibration["regularity_cv_quantiles"]
    regularity = "regular" if cv <= regularity_limits["p33"] else "variable" if cv <= regularity_limits["p67"] else "irregular"
    direction, slope, r_squared = _direction(values, calibration)
    window = max(1, len(values) // 2)
    beginning_mean = statistics.fmean(values[:window])
    ending_mean = statistics.fmean(values[-window:])
    ending_change = 100.0 * (ending_mean - beginning_mean) / beginning_mean
    if abs(ending_change) < 10:
        pace_comparison = "about the same pace"
    elif ending_change < 0:
        pace_comparison = f"{abs(ending_change):.1f}% faster at the end"
    else:
        pace_comparison = f"{ending_change:.1f}% slower at the end"
    duration_quantiles = calibration["duration_seconds_quantiles"]
    pace = "fast" if duration <= duration_quantiles["p25"] else "slow" if duration >= duration_quantiles["p75"] else "mid-range"
    grouping, group_count = _grouping(values, regularity, duration, calibration)
    unusual = rhythm_match.get("status") != "matched"
    typicality = "unusual — outside the accepted same-click-count EC1 reference range" if unusual else "common — within the accepted same-click-count EC1 reference range"
    best = (rhythm_match.get("matches") or [None])[0]
    nearest_family = None if best is None else {
        "name": best["rhythm_family"],
        "published_coda_types": best["published_coda_types"],
        "match_strength": "weak" if unusual else "accepted",
        "outside_accepted_range": unusual,
        "raw_mse_distance": best["raw_mse_distance"],
        "abstention_threshold_mse": rhythm_match.get("abstention_threshold_mse"),
    }
    headline = _headline(click_count, pace, regularity, direction, grouping, group_count, unusual, ending_change)
    direction_sentence = {
        "accelerating": "Its intervals shorten near the ending, producing an accelerating rhythm.",
        "decelerating": "Its intervals lengthen near the ending, producing a decelerating rhythm.",
        "approximately even": "Its intervals remain approximately even from beginning to end.",
        "mixed": "Its intervals change in a mixed pattern rather than moving steadily faster or slower.",
    }[direction]
    family_sentence = "No same-click-count published family is available for comparison."
    if nearest_family:
        family_sentence = (
            f"Its timing is closest to the published {nearest_family['name']} family, "
            + ("but the match is outside the accepted reference range." if unusual else "and the match is within the accepted reference range.")
        )
    explanation = f"This coda contains {click_count} estimated clicks over {duration:.3f} seconds. {direction_sentence} {family_sentence}"
    analogy = {
        "accelerating": "In human musical terms, it resembles a phrase that gathers speed before stopping.",
        "decelerating": "In human musical terms, it resembles a phrase that gradually stretches out before stopping.",
        "approximately even": "In human musical terms, it resembles a phrase played over a steady beat.",
        "mixed": "In human musical terms, it resembles a phrase with uneven changes in pace.",
    }[direction]
    if grouping == "separated into groups":
        analogy = "In human musical terms, it resembles a phrase divided into distinct rhythmic groups."

    descriptor = (
        "grouped phrase" if grouping == "separated into groups"
        else "accelerating phrase" if direction == "accelerating"
        else "decelerating phrase" if direction == "decelerating"
        else "regular phrase" if regularity == "regular"
        else "irregular phrase"
    )
    return {
        "headline": headline,
        "explanation": explanation,
        "creative_analogy": {"text": analogy, "label": ANALOGY_LABEL},
        "measurements": {
            "click_count": click_count,
            "total_duration_seconds": duration,
            "mean_inter_click_interval_seconds": mean,
            "median_inter_click_interval_seconds": median,
            "regularity": regularity,
            "inter_click_interval_coefficient_of_variation": cv,
            "timing_direction": direction,
            "normalized_linear_slope": slope,
            "linear_trend_r_squared": r_squared,
            "click_grouping": grouping,
            "rhythmic_group_count": group_count,
            "beginning_mean_interval_seconds": beginning_mean,
            "ending_mean_interval_seconds": ending_mean,
            "beginning_vs_ending_pace": pace_comparison,
            "ending_interval_change_percent": ending_change,
            "same_click_count_ec1_timing": typicality,
            "same_click_count_ec1_sample_count": calibration["sample_count"],
            "duration_pace": pace,
        },
        "nearest_published_family": nearest_family,
        "sequence_descriptor": descriptor,
        "method_note": (
            "Regularity uses ICI coefficient of variation; direction uses normalized linear slope "
            "with R² >= 0.60; grouping uses a robust long-gap rule. EC1 comparisons use only codas "
            "with the same click count."
        ),
    }
