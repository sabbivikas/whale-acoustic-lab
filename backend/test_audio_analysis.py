"""Synthetic validation for the transparent click-onset estimator."""

import unittest

from audio_analysis import analyze_pcm


SAMPLE_RATE = 16_000
KNOWN_ONSETS = [0.2, 0.55, 0.9]
TIMING_TOLERANCE_SECONDS = 0.002


def synthetic_impulses() -> list[float]:
    samples = [0.0] * SAMPLE_RATE
    for onset in KNOWN_ONSETS:
        index = round(onset * SAMPLE_RATE)
        samples[index] = 1.0
        samples[index + 1] = -0.45
        samples[index + 2] = 0.2
    return samples


class AudioAnalysisTests(unittest.TestCase):
    def setUp(self) -> None:
        self.result = analyze_pcm(synthetic_impulses(), SAMPLE_RATE)

    def test_detects_known_impulse_count_and_times(self) -> None:
        self.assertEqual(self.result["estimated_click_count"], len(KNOWN_ONSETS))
        for estimated, expected in zip(
            self.result["estimated_click_onsets_seconds"], KNOWN_ONSETS
        ):
            self.assertLessEqual(abs(estimated - expected), TIMING_TOLERANCE_SECONDS)

    def test_inter_click_intervals(self) -> None:
        for estimated, expected in zip(
            self.result["estimated_inter_click_intervals_seconds"], [0.35, 0.35]
        ):
            self.assertLessEqual(abs(estimated - expected), TIMING_TOLERANCE_SECONDS * 2)

    def test_normalized_rhythm_is_mean_one(self) -> None:
        pattern = self.result["estimated_normalized_rhythm_pattern"]
        self.assertAlmostEqual(sum(pattern) / len(pattern), 1.0, places=12)
        self.assertFalse(self.result["ground_truth_click_timestamps_available"])


if __name__ == "__main__":
    unittest.main()
