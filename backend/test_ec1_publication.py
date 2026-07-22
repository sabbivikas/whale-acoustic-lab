"""Fail-closed checks for the publishable EC1 runtime package."""

from __future__ import annotations

import hashlib
import json
import subprocess
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
REFERENCE_DIR = PROJECT_DIR / "references" / "coda_code"
REQUIRED_INDEXES = {
    "rhythm_reference_index.json",
    "dialogue_context_index.json",
    "segmentation_thresholds.json",
}
REQUIRED_DOCUMENTS = {"ATTRIBUTION.md", "LICENSE.md", "PROVENANCE.md", "provenance.json"}


class EC1PublicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provenance = json.loads((REFERENCE_DIR / "provenance.json").read_text(encoding="utf-8"))

    def test_required_attributed_runtime_files_exist_and_are_not_ignored(self) -> None:
        for filename in REQUIRED_INDEXES | REQUIRED_DOCUMENTS:
            path = REFERENCE_DIR / filename
            self.assertTrue(path.is_file(), f"required public EC1 file is missing: {filename}")
            ignored = subprocess.run(
                ["git", "check-ignore", "-q", str(path.relative_to(PROJECT_DIR))],
                cwd=PROJECT_DIR,
                check=False,
            )
            self.assertNotEqual(ignored.returncode, 0, f"required public EC1 file is ignored: {filename}")

    def test_provenance_matches_required_derived_files_and_embedded_sources(self) -> None:
        source = self.provenance["source_release"]
        self.assertEqual(source["doi"], "10.5281/zenodo.10817697")
        self.assertEqual(source["license"], "CC BY 4.0")
        derived = {item["filename"]: item for item in self.provenance["derived_files"]}
        self.assertEqual(set(derived), REQUIRED_INDEXES)
        for filename, record in derived.items():
            path = REFERENCE_DIR / filename
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), record["sha256"])
            self.assertEqual(record["publication_status"], "approved_required_runtime_derivative")

        rhythm = json.loads((REFERENCE_DIR / "rhythm_reference_index.json").read_text(encoding="utf-8"))
        context = json.loads((REFERENCE_DIR / "dialogue_context_index.json").read_text(encoding="utf-8"))
        thresholds = json.loads((REFERENCE_DIR / "segmentation_thresholds.json").read_text(encoding="utf-8"))
        self.assertEqual(rhythm["schema_version"], 1)
        self.assertEqual(context["schema_version"], 1)
        self.assertEqual(thresholds["schema_version"], 1)
        self.assertEqual(rhythm["source"]["license"], "CC BY 4.0")
        self.assertEqual(context["source"]["license"], "CC BY 4.0")
        source_hashes = {item["filename"]: item["sha256"] for item in self.provenance["source_files"]}
        self.assertEqual(rhythm["source"]["sha256"], source_hashes["DominicaCodas.csv"])
        for filename, metadata in context["source"]["files"].items():
            self.assertEqual(metadata["sha256"], source_hashes[filename])

    def test_runtime_modules_load_indexes_without_raw_sources(self) -> None:
        from coda_code import load_coda_code_index

        rhythm = load_coda_code_index(REFERENCE_DIR / "rhythm_reference_index.json")
        context = json.loads((REFERENCE_DIR / "dialogue_context_index.json").read_text(encoding="utf-8"))
        thresholds = json.loads((REFERENCE_DIR / "segmentation_thresholds.json").read_text(encoding="utf-8"))
        self.assertTrue(rhythm["rhythm_families"])
        self.assertTrue(context["combinations"])
        self.assertGreater(thresholds["split_threshold_seconds"], 0)


if __name__ == "__main__":
    unittest.main()
