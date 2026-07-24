"""Build the versioned public-sample response from checked-in assets only.

This script performs CPU-only waveform calculations. It never imports Modal,
loads model weights, calls WhAM/OpenAI, or makes a network request.
"""

from __future__ import annotations

import hashlib
import json
import sys
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from audio_analysis import analyze_wav_bytes  # noqa: E402
from audio_trimming import trim_wav_bytes  # noqa: E402
from coda_code import analyze_coda_code  # noqa: E402
from coda_segmentation import segment_and_analyze_clicks  # noqa: E402
from evidence_narrator import (  # noqa: E402
    EVIDENCE_VERSION,
    PROMPT_VERSION,
    compact_evidence,
    deterministic_narration,
)
from reference_similarity import rank_references, reference_pair_scores  # noqa: E402


SAMPLE = ROOT / "frontend" / "public" / "samples" / "dswp-1.wav"
OUTPUT = ROOT / "frontend" / "src" / "data" / "dswp-1-analysis.v1.json"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def build() -> dict:
    payload = SAMPLE.read_bytes()
    reference_index = load(ROOT / "references" / "reference_index.json")
    rhythm_index = load(ROOT / "references" / "coda_code" / "rhythm_reference_index.json")
    context_index = load(ROOT / "references" / "coda_code" / "dialogue_context_index.json")
    thresholds = load(ROOT / "references" / "coda_code" / "segmentation_thresholds.json")
    sample_record = next(record for record in reference_index["recordings"] if record["id"] == "dswp-1")
    expected_hash = sample_record["sha256"]
    actual_hash = hashlib.sha256(payload).hexdigest()
    if actual_hash != expected_hash:
        raise ValueError("bundled DSWP sample does not match its attributed reference record")

    trimmed = trim_wav_bytes(payload)
    call_structure = analyze_wav_bytes(trimmed.wav_bytes)
    coda_code = analyze_coda_code(
        call_structure["estimated_inter_click_intervals_seconds"],
        rhythm_index,
        context_index,
        estimated_click_count=call_structure["estimated_click_count"],
    )
    coda_sequence = segment_and_analyze_clicks(
        call_structure["estimated_click_onsets_seconds"],
        thresholds,
        rhythm_index,
        context_index,
    )
    embedding = sample_record["embedding"]
    matches = rank_references(
        embedding,
        reference_index,
        reference_pair_scores(reference_index),
    )[:3]
    narration = deterministic_narration(compact_evidence({"coda_sequence": coda_sequence}))
    with wave.open(str(SAMPLE), "rb") as source:
        duration = source.getnframes() / source.getframerate()
        sample_rate = source.getframerate()
        channels = source.getnchannels()
        bit_depth = source.getsampwidth() * 8

    return {
        "schema_version": "whale-public-sample-analysis-v1",
        "precomputed_source": {
            "audio_sha256": actual_hash,
            "reference_record_id": "dswp-1",
            "embedding_source": "Checked-in Project CETI WhAM layer-10 pooled embedding from references/reference_index.json",
            "calculation_source": "Checked-in CPU-only waveform, coda, EC1, and deterministic narration modules",
            "network_or_inference_used": False,
        },
        "analysis_mode": "precomputed_public_sample",
        "availability": {
            "wham_embedding": True,
            "acoustic_neighbors": True,
            "gpt_narration": False,
            "explanation": "Precomputed public sample using the checked-in DSWP audio, stored WhAM embedding, reference indexes, and deterministic narration.",
        },
        "uploaded_recording": {
            "filename": "dswp-1.wav",
            "duration_seconds": duration,
            "original_duration_seconds": trimmed.original_duration_seconds,
            "analyzed_duration_seconds": trimmed.analyzed_duration_seconds,
            "trim_start_seconds": trimmed.trim_start_seconds,
            "trim_end_seconds": trimmed.trim_end_seconds,
            "trimming_applied": trimmed.trimming_applied,
            "sample_rate_hz": sample_rate,
            "channels": channels,
            "bit_depth": bit_depth,
        },
        "embedding": embedding,
        "embedding_dimension": len(embedding),
        "gpu_name": "Precomputed stored WhAM embedding",
        "processing_time_seconds": 0,
        "matches": matches,
        "call_structure": call_structure,
        "coda_code_interpretation": coda_code,
        "coda_sequence": coda_sequence,
        "ai_evidence_narration": {
            "status": "deterministic_fallback",
            "model": None,
            "prompt_version": PROMPT_VERSION,
            "evidence_version": EVIDENCE_VERSION,
            "content": narration,
        },
        "reference_percentile_definition": "The percentage of measured reference-pair similarities less than or equal to this score.",
        "similarity_statement": "Cosine similarity represents WhAM model-space acoustic similarity only; it does not indicate shared meaning, identity, dialect, or biological category.",
    }


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(build(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
