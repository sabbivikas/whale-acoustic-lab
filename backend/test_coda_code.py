"""Local tests for published rhythm matching and bounded interpretation rules."""

import json
import tempfile
import unittest
from pathlib import Path

from build_coda_code_index import _group_exchanges, _position
from coda_code import (
    CODA_TYPE_TO_FAMILY,
    NO_LITERAL_TRANSLATION,
    empirical_closeness_percentile,
    interpret_conversational_role,
    match_rhythm,
    normalize_intervals,
    tempo_type,
)


def miniature_index(threshold: float = 0.01) -> dict:
    return {
        "rhythm_families": [
            {
                "rhythm_family_id": 6,
                "display_name": "5R family",
                "published_coda_types": ["5R1", "5R2", "5R3"],
                "click_count": 5,
                "centroid_normalized_intervals": [0.25, 0.25, 0.25, 0.25],
                "reference_sample_count": 50,
                "reference_distances_to_centroid": [0.0, 0.001, 0.004, 0.01],
            },
            {
                "rhythm_family_id": 7,
                "display_name": "2+3",
                "published_coda_types": ["2+3"],
                "click_count": 5,
                "centroid_normalized_intervals": [0.1, 0.1, 0.4, 0.4],
                "reference_sample_count": 30,
                "reference_distances_to_centroid": [0.0, 0.002, 0.008],
            },
        ],
        "validation": {"abstention_thresholds_by_click_count": {"5": threshold}},
    }


def matched_rhythm() -> dict:
    return match_rhythm([0.2, 0.2, 0.2, 0.2], miniature_index())


def context_stats(**overrides: float | int) -> dict:
    values = {
        "example_count": 80,
        "position_frequencies": {"opening": 0.33, "middle": 0.34, "ending": 0.33},
        "followed_by_coda_frequency": 0.85,
        "followed_by_different_speaker_frequency": 0.70,
        "preceded_by_different_speaker_frequency": 0.45,
        "median_time_to_following_coda_seconds": 2.2,
    }
    values.update(overrides)
    return {"combinations": {"6:2": values}}


class PublishedRhythmTests(unittest.TestCase):
    def test_exact_published_family_mapping(self) -> None:
        self.assertEqual(CODA_TYPE_TO_FAMILY["4R1"], 3)
        self.assertEqual(CODA_TYPE_TO_FAMILY["4R2"], 3)
        self.assertEqual(CODA_TYPE_TO_FAMILY["5R3"], 6)
        self.assertNotIn("5-NOISE", CODA_TYPE_TO_FAMILY)
        self.assertEqual(set(CODA_TYPE_TO_FAMILY.values()), set(range(18)))

    def test_normalized_ici_comparison(self) -> None:
        self.assertEqual(normalize_intervals([1, 1, 1, 1]), [0.25] * 4)
        result = matched_rhythm()
        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["matches"][0]["rhythm_family"], "5R family")
        self.assertAlmostEqual(result["matches"][0]["raw_mse_distance"], 0.0)
        self.assertGreater(result["best_vs_second_best_margin"], 0)

    def test_tempo_boundaries_are_half_open(self) -> None:
        self.assertEqual(tempo_type(0.4499), 0)
        self.assertEqual(tempo_type(0.45), 1)
        self.assertEqual(tempo_type(0.61), 2)
        self.assertEqual(tempo_type(0.93), 3)
        self.assertEqual(tempo_type(1.08), 4)

    def test_empirical_percentile(self) -> None:
        self.assertEqual(empirical_closeness_percentile(0.2, [0.1, 0.2, 0.3, 0.4]), 75.0)

    def test_abstains_outside_leave_one_out_threshold(self) -> None:
        result = match_rhythm([0.01, 0.01, 0.01, 0.97], miniature_index(threshold=0.00001))
        self.assertEqual(result["status"], "no_close_published_pattern")
        self.assertEqual(result["message"], "No close published pattern found")


class DialogueContextTests(unittest.TestCase):
    def test_opening_middle_ending_calculation(self) -> None:
        self.assertEqual([_position(index, 5) for index in range(5)], [
            "opening", "opening", "middle", "ending", "ending"
        ])

    def test_grouping_and_speaker_change_inputs(self) -> None:
        rows = [
            {"REC": "sw0001-a", "onset": 0.0, "row_index": 0, "speaker": 1},
            {"REC": "sw0001-b", "onset": 2.0, "row_index": 1, "speaker": 2},
            {"REC": "sw0001-c", "onset": 11.0, "row_index": 2, "speaker": 2},
        ]
        groups = _group_exchanges(rows)
        self.assertEqual([len(group) for group in groups], [2, 1])
        self.assertNotEqual(groups[0][0]["speaker"], groups[0][1]["speaker"])


class InterpretationRuleTests(unittest.TestCase):
    def test_insufficient_dialogue_examples_are_unclear(self) -> None:
        response = interpret_conversational_role(
            matched_rhythm(), 2, context_stats(example_count=19)
        )
        self.assertEqual(response["interaction_hypothesis"]["role"], "Unclear")

    def test_deterministic_turn_rule(self) -> None:
        first = interpret_conversational_role(matched_rhythm(), 2, context_stats())
        second = interpret_conversational_role(matched_rhythm(), 2, context_stats())
        self.assertEqual(first, second)
        self.assertEqual(
            first["interaction_hypothesis"]["role"],
            "Invites or maintains another turn",
        )
        self.assertTrue(first["interaction_hypothesis"]["supporting_statistics"])

    def test_weak_context_falls_back_to_unclear(self) -> None:
        weak = context_stats(
            position_frequencies={"opening": 0.34, "middle": 0.33, "ending": 0.33},
            followed_by_coda_frequency=0.60,
            followed_by_different_speaker_frequency=0.30,
            preceded_by_different_speaker_frequency=0.30,
        )
        response = interpret_conversational_role(matched_rhythm(), 2, weak)
        self.assertEqual(response["interaction_hypothesis"]["role"], "Unclear")

    def test_response_never_claims_literal_translation(self) -> None:
        response = interpret_conversational_role(matched_rhythm(), 2, context_stats())
        serialized = json.dumps(response).lower()
        self.assertIn("not a literal translation", serialized)
        self.assertIn("does not identify", serialized)
        self.assertNotIn('"translation":', serialized)
        self.assertIn("not a literal translation", NO_LITERAL_TRANSLATION.lower())


if __name__ == "__main__":
    unittest.main()
