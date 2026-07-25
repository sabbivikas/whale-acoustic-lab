#!/usr/bin/env python3
"""Validate the built GitHub Pages artifact without making network requests."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
PAGES_BASE = "/whale-acoustic-lab/"
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".map", ".svg"}
FORBIDDEN_NETWORK = re.compile(
    r"https?://[^\"'\s]*(?:modal\.run|api\.openai\.com)|"
    r"(?:OPENAI_API_KEY|VITE_WHAM_API_URL|MODAL_TOKEN_(?:ID|SECRET))",
    re.IGNORECASE,
)
URL_ATTRIBUTE = re.compile(r"""(?:src|href)=["']([^"'#]+)["']""")
CSS_URL = re.compile(r"""url\(\s*["']?([^"')]+)""")


def fail(message: str) -> None:
    print(f"Pages artifact check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def local_path(url: str, source: Path) -> Path | None:
    parsed = urlparse(url)
    if parsed.scheme or parsed.netloc or url.startswith(("data:", "blob:", "#")):
        return None
    clean = unquote(parsed.path)
    if clean.startswith(PAGES_BASE):
        return DIST / clean.removeprefix(PAGES_BASE)
    if clean.startswith("/"):
        fail(f"root-relative URL escapes Pages base in {source.relative_to(DIST)}")
    return (source.parent / clean).resolve()


def main() -> int:
    index = DIST / "index.html"
    if not index.is_file():
        fail("frontend/dist/index.html is missing")
    required = [
        DIST / "samples" / "dswp-1.wav",
        DIST / "fonts" / "dm-sans" / "DMSans-Variable.ttf",
        DIST / "fonts" / "manrope" / "Manrope-Variable.ttf",
    ]
    for path in required:
        if not path.is_file():
            fail(f"required static asset is missing: {path.relative_to(DIST)}")

    text_files = [path for path in DIST.rglob("*") if path.is_file() and path.suffix in TEXT_SUFFIXES]
    combined = ""
    for path in text_files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        combined += text
        if FORBIDDEN_NETWORK.search(text):
            fail(f"forbidden service marker found in {path.relative_to(DIST)}")
        urls = URL_ATTRIBUTE.findall(text) if path.suffix == ".html" else []
        urls += CSS_URL.findall(text) if path.suffix == ".css" else []
        for url in urls:
            resolved = local_path(url, path)
            if resolved is not None and not resolved.is_file():
                fail(f"missing local asset referenced by {path.relative_to(DIST)}: {url}")

    if f'src="{PAGES_BASE}assets/' not in index.read_text(encoding="utf-8"):
        fail("index entry script is not rooted at the repository Pages base")
    if "samples/dswp-1.wav" not in combined:
        fail("public sample URL is absent from the built artifact")
    if "home-ocean-scene" not in combined:
        fail("lazy Three.js scene chunk is absent from the built artifact")

    print(
        "Pages artifact check passed: repository base, required assets, "
        "lazy scene, sample, and forbidden-service boundaries verified."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
