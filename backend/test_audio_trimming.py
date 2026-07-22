"""Synthetic tests for boundary-only active-audio trimming."""

import io
import math
import unittest
import wave

from audio_trimming import AudioTrimmingError, trim_wav_bytes


SAMPLE_RATE = 16_000


def wav_with_segments(segments: list[tuple[float, float]]) -> bytes:
    samples = []
    for duration, amplitude in segments:
        samples.extend(
            int(amplitude * math.sin(2 * math.pi * 700 * index / SAMPLE_RATE) * 32767)
            for index in range(round(duration * SAMPLE_RATE))
        )
    raw = b"".join(sample.to_bytes(2, "little", signed=True) for sample in samples)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(SAMPLE_RATE); wav.writeframes(raw)
    return output.getvalue()


class AudioTrimmingTests(unittest.TestCase):
    def test_removes_leading_silence_with_padding(self) -> None:
        result = trim_wav_bytes(wav_with_segments([(1.0, 0), (2.0, 0.5)]))
        self.assertAlmostEqual(result.trim_start_seconds, 0.85, delta=0.03)
        self.assertTrue(result.trimming_applied)

    def test_removes_trailing_silence_with_padding(self) -> None:
        result = trim_wav_bytes(wav_with_segments([(2.0, 0.5), (1.0, 0)]))
        self.assertAlmostEqual(result.trim_end_seconds, 2.15, delta=0.03)

    def test_preserves_internal_silence(self) -> None:
        result = trim_wav_bytes(wav_with_segments([(0.5, 0), (1.0, 0.5), (0.7, 0), (1.0, 0.5), (0.5, 0)]))
        self.assertGreater(result.analyzed_duration_seconds, 2.9)
        with wave.open(io.BytesIO(result.wav_bytes), "rb") as wav:
            self.assertAlmostEqual(wav.getnframes() / wav.getframerate(), result.analyzed_duration_seconds)

    def test_rejects_all_silence(self) -> None:
        with self.assertRaisesRegex(AudioTrimmingError, "no reliable active audio"):
            trim_wav_bytes(wav_with_segments([(3.0, 0)]))

    def test_rejects_very_short_active_audio(self) -> None:
        with self.assertRaisesRegex(AudioTrimmingError, "at least 1.000 second"):
            trim_wav_bytes(wav_with_segments([(1.0, 0), (0.4, 0.5), (1.0, 0)]))


if __name__ == "__main__":
    unittest.main()
