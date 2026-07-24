"""Pure local release tests for privacy and dependency boundaries."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

from evidence_narrator import compact_evidence


ROOT = Path(__file__).resolve().parents[1]


class DataPolicyTests(unittest.TestCase):
    def test_required_policy_and_lock_files_exist(self) -> None:
        required = {
            "backend/requirements.lock",
            "backend/requirements-dev.lock",
            "SBOM.md",
            "DEPENDENCY_POLICY.md",
            "PRIVACY.md",
            "DATA_RETENTION.md",
        }
        self.assertEqual([], sorted(name for name in required if not (ROOT / name).is_file()))

    def test_responses_call_keeps_store_false(self) -> None:
        source = (ROOT / "backend/evidence_narrator.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        calls = [
            node for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "create"
            and isinstance(node.func.value, ast.Attribute)
            and node.func.value.attr == "responses"
        ]
        self.assertEqual(1, len(calls))
        store = next((item.value for item in calls[0].keywords if item.arg == "store"), None)
        self.assertIsInstance(store, ast.Constant)
        self.assertIs(store.value, False)

    def test_compact_evidence_excludes_raw_audio_embedding_and_names(self) -> None:
        segment = {
            "start_time_seconds": 0.1,
            "end_time_seconds": 0.8,
            "analysis": {
                "measured_rhythm": {
                    "headline": "A regular three-click coda",
                    "measurements": {
                        "click_count": 3,
                        "total_duration_seconds": 0.7,
                        "mean_inter_click_interval_seconds": 0.35,
                        "median_inter_click_interval_seconds": 0.35,
                        "regularity": "regular",
                        "timing_direction": "approximately even",
                        "click_grouping": "evenly spaced",
                        "beginning_vs_ending_pace": "similar",
                    },
                    "nearest_published_family": None,
                },
                "interpretation": {
                    "interaction_hypothesis": {
                        "role": "unclear",
                        "evidence_level": "weak",
                        "supporting_statistics": {},
                    }
                },
                "published_tempo_type": None,
            },
        }
        analysis = {
            "raw_audio": b"not allowed",
            "embedding": [1.0, 2.0],
            "filename": "private.wav",
            "researcher_note": "private note",
            "coda_sequence": {
                "probable_coda_count": 1,
                "rejected_click_count": 0,
                "segments": [segment],
                "sequence_interpretation": {
                    "measured_summary": "One regular coda.",
                    "conversational_role_summary": "Role unclear.",
                },
            },
        }
        compact = compact_evidence(analysis)
        rendered = repr(compact)
        for forbidden in ("raw_audio", "embedding", "private.wav", "private note", "researcher_note"):
            self.assertNotIn(forbidden, rendered)

    def test_frontend_has_no_openai_key_name_or_research_network_calls(self) -> None:
        frontend = ROOT / "frontend/src"
        for path in frontend.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".js", ".css", ".html"}:
                continue
            self.assertNotIn("OPENAI_API_KEY", path.read_text(encoding="utf-8"), str(path))
        for pattern in ("research-*.ts", "corpus-*.ts"):
            for path in frontend.glob(pattern):
                if path.name.endswith(".test.ts"):
                    continue
                text = path.read_text(encoding="utf-8")
                for network_api in ("fetch(", "XMLHttpRequest", "sendBeacon(", "new WebSocket"):
                    self.assertNotIn(network_api, text, f"{path}: browser-only module uses {network_api}")


if __name__ == "__main__":
    unittest.main()
