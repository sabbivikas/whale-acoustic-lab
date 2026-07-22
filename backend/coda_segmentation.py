"""Evidence-derived segmentation of estimated click onsets into probable codas."""

from __future__ import annotations

from typing import Any, Sequence

from coda_code import analyze_coda_code


ESTIMATE_NOTE = (
    "Coda boundaries and conversational roles are algorithmic estimates derived from waveform "
    "click onsets and public dataset statistics; they are not literal translations."
)


def _boundary_status(gap: float, thresholds: dict[str, Any]) -> str:
    if gap > thresholds["clear_boundary_seconds"]:
        return "clear_estimated_boundary"
    return "ambiguous_estimated_boundary"


def _sequence_explanation(segments: list[dict[str, Any]], rejected: list[dict[str, Any]]) -> dict:
    if not segments:
        measured = "No probable codas met the published 3–10-click scope and boundary rules."
        role_text = "Possible conversational role: unclear."
        pattern = "no_valid_sequence"
    elif len(segments) == 1:
        role = segments[0]["analysis"]["interpretation"]["interaction_hypothesis"]["role"]
        descriptor = segments[0]["analysis"]["measured_rhythm"]["sequence_descriptor"]
        measured = f"We detected one probable coda: a {descriptor}."
        role_text = f"Possible conversational role: {role.lower()}."
        pattern = "single_probable_coda"
    else:
        roles = [
            segment["analysis"]["interpretation"]["interaction_hypothesis"]["role"]
            for segment in segments
        ]
        informative = [role for role in roles if role != "Unclear"]
        descriptors = [segment["analysis"]["measured_rhythm"]["sequence_descriptor"] for segment in segments]
        if len(descriptors) == 2:
            phrase_list = f"a {descriptors[0]} followed by a {descriptors[1]}"
        elif len(descriptors) == 3:
            words = [descriptor.replace(" phrase", "") for descriptor in descriptors]
            article = lambda word: "an" if word[:1].lower() in "aeiou" else "a"
            phrase_list = (
                f"{article(words[0])} {words[0]} opening phrase, "
                f"{article(words[1])} {words[1]} middle phrase, and "
                f"{article(words[2])} {words[2]} ending phrase"
            )
        else:
            phrase_list = ", ".join(f"a {descriptor}" for descriptor in descriptors[:-1]) + f", and a {descriptors[-1]}"
        number = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven"}.get(len(segments), str(len(segments)))
        measured = f"We detected {number} probable codas: {phrase_list}."
        if informative:
            role_text = "Possible conversational roles vary across the sequence; inspect each coda separately."
            pattern = "measured_multi_coda_sequence"
        else:
            role_text = "Possible conversational role: unclear across the sequence."
            pattern = "measured_multi_coda_sequence"
    if rejected:
        measured += f" {len(rejected)} estimated click{' was' if len(rejected) == 1 else 's were'} left unassigned."
    return {
        "pattern": pattern,
        "explanation": measured,
        "measured_summary": measured,
        "conversational_role_summary": role_text,
        "label": "Measured rhythm sequence — not a literal translation or meaning",
    }


def segment_and_analyze_clicks(
    onsets_seconds: Sequence[float],
    thresholds: dict[str, Any],
    rhythm_index: dict[str, Any],
    context_index: dict[str, Any],
) -> dict[str, Any]:
    onsets = sorted(float(value) for value in onsets_seconds)
    if any(value < 0 for value in onsets) or any(right <= left for left, right in zip(onsets, onsets[1:])):
        raise ValueError("estimated click onsets must be unique, non-negative, and increasing")

    split_threshold = float(thresholds["split_threshold_seconds"])
    ambiguous_low = float(thresholds["ambiguous_gap_lower_seconds"])
    raw_groups: list[dict[str, Any]] = []
    current: list[float] = []
    boundary_before = None
    potential_non_boundaries: list[dict[str, Any]] = []
    for index, onset in enumerate(onsets):
        if index:
            gap = onset - onsets[index - 1]
            if gap >= split_threshold:
                raw_groups.append({"onsets": current, "boundary_before": boundary_before})
                current = []
                boundary_before = {
                    "status": _boundary_status(gap, thresholds),
                    "gap_seconds": gap,
                    "estimated": True,
                }
            elif gap >= ambiguous_low:
                potential_non_boundaries.append({
                    "after_click_onset_seconds": onsets[index - 1],
                    "before_click_onset_seconds": onset,
                    "gap_seconds": gap,
                    "status": "ambiguous_gap_below_split_threshold",
                })
        current.append(onset)
    if current:
        raw_groups.append({"onsets": current, "boundary_before": boundary_before})

    segments: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    minimum = int(thresholds["scope"]["minimum_coda_clicks"])
    maximum = int(thresholds["scope"]["maximum_coda_clicks"])
    for group in raw_groups:
        group_onsets = group["onsets"]
        if len(group_onsets) < minimum:
            reason = "isolated_click_or_group_below_three_click_minimum"
            rejected.extend({"onset_seconds": onset, "reason": reason} for onset in group_onsets)
            continue
        if len(group_onsets) > maximum:
            reason = "unsegmented_group_exceeds_published_ten_click_scope"
            rejected.extend({"onset_seconds": onset, "reason": reason} for onset in group_onsets)
            continue
        intervals = [right - left for left, right in zip(group_onsets, group_onsets[1:])]
        analysis = analyze_coda_code(
            intervals, rhythm_index, context_index, estimated_click_count=len(group_onsets)
        )
        boundary = group["boundary_before"]
        uncertainty = ["waveform-derived click and boundary estimates"]
        if boundary and boundary["status"] == "ambiguous_estimated_boundary":
            uncertainty.append("preceding boundary lies in the empirical overlap band")
        if analysis["published_rhythm_match"]["status"] != "matched":
            uncertainty.append("rhythm matcher abstained")
        segments.append({
            "segment_id": f"coda-{len(segments) + 1}",
            "start_time_seconds": group_onsets[0],
            "end_time_seconds": group_onsets[-1],
            "click_count": len(group_onsets),
            "click_onsets_seconds": group_onsets,
            "inter_click_intervals_seconds": intervals,
            "boundary_before": boundary,
            "analysis": analysis,
            "uncertainty": uncertainty,
        })

    return {
        "probable_coda_count": len(segments),
        "segments": segments,
        "rejected_click_count": len(rejected),
        "rejected_clicks": rejected,
        "ambiguous_non_boundary_gaps": potential_non_boundaries,
        "segmentation_method": {
            "split_threshold_seconds": split_threshold,
            "ambiguous_gap_lower_seconds": ambiguous_low,
            "clear_boundary_seconds": thresholds["clear_boundary_seconds"],
            "boundary_rule": thresholds["boundary_rule"],
        },
        "estimate_note": ESTIMATE_NOTE,
        "sequence_interpretation": _sequence_explanation(segments, rejected),
    }
