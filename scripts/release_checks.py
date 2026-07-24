#!/usr/bin/env python3
"""Redacted, dependency-free checks for public-release hygiene.

The script reports only finding categories and paths. It never prints matched
credential material. It does not call services or execute project modules.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit


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
}
MODEL_SUFFIXES = {".pth", ".pt", ".ckpt", ".safetensors", ".onnx", ".h5", ".weights"}
BINARY_SUFFIXES = {
    ".wav", ".wave", ".mp3", ".m4a", ".flac", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".ico", ".pdf", ".p", ".zip", ".gz", ".woff", ".woff2",
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
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.startswith("VITE_WHAM_API_URL="):
                continue
            value = line.split("=", 1)[1].strip()
            parsed = urlsplit(value)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                findings.append(("unsafe VITE_WHAM_API_URL example", name))
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
            "d8642da31a1256aa952b2753566fff0aab7d9e2d",
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
    ok &= report("worktree contains no model checkpoints", validate_checkpoint_worktree())
    ok &= report("EC1 publishable-file inventory", validate_publishable_ec1_inventory())
    ok &= report("license and provenance inventory", validate_license_inventory())
    ok &= report("dependency and privacy inventory", validate_dependency_and_privacy_inventory())
    ok &= report("frontend contains no backend-only credential names", validate_frontend_secret_boundary())
    ok &= report("CI configuration is local-only and complete", validate_ci_configuration())
    if args.history:
        history_findings, commit_count = scan_history()
        ok &= report(f"Git history contains no credential patterns across {commit_count} commit(s)", history_findings)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
