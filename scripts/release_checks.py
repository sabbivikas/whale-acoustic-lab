#!/usr/bin/env python3
"""Redacted, dependency-free checks for public-release hygiene.

The script reports only finding categories and paths. It never prints matched
credential material. It does not call services or execute project modules.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
MAX_TEXT_BYTES = 3 * 1024 * 1024
ALLOWED_ENV_FILES = {".env.example", "frontend/.env.example"}
ALLOWED_AUDIO = {"frontend/public/samples/dswp-1.wav"}
REQUIRED_EC1_PUBLIC_FILES = {
    "references/coda_code/rhythm_reference_index.json",
    "references/coda_code/dialogue_context_index.json",
    "references/coda_code/segmentation_thresholds.json",
    "references/coda_code/ATTRIBUTION.md",
    "references/coda_code/LICENSE.md",
    "references/coda_code/PROVENANCE.md",
    "references/coda_code/provenance.json",
}
REQUIRED_POLICY_FILES = {
    "backend/requirements.lock",
    "backend/requirements-dev.lock",
    "SBOM.md",
    "DEPENDENCY_POLICY.md",
    "PRIVACY.md",
    "DATA_RETENTION.md",
    "PRODUCTION.md",
    "WHAM_WEIGHTS.md",
    "backend/WAVEBEAT_AUDIT.md",
    "COPYRIGHT.md",
    "CONTRIBUTORS.md",
    "GOVERNANCE.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "docs/SCREENSHOT_PROVENANCE.md",
}
REQUIRED_SCREENSHOTS = {
    "docs/screenshots/homepage-ocean.png": (1158, 772),
    "docs/screenshots/call-story.png": (1158, 772),
    "docs/screenshots/research-mode.png": (1158, 772),
    "docs/screenshots/annotation-evaluation.png": (1158, 772),
    "docs/screenshots/corpus-explorer.png": (1158, 772),
}
MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
MODEL_SUFFIXES = {".pth", ".pt", ".ckpt", ".safetensors", ".onnx", ".h5", ".weights"}
BINARY_SUFFIXES = {
    ".wav", ".wave", ".mp3", ".m4a", ".flac", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".ico", ".pdf", ".p", ".zip", ".gz", ".woff", ".woff2", ".ttf", ".otf",
}
SKIP_PARTS = {".git", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}

SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("OpenAI API key", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("Hugging Face token", re.compile(r"\bhf_[A-Za-z0-9]{20,}\b")),
    ("Vercel token", re.compile(r"\bvercel_[A-Za-z0-9_-]{20,}\b", re.IGNORECASE)),
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("authorization bearer token", re.compile(r"\bAuthorization\s*[:=]\s*['\"]?Bearer\s+[A-Za-z0-9._~+/-]{20,}", re.IGNORECASE)),
    ("credentialed URL", re.compile(r"https?://[^\s/@:]+:[^\s/@]+@[^\s]+", re.IGNORECASE)),
    (
        "assigned service credential",
        re.compile(
            r"\b(?:OPENAI_API_KEY|MODAL_TOKEN_ID|MODAL_TOKEN_SECRET|VERCEL_TOKEN|GITHUB_TOKEN|HF_TOKEN)"
            r"\s*[:=]\s*['\"]?(?!\s*(?:$|your[-_]|replace|example|changeme|<|\$\{))[^\s'\"]{12,}",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
)

BUNDLE_FORBIDDEN_NAMES = re.compile(
    r"OPENAI_API_KEY|MODAL_TOKEN_(?:ID|SECRET)|VERCEL_TOKEN|GITHUB_TOKEN|HF_TOKEN|BEGIN PRIVATE KEY"
)
PRODUCTION_BACKEND_MARKERS = re.compile(
    r"VITE_WHAM_API_URL|(?:sabbi[-_]?vikas)[^\"'\s]*\.modal\.run|https?://[^\"'\s]*\.modal\.run",
    re.IGNORECASE,
)


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def text_from_bytes(data: bytes) -> str | None:
    if len(data) > MAX_TEXT_BYTES or b"\x00" in data[:8192]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def candidate_files() -> list[Path]:
    result = git("ls-files", "--cached", "--others", "--exclude-standard")
    paths: list[Path] = []
    for raw in result.stdout.decode().splitlines():
        path = (ROOT / raw).resolve()
        if path == SELF or not path.is_file() or any(part in SKIP_PARTS for part in path.parts):
            continue
        paths.append(path)
    # Audit ignored environment files too: they are a common source of release
    # leaks even though publication policy correctly excludes them.
    for path in ROOT.rglob(".env*"):
        resolved = path.resolve()
        if resolved.is_file() and resolved != SELF and not any(part in SKIP_PARTS for part in resolved.parts):
            paths.append(resolved)
    return sorted(set(paths))


def tracked_files() -> list[str]:
    return sorted(line for line in git("ls-files").stdout.decode().splitlines() if line)


def scan_text(path_label: str, text: str, findings: list[tuple[str, str]]) -> None:
    for label, pattern in SECRET_PATTERNS:
        if pattern.search(text):
            findings.append((label, path_label))


def scan_worktree() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in candidate_files():
        if path.suffix.lower() in BINARY_SUFFIXES:
            continue
        text = text_from_bytes(path.read_bytes())
        if text is not None:
            scan_text(relative(path), text, findings)
    return findings


def scan_bundle() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    bundle = ROOT / "frontend" / "dist"
    if not bundle.exists():
        return findings
    for path in sorted(bundle.rglob("*")):
        if not path.is_file() or path.suffix.lower() in BINARY_SUFFIXES:
            continue
        text = text_from_bytes(path.read_bytes())
        if text is None:
            continue
        label = relative(path)
        scan_text(label, text, findings)
        if BUNDLE_FORBIDDEN_NAMES.search(text):
            findings.append(("backend-only credential name in frontend bundle", label))
        if PRODUCTION_BACKEND_MARKERS.search(text):
            findings.append(("maintainer backend marker in frontend bundle", label))
    return findings


def validate_frontend_secret_boundary() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    source = ROOT / "frontend" / "src"
    for path in source.rglob("*"):
        if not path.is_file() or path.suffix.lower() in BINARY_SUFFIXES:
            continue
        text = text_from_bytes(path.read_bytes())
        if text is not None and BUNDLE_FORBIDDEN_NAMES.search(text):
            findings.append(("backend-only credential name in frontend source", relative(path)))
    return findings


def scan_history() -> tuple[list[tuple[str, str, str]], int]:
    commits = git("rev-list", "--all", check=False).stdout.decode().splitlines()
    findings: list[tuple[str, str, str]] = []
    for commit in commits:
        names = git("ls-tree", "-r", "--name-only", commit).stdout.decode().splitlines()
        for name in names:
            path = Path(name)
            if path.suffix.lower() in BINARY_SUFFIXES or any(part in SKIP_PARTS for part in path.parts):
                continue
            blob = git("show", f"{commit}:{name}", check=False)
            if blob.returncode:
                continue
            text = text_from_bytes(blob.stdout)
            if text is None:
                continue
            local: list[tuple[str, str]] = []
            scan_text(name, text, local)
            findings.extend((kind, name, commit) for kind, _ in local)
    return findings, len(commits)


def validate_tracked_files() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for name in tracked_files():
        path = Path(name)
        lowered = name.lower()
        if path.name.startswith(".env") and name not in ALLOWED_ENV_FILES:
            findings.append(("tracked environment file", name))
        if path.suffix.lower() in MODEL_SUFFIXES or "checkpoint" in lowered or "/models/" in lowered:
            findings.append(("tracked model/checkpoint artifact", name))
        if path.suffix.lower() in {".wav", ".wave", ".mp3", ".m4a", ".flac"} and name not in ALLOWED_AUDIO:
            findings.append(("tracked non-public audio", name))
        if path.name in {".DS_Store", "Thumbs.db"}:
            findings.append(("tracked operating-system file", name))
    return findings


def validate_public_endpoint() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for name in (".env.example", "frontend/.env.example"):
        path = ROOT / name
        if not path.exists():
            findings.append(("missing environment example", name))
            continue
        if "VITE_WHAM_API_URL" in path.read_text(encoding="utf-8"):
            findings.append(("obsolete production backend environment variable", name))
    return findings


def validate_zero_cost_frontend() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    source_root = ROOT / "frontend" / "src"
    for path in source_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() in BINARY_SUFFIXES:
            continue
        text = text_from_bytes(path.read_bytes())
        if text is not None and PRODUCTION_BACKEND_MARKERS.search(text):
            findings.append(("maintainer backend marker in frontend source", relative(path)))

    browser_analysis = source_root / "browser-analysis.ts"
    if not browser_analysis.is_file():
        findings.append(("browser-only analyzer missing", relative(browser_analysis)))
    else:
        text = browser_analysis.read_text(encoding="utf-8")
        if re.search(r"\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(", text):
            findings.append(("network primitive in browser-only analyzer", relative(browser_analysis)))

    sample_result = source_root / "data" / "dswp-1-analysis.v1.json"
    sample_audio = ROOT / "frontend" / "public" / "samples" / "dswp-1.wav"
    if not sample_audio.is_file():
        findings.append(("bundled public sample audio missing", relative(sample_audio)))
    if not sample_result.is_file():
        findings.append(("precomputed public sample analysis missing", relative(sample_result)))
    else:
        try:
            payload = json.loads(sample_result.read_text(encoding="utf-8"))
            source = payload.get("precomputed_source", {})
            if payload.get("schema_version") != "whale-public-sample-analysis-v1":
                findings.append(("unexpected public-sample schema version", relative(sample_result)))
            if payload.get("analysis_mode") != "precomputed_public_sample":
                findings.append(("public sample is not labeled precomputed", relative(sample_result)))
            if source.get("network_or_inference_used") is not False:
                findings.append(("public sample does not attest local precomputation", relative(sample_result)))
            if sample_audio.is_file() and source.get("audio_sha256") != hashlib.sha256(sample_audio.read_bytes()).hexdigest():
                findings.append(("public sample analysis/audio SHA mismatch", relative(sample_result)))
        except (OSError, ValueError, TypeError):
            findings.append(("precomputed public sample analysis is invalid JSON", relative(sample_result)))

    copied_indexes = {
        source_root / "data" / "rhythm-reference-index.v1.json": ROOT / "references" / "coda_code" / "rhythm_reference_index.json",
        source_root / "data" / "segmentation-thresholds.v1.json": ROOT / "references" / "coda_code" / "segmentation_thresholds.json",
    }
    for copied, authoritative in copied_indexes.items():
        if not copied.is_file() or not authoritative.is_file():
            findings.append(("browser reference data missing", relative(copied)))
        elif hashlib.sha256(copied.read_bytes()).digest() != hashlib.sha256(authoritative.read_bytes()).digest():
            findings.append(("browser reference copy differs from attributed source", relative(copied)))
    return findings


def validate_checkpoint_worktree() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in SKIP_PARTS for part in path.parts):
            continue
        if path.suffix.lower() in MODEL_SUFFIXES:
            findings.append(("model/checkpoint present in worktree", relative(path)))
    return findings


def validate_publishable_ec1_inventory() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    candidates = {relative(path) for path in candidate_files()}
    for name in sorted(REQUIRED_EC1_PUBLIC_FILES - candidates):
        findings.append(("required EC1 publication file excluded or missing", name))
    for name in sorted(candidates):
        if name.startswith("references/coda_code/source/"):
            findings.append(("raw EC1 build input is publishable", name))
    return findings


def validate_license_inventory() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    required = {
        "LICENSE": ("MIT License",),
        "THIRD_PARTY_LICENSES.md": ("Three.js", "WhAM", "CC BY-NC-ND 4.0", "CC BY 4.0"),
        "references/coda_code/LICENSE.md": ("CC BY 4.0", "10.5281/zenodo.10817697", "modified"),
        "references/coda_code/ATTRIBUTION.md": ("Pratyusha Sharma", "10.1038/s41467-024-47221-8"),
        "references/coda_code/PROVENANCE.md": ("DominicaCodas.csv", "dialogue_context_index.json"),
    }
    for name, markers in required.items():
        path = ROOT / name
        if not path.is_file():
            findings.append(("missing license/provenance file", name))
            continue
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                findings.append(("missing license/provenance marker", f"{name}: {marker}"))
    return findings


def validate_screenshots() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    screenshot_directory = ROOT / "docs" / "screenshots"
    actual = {
        relative(path)
        for path in screenshot_directory.glob("*")
        if path.is_file()
    } if screenshot_directory.is_dir() else set()
    expected = set(REQUIRED_SCREENSHOTS)
    for name in sorted(expected - actual):
        findings.append(("required release screenshot missing", name))
    for name in sorted(actual - expected):
        findings.append(("unreviewed screenshot present", name))
    for name, dimensions in REQUIRED_SCREENSHOTS.items():
        path = ROOT / name
        if not path.is_file():
            continue
        data = path.read_bytes()
        if len(data) >= MAX_SCREENSHOT_BYTES:
            findings.append(("release screenshot is 5 MB or larger", name))
        if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
            findings.append(("release screenshot is not a valid PNG", name))
            continue
        width, height = struct.unpack(">II", data[16:24])
        if (width, height) != dimensions:
            findings.append(("release screenshot dimensions changed", f"{name}: {width}x{height}"))
        if width * 2 != height * 3:
            findings.append(("release screenshot is not exactly 3:2", f"{name}: {width}x{height}"))
    provenance = ROOT / "docs" / "SCREENSHOT_PROVENANCE.md"
    if provenance.is_file():
        text = provenance.read_text(encoding="utf-8")
        for name in sorted(expected):
            if Path(name).name not in text:
                findings.append(("screenshot missing from provenance record", name))
        for marker in ("No production backend access", "synthetic", "No private recordings"):
            if marker.lower() not in text.lower():
                findings.append(("screenshot provenance boundary missing", marker))
    return findings


def validate_markdown_links() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    link_pattern = re.compile(r"!?\[[^\]]*]\(([^)]+)\)")
    for path in sorted(ROOT.rglob("*.md")):
        if any(part in SKIP_PARTS for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for raw_target in link_pattern.findall(text):
            target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
            if not target or target.startswith(("#", "http://", "https://")):
                continue
            local = unquote(target.split("#", 1)[0])
            resolved = (path.parent / local).resolve()
            try:
                resolved.relative_to(ROOT)
            except ValueError:
                findings.append(("Markdown link leaves repository", f"{relative(path)}: {target}"))
                continue
            if not resolved.exists():
                findings.append(("broken local Markdown link", f"{relative(path)}: {target}"))
    return findings


def validate_dependency_and_privacy_inventory() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for name in sorted(REQUIRED_POLICY_FILES):
        if not (ROOT / name).is_file():
            findings.append(("required dependency/privacy file missing", name))

    production_lock = ROOT / "backend" / "requirements.lock"
    if production_lock.is_file():
        lock = production_lock.read_text(encoding="utf-8")
        required_pins = (
            "numpy==1.23.5",
            "torch==2.1.2",
            "torchaudio==2.1.2",
            "torchvision==0.16.2",
            "fastapi==0.115.11",
            "python-multipart==0.0.20",
            "openai==2.46.0",
            "00a8b787c040db23cd51ac4417481a09ac354985",
            "7761206878d1fba79aad314a38f975e9589af0a4",
            "54eecf66f38af6a15bd8c42f44c9f3e1746892bb",
        )
        for marker in required_pins:
            if marker not in lock:
                findings.append(("required production dependency pin missing", marker))

    narrator = ROOT / "backend" / "evidence_narrator.py"
    if narrator.is_file():
        text = narrator.read_text(encoding="utf-8")
        if not re.search(r"\bstore\s*=\s*False\b", text):
            findings.append(("OpenAI Responses store:false protection missing", relative(narrator)))
        compact_section = text.split("def compact_evidence", 1)[-1].split("def deterministic_narration", 1)[0]
        for forbidden in ("raw_audio", '"embedding"', '"filename"', "researcher_note"):
            if forbidden in compact_section:
                findings.append(("forbidden field in compact GPT evidence builder", forbidden))

    api = ROOT / "backend" / "wham_embedding_api.py"
    if api.is_file():
        text = api.read_text(encoding="utf-8")
        if "compact_evidence(calculated)" not in text:
            findings.append(("GPT narration bypasses compact evidence boundary", relative(api)))

        lowered = text.lower()
        if "sed -i '/wavebeat @ git+/d'" not in lowered:
            findings.append(("WaveBeat installer removal missing", relative(api)))
        if "wavebeat_ckpt" in lowered or "wavebeat.pth" in lowered:
            findings.append(("WaveBeat configuration remains in production API", relative(api)))
        if re.search(r"@web_app\.(?:get|post|delete|put|patch)\([^)]*(?:weight|checkpoint)", lowered):
            findings.append(("public model-weight route detected", relative(api)))
        if "staticfiles" in lowered or "fileresponse" in lowered:
            findings.append(("file-serving primitive present in production API", relative(api)))
        if 'modal.cron("0 4 * * *")' not in lowered:
            findings.append(("scheduled narration-cache cleanup missing", relative(api)))
        if "def delete_narration_cache_entry(" not in text:
            findings.append(("operator narration-cache deletion missing", relative(api)))

    if production_lock.is_file() and "wavebeat @" in production_lock.read_text(encoding="utf-8").lower():
        findings.append(("WaveBeat dependency remains in production lock", relative(production_lock)))

    narrator = ROOT / "backend" / "evidence_narrator.py"
    if narrator.is_file():
        text = narrator.read_text(encoding="utf-8")
        ttl_match = re.search(r"^CACHE_TTL_SECONDS\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*$", text, re.MULTILINE)
        if not ttl_match:
            findings.append(("fixed 30-day narration-cache TTL missing", relative(narrator)))
        cache_write = text.split("def _write_cache", 1)[-1].split("def delete_cached_narration", 1)[0]
        for forbidden in ("raw_audio", "embedding", "filename", "researcher_note", "audio_sha256"):
            if forbidden in cache_write:
                findings.append(("forbidden narration-cache field", forbidden))

    font_files = {
        "frontend/public/fonts/dm-sans/DMSans-Variable.ttf": "8cd08d97e89c24d0aa92edd2f0f4c8ee6195eee9b7c9f154865a58b02f0c1c0d",
        "frontend/public/fonts/dm-sans/OFL.txt": "9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1",
        "frontend/public/fonts/manrope/Manrope-Variable.ttf": "d0639be45d0af36e798172419d7bd173c4bd4f29e2b76cbb69db1d11bf8b0a40",
        "frontend/public/fonts/manrope/OFL.txt": "e01b637272e0cbdfb240184dd98ea5cc671556d9894dae2668d92ab2c906787c",
    }
    for name, expected_hash in font_files.items():
        path = ROOT / name
        if not path.is_file():
            findings.append(("required self-hosted font/license missing", name))
        elif hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            findings.append(("self-hosted font/license hash changed", name))

    frontend_text = ""
    for path in (ROOT / "frontend" / "src").rglob("*"):
        if path.is_file() and path.suffix in {".ts", ".css", ".html"}:
            frontend_text += path.read_text(encoding="utf-8", errors="ignore")
    if "fonts.googleapis.com" in frontend_text or "fonts.gstatic.com" in frontend_text:
        findings.append(("external Google Fonts request remains", "frontend/src"))
    for marker in ("/fonts/dm-sans/DMSans-Variable.ttf", "/fonts/manrope/Manrope-Variable.ttf"):
        if marker not in frontend_text:
            findings.append(("self-hosted font path missing", marker))
    if "CC BY-NC-ND 4.0" not in frontend_text or "Noncommercial research" not in frontend_text:
        findings.append(("public WhAM weight notice missing", "frontend/src/main.ts"))
    return findings


def validate_ci_configuration() -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    path = ROOT / ".github" / "workflows" / "ci.yml"
    if not path.is_file():
        return [("missing CI workflow", ".github/workflows/ci.yml")]
    text = path.read_text(encoding="utf-8")
    required = (
        "npm test", "npm run type-check", "npm run build",
        "unittest discover", "compileall", "release_checks.py --bundle-only",
        "release_checks.py --history",
    )
    for marker in required:
        if marker not in text:
            findings.append(("missing CI validation command", marker))
    for marker in ("actions/checkout@v7", "actions/setup-node@v7", "actions/setup-python@v7"):
        if marker not in text:
            findings.append(("current Node 24 GitHub Action missing", marker))
    forbidden = (
        "modal run", "modal serve", "modal deploy", "wham_compat_test",
        "build_reference_index", "build_coda_code_index", "build_segmentation_thresholds",
        "OPENAI_API_KEY", "secrets.", "gpu",
    )
    lowered = text.lower()
    for marker in forbidden:
        if marker.lower() in lowered:
            findings.append(("forbidden CI operation or secret reference", marker))
    return findings


def report(title: str, findings: list[tuple[str, ...]]) -> bool:
    if not findings:
        print(f"PASS: {title}")
        return True
    print(f"FAIL: {title} ({len(findings)} finding(s))")
    for finding in findings:
        print("  - " + " | ".join(finding))
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", action="store_true", help="also scan every Git commit")
    parser.add_argument("--bundle-only", action="store_true", help="scan only frontend/dist")
    args = parser.parse_args()

    if args.bundle_only:
        return 0 if report("frontend bundle contains no credential patterns", scan_bundle()) else 1

    ok = True
    ok &= report("working tree contains no credential patterns", scan_worktree())
    ok &= report("tracked-file publication policy", validate_tracked_files())
    ok &= report("public endpoint examples", validate_public_endpoint())
    ok &= report("zero-cost frontend boundary", validate_zero_cost_frontend())
    ok &= report("worktree contains no model checkpoints", validate_checkpoint_worktree())
    ok &= report("EC1 publishable-file inventory", validate_publishable_ec1_inventory())
    ok &= report("license and provenance inventory", validate_license_inventory())
    ok &= report("release screenshots and provenance", validate_screenshots())
    ok &= report("local Markdown links", validate_markdown_links())
    ok &= report("dependency and privacy inventory", validate_dependency_and_privacy_inventory())
    ok &= report("frontend contains no backend-only credential names", validate_frontend_secret_boundary())
    ok &= report("CI configuration is local-only and complete", validate_ci_configuration())
    if args.history:
        history_findings, commit_count = scan_history()
        ok &= report(f"Git history contains no credential patterns across {commit_count} commit(s)", history_findings)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
