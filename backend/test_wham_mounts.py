"""Static checks for local modules and indexes packaged into the Modal image."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_DIR / "backend"
ENTRYPOINT = BACKEND_DIR / "wham_embedding_api.py"


def reachable_local_modules(entrypoint: Path) -> set[str]:
    """Find project-local imports transitively without importing Modal or app code."""
    pending = [entrypoint]
    visited_paths: set[Path] = set()
    modules: set[str] = set()
    while pending:
        path = pending.pop()
        if path in visited_paths:
            continue
        visited_paths.add(path)
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        imported_names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                imported_names.add(node.module.split(".")[0])
            elif isinstance(node, ast.Import):
                imported_names.update(alias.name.split(".")[0] for alias in node.names)
        for name in imported_names:
            candidate = BACKEND_DIR / f"{name}.py"
            if candidate.exists() and candidate != entrypoint:
                modules.add(name)
                pending.append(candidate)
    return modules


class WhamModalMountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = ENTRYPOINT.read_text(encoding="utf-8")

    def test_every_reachable_local_module_is_mounted_at_root(self) -> None:
        expected = {
            "audio_analysis",
            "audio_decode",
            "audio_trimming",
            "coda_code",
            "coda_segmentation",
            "evidence_narrator",
            "measured_rhythm",
            "reference_similarity",
        }
        reachable = reachable_local_modules(ENTRYPOINT)
        self.assertEqual(reachable, expected)
        for module in sorted(reachable):
            with self.subTest(module=module):
                self.assertIn(f'{module}.py"', self.source)
                self.assertIn(f'remote_path="/root/{module}.py"', self.source)

    def test_runtime_json_indexes_exist_and_have_matching_remote_paths(self) -> None:
        expected = {
            PROJECT_DIR / "references" / "reference_index.json": ("REFERENCE_INDEX_REMOTE_PATH", "/references/reference_index.json"),
            PROJECT_DIR / "references" / "coda_code" / "rhythm_reference_index.json": ("CODA_RHYTHM_INDEX_REMOTE_PATH", "/references/coda_code/rhythm_reference_index.json"),
            PROJECT_DIR / "references" / "coda_code" / "dialogue_context_index.json": ("CODA_CONTEXT_INDEX_REMOTE_PATH", "/references/coda_code/dialogue_context_index.json"),
            PROJECT_DIR / "references" / "coda_code" / "segmentation_thresholds.json": ("CODA_SEGMENTATION_REMOTE_PATH", "/references/coda_code/segmentation_thresholds.json"),
        }
        for local_path, (constant, remote_path) in expected.items():
            with self.subTest(path=local_path.name):
                self.assertTrue(local_path.is_file())
                self.assertIn(local_path.name, self.source)
                self.assertIn(remote_path, self.source)
                self.assertGreaterEqual(
                    self.source.count(constant),
                    3,
                    f"{constant} must be defined, mounted, and opened",
                )
                self.assertIn(f"open({constant}", self.source)

    def test_production_app_and_secret_names_are_configured(self) -> None:
        self.assertIn('modal.App("whale-acoustic-lab")', self.source)
        self.assertIn('modal.Secret.from_name("whale-acoustic-lab-openai")', self.source)
        self.assertNotIn('modal.Secret.from_name("whale-art-openai"', self.source)

    def test_openai_sdk_is_installed_in_the_modal_image(self) -> None:
        self.assertIn("'openai>=2,<3'", self.source)

    def test_production_embedding_path_removes_unused_wavebeat_dependency(self) -> None:
        lock = (BACKEND_DIR / "requirements.lock").read_text(encoding="utf-8").lower()
        self.assertNotIn("wavebeat @", lock)
        self.assertIn("sed -i '/wavebeat @ git+/d'", self.source.lower())
        self.assertNotIn("wavebeat_ckpt", self.source)
        self.assertNotIn("wavebeat.pth", self.source.lower())

    def test_narration_cache_is_synchronized_across_containers(self) -> None:
        self.assertIn("narration_cache_volume.reload()", self.source)
        self.assertIn("narration_cache_volume.commit()", self.source)

    def test_cache_deletion_is_operator_only_not_an_http_route(self) -> None:
        self.assertIn("def delete_narration_cache_entry(", self.source)
        self.assertNotIn('@web_app.delete("/narration', self.source)
        self.assertNotIn('@web_app.get("/narration', self.source)


if __name__ == "__main__":
    unittest.main()
