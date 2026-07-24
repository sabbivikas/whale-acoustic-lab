"""Optional, schema-bound OpenAI narration over compact calculated evidence only."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any, Callable


MODEL = "gpt-5.6-luna"
PROMPT_VERSION = "whale-evidence-narrator-v1"
EVIDENCE_VERSION = "whale-calculated-evidence-v1"
MAX_OUTPUT_TOKENS = 550
TIMEOUT_SECONDS = 15.0
CACHE_DIR = Path(os.environ.get("NARRATION_CACHE_DIR", "/narration-cache"))
CACHE_SCHEMA_VERSION = 1
CACHE_TTL_SECONDS = 30 * 24 * 60 * 60
STATUS_GENERATED = "generated"
STATUS_CACHE_HIT = "cache_hit"
STATUS_FALLBACK = "deterministic_fallback"

LOGGER = logging.getLogger(__name__)

NARRATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "headline", "sequence_explanation", "why_it_is_interesting",
        "evidence_points", "creative_analogy", "uncertainty", "literal_translation",
    ],
    "properties": {
        "headline": {"type": "string", "maxLength": 100},
        "sequence_explanation": {"type": "string", "maxLength": 700},
        "why_it_is_interesting": {"type": "string", "maxLength": 350},
        "evidence_points": {
            "type": "array", "minItems": 3, "maxItems": 3,
            "items": {"type": "string", "maxLength": 180},
        },
        "creative_analogy": {"type": "string", "maxLength": 300},
        "uncertainty": {"type": "string", "maxLength": 350},
        "literal_translation": {"type": "boolean", "const": False},
    },
}

SYSTEM_INSTRUCTIONS = """You narrate calculated evidence about sperm-whale call timing.
Use only the supplied JSON evidence. Keep every deterministic unclear role unclear.
Never state or imply a greeting, name, question, answer, emotion, identity, clan, dialect,
intent, exact meaning, or literal translation. Never write 'the whale said'. Never invent
measurements, percentages, or counts. The analogy must begin exactly 'In human musical terms...'
and describe rhythm only. Scientists have not translated sperm-whale language. Return concise
JSON matching the provided schema."""

PROHIBITED_PATTERNS = (
    r"\bthe whale said\b",
    r"\bmeans?\s+(?:hello|goodbye|yes|no|help)\b",
    r"\b(?:is|was)\s+(?:a\s+)?greeting\b",
    r"\bexpress(?:es|ed|ing)?\s+(?:an?\s+)?emotion\b",
    r"\bidentif(?:y|ies|ied)\s+the whale\b",
    r"\b(?:the|its)\s+(?:clan|dialect|intent)\b",
    r"\basks?\s+(?:a\s+)?question\b",
    r"\banswers?\s+(?:the|a)\b",
)


def compact_evidence(analysis: dict[str, Any]) -> dict[str, Any]:
    """Whitelist calculated evidence; raw audio, embeddings, names, and filenames cannot enter."""
    sequence = analysis["coda_sequence"]
    codas = []
    for segment in sequence["segments"]:
        measured = segment["analysis"]["measured_rhythm"]
        family = measured.get("nearest_published_family")
        role = segment["analysis"]["interpretation"]["interaction_hypothesis"]
        codas.append({
            "position": len(codas) + 1,
            "start_seconds": round(segment["start_time_seconds"], 3),
            "end_seconds": round(segment["end_time_seconds"], 3),
            "headline": measured["headline"],
            "measurements": {
                "click_count": measured["measurements"]["click_count"],
                "duration_seconds": round(measured["measurements"]["total_duration_seconds"], 3),
                "mean_ici_seconds": round(measured["measurements"]["mean_inter_click_interval_seconds"], 4),
                "median_ici_seconds": round(measured["measurements"]["median_inter_click_interval_seconds"], 4),
                "regularity": measured["measurements"]["regularity"],
                "timing_direction": measured["measurements"]["timing_direction"],
                "click_grouping": measured["measurements"]["click_grouping"],
                "beginning_vs_ending_pace": measured["measurements"]["beginning_vs_ending_pace"],
            },
            "published_family": None if family is None else {
                "name": family["name"],
                "match_strength": family["match_strength"],
                "outside_accepted_range": family["outside_accepted_range"],
            },
            "tempo_type": segment["analysis"]["published_tempo_type"],
            "possible_conversational_role": role["role"],
            "role_evidence_level": role["evidence_level"],
            "role_statistics": role["supporting_statistics"],
        })
    return {
        "evidence_version": EVIDENCE_VERSION,
        "probable_coda_count": sequence["probable_coda_count"],
        "unassigned_click_count": sequence["rejected_click_count"],
        "sequence_summary": sequence["sequence_interpretation"]["measured_summary"],
        "conversational_role_summary": sequence["sequence_interpretation"]["conversational_role_summary"],
        "codas": codas,
        "scientific_limit": (
            "Scientists have not translated sperm-whale language. These are measured acoustic "
            "structures, published-data comparisons, bounded role hypotheses, and non-literal analogies."
        ),
    }


def deterministic_narration(evidence: dict[str, Any]) -> dict[str, Any]:
    count = evidence["probable_coda_count"]
    codas = evidence["codas"]
    if not count:
        headline = "No probable coda sequence was identified"
        explanation = (
            "The click estimator did not produce a group that met the published three-to-ten-click "
            "coda scope. No rhythm family or conversational role was forced."
        )
        interesting = "The absence of an accepted coda is itself a cautious result, not evidence that the recording has no whale sound."
        analogy = "In human musical terms... there is not enough measured rhythm here for a responsible analogy."
    else:
        headline = f"A call story with {count} probable coda{'s' if count != 1 else ''}"
        explanation = evidence["sequence_summary"]
        interesting = "The sequence combines directly measured click timing with clearly separated published-data comparisons."
        analogy = codas[0]["headline"] if codas else "an unresolved phrase"
        analogy = f"In human musical terms... it begins like {analogy.lower()}, without implying literal whale meaning."
    first = codas[0] if codas else None
    evidence_points = [
        f"{count} probable coda{'s were' if count != 1 else ' was'} detected.",
        f"{evidence['unassigned_click_count']} estimated click{'s were' if evidence['unassigned_click_count'] != 1 else ' was'} left unassigned.",
        (
            f"The first coda contains {first['measurements']['click_count']} estimated clicks and is {first['measurements']['timing_direction']}."
            if first else "No click group met the accepted coda scope."
        ),
    ]
    return {
        "headline": headline,
        "sequence_explanation": explanation,
        "why_it_is_interesting": interesting,
        "evidence_points": evidence_points,
        "creative_analogy": analogy,
        "uncertainty": "Literal meaning, identity, intent, emotion, clan, and dialect remain unknown.",
        "literal_translation": False,
    }


def _numbers(value: Any) -> set[str]:
    return set(re.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?", json.dumps(value, sort_keys=True)))


def validate_narration(payload: Any, evidence: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != set(NARRATION_SCHEMA["required"]):
        raise ValueError("narration does not match the required object shape")
    string_fields = ("headline", "sequence_explanation", "why_it_is_interesting", "creative_analogy", "uncertainty")
    if any(not isinstance(payload[field], str) or not payload[field].strip() for field in string_fields):
        raise ValueError("narration contains an empty or non-string field")
    if payload.get("literal_translation") is not False:
        raise ValueError("literal_translation must be false")
    points = payload.get("evidence_points")
    if not isinstance(points, list) or len(points) != 3 or any(not isinstance(point, str) or not point.strip() for point in points):
        raise ValueError("exactly three non-empty evidence points are required")
    if not payload["creative_analogy"].startswith("In human musical terms..."):
        raise ValueError("creative analogy has the wrong prefix")
    text = " ".join(payload[field] for field in string_fields) + " " + " ".join(points)
    lowered = text.lower()
    if any(re.search(pattern, lowered) for pattern in PROHIBITED_PATTERNS):
        raise ValueError("narration contains a prohibited semantic claim")
    if not _numbers(payload).issubset(_numbers(evidence)):
        raise ValueError("narration contains a number absent from calculated evidence")
    return payload


def cache_key(audio_sha256: str) -> str:
    material = f"{audio_sha256}:{EVIDENCE_VERSION}:{PROMPT_VERSION}:{MODEL}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _read_cache(path: Path, *, now: float | None = None) -> dict[str, Any] | None:
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None
    if (
        not isinstance(envelope, dict)
        or set(envelope) != {"schema_version", "created_at_unix", "expires_at_unix", "content"}
        or envelope.get("schema_version") != CACHE_SCHEMA_VERSION
        or not isinstance(envelope.get("created_at_unix"), (int, float))
        or not isinstance(envelope.get("expires_at_unix"), (int, float))
        or not isinstance(envelope.get("content"), dict)
    ):
        return None
    current_time = time.time() if now is None else now
    if envelope["expires_at_unix"] <= current_time:
        return None
    return envelope["content"]


def _write_cache(path: Path, value: dict[str, Any], *, now: float | None = None) -> None:
    created_at = time.time() if now is None else now
    envelope = {
        "schema_version": CACHE_SCHEMA_VERSION,
        "created_at_unix": created_at,
        "expires_at_unix": created_at + CACHE_TTL_SECONDS,
        "content": value,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as target:
        json.dump(envelope, target, separators=(",", ":"), sort_keys=True)
        temporary = Path(target.name)
    temporary.replace(path)


def delete_cached_narration(
    audio_sha256: str,
    *,
    cache_dir: Path = CACHE_DIR,
) -> bool:
    """Delete one hash-addressed cache entry without reading or returning its content."""
    if not re.fullmatch(r"[a-fA-F0-9]{64}", audio_sha256):
        raise ValueError("audio_sha256 must contain exactly 64 hexadecimal characters")
    path = cache_dir / f"{cache_key(audio_sha256)}.json"
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False


def delete_expired_cached_narrations(
    *,
    cache_dir: Path = CACHE_DIR,
    now: float | None = None,
) -> int:
    """Delete expired/invalid cache envelopes without returning their contents."""
    current_time = time.time() if now is None else now
    deleted = 0
    try:
        paths = list(cache_dir.glob("*.json"))
    except OSError:
        return 0
    for path in paths:
        try:
            envelope = json.loads(path.read_text(encoding="utf-8"))
            expires_at = envelope.get("expires_at_unix") if isinstance(envelope, dict) else None
            invalid_or_expired = not isinstance(expires_at, (int, float)) or expires_at <= current_time
            if invalid_or_expired:
                path.unlink()
                deleted += 1
        except (OSError, json.JSONDecodeError):
            try:
                path.unlink()
                deleted += 1
            except OSError:
                pass
    return deleted


def narrate_evidence(
    audio_sha256: str,
    evidence: dict[str, Any],
    *,
    api_key: str | None = None,
    cache_dir: Path = CACHE_DIR,
    client_factory: Callable[..., Any] | None = None,
    now: float | None = None,
) -> dict[str, Any]:
    fallback = deterministic_narration(evidence)
    key = cache_key(audio_sha256)
    cache_path = cache_dir / f"{key}.json"
    cached = _read_cache(cache_path, now=now)
    if cached:
        try:
            content = validate_narration(cached, evidence)
            return _result(STATUS_CACHE_HIT, content)
        except ValueError:
            pass
    key_value = api_key if api_key is not None else os.environ.get("OPENAI_API_KEY")
    if not key_value:
        return _result(STATUS_FALLBACK, fallback)
    stage = "client_setup"
    try:
        if client_factory is None:
            from openai import OpenAI
            client_factory = OpenAI
        client = client_factory(api_key=key_value, timeout=TIMEOUT_SECONDS, max_retries=1)
        stage = "responses_api"
        response = client.responses.create(
            model=MODEL,
            reasoning={"effort": "low"},
            store=False,
            max_output_tokens=MAX_OUTPUT_TOKENS,
            text={
                "verbosity": "low",
                "format": {
                    "type": "json_schema",
                    "name": "whale_evidence_narration",
                    "strict": True,
                    "schema": NARRATION_SCHEMA,
                },
            },
            input=[
                {"role": "system", "content": SYSTEM_INSTRUCTIONS},
                {"role": "user", "content": json.dumps(evidence, separators=(",", ":"), sort_keys=True)},
            ],
        )
        stage = "response_json"
        content = validate_narration(json.loads(response.output_text), evidence)
        stage = "cache_write"
        _write_cache(cache_path, content, now=now)
        return _result(STATUS_GENERATED, content)
    except ValueError as exc:
        LOGGER.warning("evidence_narrator_fallback stage=%s validation_error=%s", stage, exc)
        return _result(STATUS_FALLBACK, fallback)
    except Exception as exc:
        LOGGER.warning(
            "evidence_narrator_fallback stage=%s error_type=%s status_code=%s",
            stage,
            type(exc).__name__,
            getattr(exc, "status_code", None),
        )
        return _result(STATUS_FALLBACK, fallback)


def _result(status: str, content: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": status,
        "content": content,
        "model": MODEL if status != STATUS_FALLBACK else None,
        "prompt_version": PROMPT_VERSION,
        "evidence_version": EVIDENCE_VERSION,
    }
