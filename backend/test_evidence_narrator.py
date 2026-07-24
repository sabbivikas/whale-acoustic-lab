"""No-network tests for GPT evidence narration, validation, caching, and fallback."""

import json
import tempfile
import unittest
from pathlib import Path

from evidence_narrator import (
    CACHE_SCHEMA_VERSION, CACHE_TTL_SECONDS,
    STATUS_CACHE_HIT, STATUS_FALLBACK, STATUS_GENERATED,
    cache_key, compact_evidence, delete_cached_narration,
    delete_expired_cached_narrations, narrate_evidence, validate_narration,
)


def analysis() -> dict:
    role = {"role": "Unclear", "evidence_level": "insufficient evidence", "supporting_statistics": []}
    measured = {
        "headline": "A fast, regular five-click coda",
        "measurements": {
            "click_count": 5, "total_duration_seconds": .4,
            "mean_inter_click_interval_seconds": .1, "median_inter_click_interval_seconds": .1,
            "regularity": "regular", "timing_direction": "approximately even",
            "click_grouping": "evenly spaced", "beginning_vs_ending_pace": "about the same pace",
        },
        "nearest_published_family": {"name": "5R family", "match_strength": "accepted", "outside_accepted_range": False},
    }
    return {"filename": "must-not-leak.wav", "embedding": [1.0] * 1280, "raw_audio": b"no", "coda_sequence": {
        "probable_coda_count": 1, "rejected_click_count": 0,
        "sequence_interpretation": {"measured_summary": "We detected one probable coda: a regular phrase.", "conversational_role_summary": "Possible conversational role: unclear."},
        "segments": [{"start_time_seconds": 0.1, "end_time_seconds": 0.5, "analysis": {
            "measured_rhythm": measured, "published_tempo_type": 0,
            "interpretation": {"interaction_hypothesis": role},
        }}],
    }}


def valid_payload() -> dict:
    return {
        "headline": "One measured coda",
        "sequence_explanation": "One probable coda contains 5 estimated clicks.",
        "why_it_is_interesting": "Its measured timing is approximately even.",
        "evidence_points": ["1 probable coda was detected.", "0 clicks were unassigned.", "The coda has 5 clicks."],
        "creative_analogy": "In human musical terms... it resembles a steady rhythmic phrase.",
        "uncertainty": "Literal interpretation remains unknown.",
        "literal_translation": False,
    }


class FakeResponses:
    def __init__(self, payload=None, error=None): self.payload, self.error, self.calls = payload, error, []
    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error: raise self.error
        return type("Response", (), {"output_text": json.dumps(self.payload)})()


class FakeClient:
    def __init__(self, responses): self.responses = responses


class EvidenceNarratorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.evidence = compact_evidence(analysis())
        self.temp = tempfile.TemporaryDirectory()
        self.cache = Path(self.temp.name)

    def tearDown(self) -> None: self.temp.cleanup()

    def factory(self, responses):
        return lambda **_kwargs: FakeClient(responses)

    def test_compact_evidence_never_contains_raw_audio_embedding_or_filename(self):
        text = json.dumps(self.evidence)
        self.assertNotIn("must-not-leak", text)
        self.assertNotIn("embedding", text)
        self.assertNotIn("raw_audio", text)
        self.assertLess(len(text), 4000)

    def test_valid_output_and_request_controls(self):
        responses = FakeResponses(valid_payload())
        result = narrate_evidence("a" * 64, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(responses))
        self.assertEqual(result["status"], STATUS_GENERATED)
        request = responses.calls[0]
        self.assertFalse(request["store"])
        self.assertEqual(request["reasoning"], {"effort": "low"})
        self.assertEqual(request["text"]["format"]["type"], "json_schema")
        self.assertNotIn("test", json.dumps(result))
        self.assertNotIn("api_key", json.dumps(result))

    def test_missing_key_uses_deterministic_fallback(self):
        result = narrate_evidence("b" * 64, self.evidence, api_key="", cache_dir=self.cache)
        self.assertEqual(result["status"], STATUS_FALLBACK)

    def test_timeout_uses_fallback_without_exposing_error(self):
        result = narrate_evidence("c" * 64, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(FakeResponses(error=TimeoutError("secret internal"))))
        self.assertEqual(result["status"], STATUS_FALLBACK)
        self.assertNotIn("secret internal", json.dumps(result))

    def test_invalid_schema_and_prohibited_claim_use_fallback(self):
        for payload in ({"headline": "missing"}, {**valid_payload(), "headline": "The whale said hello"}):
            result = narrate_evidence("d" * 64, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(FakeResponses(payload)))
            self.assertEqual(result["status"], STATUS_FALLBACK)

    def test_invented_measurement_is_rejected(self):
        payload = valid_payload()
        payload["evidence_points"][0] = "99 probable codas were detected."
        with self.assertRaises(ValueError): validate_narration(payload, self.evidence)

    def test_explicit_uncertainty_is_not_mistaken_for_a_meaning_claim(self):
        payload = valid_payload()
        payload["uncertainty"] = (
            "Literal meaning, identity, emotion, clan, dialect, and intent remain unknown."
        )
        self.assertEqual(validate_narration(payload, self.evidence), payload)

    def test_cache_miss_then_hit_makes_only_one_generation(self):
        responses = FakeResponses(valid_payload())
        first = narrate_evidence("e" * 64, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(responses), now=1_000)
        second = narrate_evidence("e" * 64, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(responses), now=1_001)
        self.assertEqual(first["status"], STATUS_GENERATED)
        self.assertEqual(second["status"], STATUS_CACHE_HIT)
        self.assertEqual(len(responses.calls), 1)

    def test_expired_cache_entry_is_invalid_and_regenerated(self):
        responses = FakeResponses(valid_payload())
        audio_hash = "f" * 64
        first = narrate_evidence(audio_hash, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(responses), now=2_000)
        before_expiry = narrate_evidence(audio_hash, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(responses), now=2_000 + CACHE_TTL_SECONDS - 1)
        at_expiry = narrate_evidence(audio_hash, self.evidence, api_key="test", cache_dir=self.cache, client_factory=self.factory(responses), now=2_000 + CACHE_TTL_SECONDS)
        self.assertEqual(first["status"], STATUS_GENERATED)
        self.assertEqual(before_expiry["status"], STATUS_CACHE_HIT)
        self.assertEqual(at_expiry["status"], STATUS_GENERATED)
        self.assertEqual(len(responses.calls), 2)

    def test_cache_stores_only_minimal_versioned_envelope_and_narration(self):
        audio_hash = "1" * 64
        narrate_evidence(
            audio_hash, self.evidence, api_key="test", cache_dir=self.cache,
            client_factory=self.factory(FakeResponses(valid_payload())), now=3_000,
        )
        envelope = json.loads((self.cache / f"{cache_key(audio_hash)}.json").read_text())
        self.assertEqual(
            set(envelope),
            {"schema_version", "created_at_unix", "expires_at_unix", "content"},
        )
        self.assertEqual(envelope["schema_version"], CACHE_SCHEMA_VERSION)
        self.assertEqual(envelope["expires_at_unix"] - envelope["created_at_unix"], CACHE_TTL_SECONDS)
        rendered = json.dumps(envelope)
        for forbidden in ("raw_audio", "embedding", "filename", "researcher_note", audio_hash):
            self.assertNotIn(forbidden, rendered)

    def test_operator_deletion_is_hash_addressed_and_returns_no_content(self):
        audio_hash = "2" * 64
        narrate_evidence(
            audio_hash, self.evidence, api_key="test", cache_dir=self.cache,
            client_factory=self.factory(FakeResponses(valid_payload())), now=4_000,
        )
        self.assertTrue(delete_cached_narration(audio_hash, cache_dir=self.cache))
        self.assertFalse(delete_cached_narration(audio_hash, cache_dir=self.cache))
        with self.assertRaises(ValueError):
            delete_cached_narration("../not-a-hash", cache_dir=self.cache)

    def test_expired_cleanup_deletes_only_expired_entries(self):
        expired_hash, current_hash = "3" * 64, "4" * 64
        for audio_hash, created_at in ((expired_hash, 5_000), (current_hash, 5_100)):
            narrate_evidence(
                audio_hash, self.evidence, api_key="test", cache_dir=self.cache,
                client_factory=self.factory(FakeResponses(valid_payload())), now=created_at,
            )
        deleted = delete_expired_cached_narrations(
            cache_dir=self.cache,
            now=5_000 + CACHE_TTL_SECONDS,
        )
        self.assertEqual(deleted, 1)
        self.assertFalse((self.cache / f"{cache_key(expired_hash)}.json").exists())
        self.assertTrue((self.cache / f"{cache_key(current_hash)}.json").exists())


if __name__ == "__main__": unittest.main()
