"""Unit tests for WhAM reference cosine ranking."""

import unittest

from reference_similarity import (
    EXPECTED_DIMENSION,
    cosine_similarity,
    empirical_percentile,
    rank_references,
)


def reference(reference_id: str, value: float) -> dict:
    return {
        "id": reference_id,
        "file": f"audio/{reference_id}.wav",
        "source_url": f"https://example.test/{reference_id}.wav",
        "embedding": [value] * EXPECTED_DIMENSION,
        "duration_seconds": 2.0,
        "sample_rate_hz": 44100,
        "license": "CC BY 4.0",
        "dataset_location": "Dominica",
        "collection_period": "2005–2018",
    }


class ReferenceSimilarityTests(unittest.TestCase):
    def test_identical_embeddings_are_one(self) -> None:
        vector = [float(index + 1) for index in range(EXPECTED_DIMENSION)]
        self.assertAlmostEqual(cosine_similarity(vector, vector), 1.0, places=12)

    def test_results_are_sorted_descending(self) -> None:
        query = [1.0] * EXPECTED_DIMENSION
        opposite = [-1.0] * EXPECTED_DIMENSION
        orthogonal = [1.0 if index % 2 == 0 else -1.0 for index in range(EXPECTED_DIMENSION)]
        index = {"recordings": [
            {**reference("opposite", -1.0), "embedding": opposite},
            {**reference("same", 1.0), "embedding": query},
            {**reference("orthogonal", 1.0), "embedding": orthogonal},
        ]}
        matches = rank_references(query, index)
        self.assertEqual([match["reference_id"] for match in matches], ["same", "orthogonal", "opposite"])
        self.assertGreaterEqual(matches[0]["raw_cosine_similarity"], matches[1]["raw_cosine_similarity"])
        self.assertGreaterEqual(matches[1]["raw_cosine_similarity"], matches[2]["raw_cosine_similarity"])

    def test_empirical_percentile_uses_less_than_or_equal(self) -> None:
        self.assertEqual(empirical_percentile(0.2, [0.1, 0.2, 0.3, 0.4]), 50.0)

    def test_wrong_dimension_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "1280"):
            rank_references([1.0] * 1279, {"recordings": [reference("one", 1.0)]})

    def test_empty_reference_index_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "no recordings"):
            rank_references([1.0] * EXPECTED_DIMENSION, {"recordings": []})


if __name__ == "__main__":
    unittest.main()
