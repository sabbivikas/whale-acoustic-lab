"""Local tests for factual measured-rhythm descriptions."""

import json
import unittest

from measured_rhythm import describe_measured_rhythm


def index() -> dict:
    return {
        "same_click_count_calibration": {
            str(clicks): {
                "sample_count": 120,
                "duration_seconds_quantiles": {"p10": 0.30, "p25": 0.55, "p50": 0.80, "p75": 1.20, "p90": 1.60},
                "regularity_cv_quantiles": {"p33": 0.08, "p67": 0.25},
                "absolute_normalized_slope_quantiles": {"p33": 0.03, "p67": 0.09},
            }
            for clicks in range(3, 11)
        }
    }


def match(status: str = "matched", name: str = "5R family") -> dict:
    return {
        "status": status,
        "abstention_threshold_mse": 0.01,
        "matches": [{
            "rhythm_family": name,
            "published_coda_types": ["5R1"],
            "raw_mse_distance": 0.02 if status != "matched" else 0.001,
        }],
    }


class MeasuredRhythmTests(unittest.TestCase):
    def describe(self, intervals: list[float], status: str = "matched") -> dict:
        return describe_measured_rhythm(intervals, len(intervals) + 1, match(status), index())

    def test_even_rhythm(self) -> None:
        result = self.describe([0.1, 0.1, 0.1, 0.1])
        self.assertEqual(result["measurements"]["timing_direction"], "approximately even")
        self.assertEqual(result["measurements"]["regularity"], "regular")
        self.assertEqual(result["headline"], "A fast, regular five-click coda")

    def test_accelerating_rhythm(self) -> None:
        result = self.describe([0.30, 0.24, 0.18, 0.12, 0.08, 0.05])
        self.assertEqual(result["measurements"]["timing_direction"], "accelerating")
        self.assertIn("accelerating", result["headline"])

    def test_decelerating_rhythm(self) -> None:
        result = self.describe([0.05, 0.08, 0.12, 0.18, 0.24, 0.30])
        self.assertEqual(result["measurements"]["timing_direction"], "decelerating")
        self.assertIn("decelerating", result["headline"])

    def test_grouped_clicks(self) -> None:
        result = self.describe([0.1, 0.1, 0.5, 0.1, 0.1])
        self.assertEqual(result["measurements"]["click_grouping"], "separated into groups")
        self.assertEqual(result["measurements"]["rhythmic_group_count"], 2)
        self.assertIn("two rhythmic groups", result["headline"])

    def test_irregular_rhythm(self) -> None:
        result = self.describe([0.10, 0.27, 0.14, 0.31, 0.18])
        self.assertEqual(result["measurements"]["regularity"], "irregular")
        self.assertEqual(result["measurements"]["timing_direction"], "mixed")

    def test_unusual_same_click_count_pattern_and_abstained_weak_family(self) -> None:
        result = self.describe([0.01, 0.01, 0.01, 0.97], "no_close_published_pattern")
        self.assertIn("unusual", result["measurements"]["same_click_count_ec1_timing"])
        self.assertEqual(result["nearest_published_family"]["match_strength"], "weak")
        self.assertTrue(result["nearest_published_family"]["outside_accepted_range"])
        self.assertIn("outside the accepted reference range", result["explanation"])

    def test_generated_text_never_claims_literal_meaning(self) -> None:
        serialized = json.dumps(self.describe([0.3, 0.2, 0.1])).lower()
        self.assertIn("not literal whale meaning", serialized)
        self.assertNotIn("the whale means", serialized)
        self.assertNotIn("literal translation:", serialized)


if __name__ == "__main__":
    unittest.main()
