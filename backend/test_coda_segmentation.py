"""Synthetic tests for evidence-derived multi-coda segmentation."""

import json
import unittest
from pathlib import Path

from coda_segmentation import segment_and_analyze_clicks


PROJECT_DIR = Path(__file__).resolve().parents[1]


class CodaSegmentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        base = PROJECT_DIR / "references" / "coda_code"
        cls.thresholds = json.loads((base / "segmentation_thresholds.json").read_text())
        cls.rhythms = json.loads((base / "rhythm_reference_index.json").read_text())
        cls.context = json.loads((base / "dialogue_context_index.json").read_text())

    def analyze(self, onsets: list[float]) -> dict:
        return segment_and_analyze_clicks(
            onsets, self.thresholds, self.rhythms, self.context
        )

    def test_synthetic_single_coda(self) -> None:
        result = self.analyze([0.10, 0.20, 0.30, 0.40, 0.50])
        self.assertEqual(result["probable_coda_count"], 1)
        self.assertEqual(result["segments"][0]["click_count"], 5)
        self.assertEqual(result["rejected_click_count"], 0)

    def test_multiple_codas_separated_by_clear_gaps(self) -> None:
        result = self.analyze([0.1, 0.2, 0.3, 1.2, 1.3, 1.4, 2.5, 2.6, 2.7])
        self.assertEqual(result["probable_coda_count"], 3)
        self.assertEqual(
            result["segments"][1]["boundary_before"]["status"],
            "clear_estimated_boundary",
        )
        self.assertIn(
            "We detected three probable codas",
            result["sequence_interpretation"]["measured_summary"],
        )
        self.assertIn("opening phrase", result["sequence_interpretation"]["measured_summary"])
        self.assertIn("Possible conversational role", result["sequence_interpretation"]["conversational_role_summary"])

    def test_ambiguous_gap_is_split_and_marked(self) -> None:
        result = self.analyze([0.1, 0.2, 0.3, 0.83, 0.93, 1.03])
        self.assertEqual(result["probable_coda_count"], 2)
        boundary = result["segments"][1]["boundary_before"]
        self.assertEqual(boundary["status"], "ambiguous_estimated_boundary")
        self.assertAlmostEqual(boundary["gap_seconds"], 0.53)

    def test_isolated_noise_clicks_are_rejected(self) -> None:
        result = self.analyze([0.0, 1.0, 1.1, 1.2, 2.0])
        self.assertEqual(result["probable_coda_count"], 1)
        self.assertEqual(result["rejected_click_count"], 2)
        self.assertTrue(all("below_three" in click["reason"] for click in result["rejected_clicks"]))

    def test_long_internal_silence_creates_boundary(self) -> None:
        result = self.analyze([0.0, 0.1, 0.2, 8.0, 8.1, 8.2])
        self.assertEqual(result["probable_coda_count"], 2)
        self.assertGreater(result["segments"][1]["boundary_before"]["gap_seconds"], 7)

    def test_no_valid_codas(self) -> None:
        result = self.analyze([0.0, 1.0, 2.0])
        self.assertEqual(result["probable_coda_count"], 0)
        self.assertEqual(result["rejected_click_count"], 3)
        self.assertEqual(result["sequence_interpretation"]["pattern"], "no_valid_sequence")

    def test_twenty_one_clicks_can_be_separated(self) -> None:
        onsets = []
        for group in range(7):
            start = group * 1.0
            onsets.extend([start, start + 0.1, start + 0.2])
        result = self.analyze(onsets)
        self.assertEqual(len(onsets), 21)
        self.assertEqual(result["probable_coda_count"], 7)
        self.assertEqual([segment["click_count"] for segment in result["segments"]], [3] * 7)
        self.assertEqual(result["rejected_click_count"], 0)
        self.assertIn("not a literal translation", result["sequence_interpretation"]["label"])


if __name__ == "__main__":
    unittest.main()
