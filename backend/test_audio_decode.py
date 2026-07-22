"""Local format-compatibility tests for WAV normalization."""

import io
import math
import struct
import unittest
import wave
from pathlib import Path

from audio_decode import decode_wav_to_pcm16_mono


SAMPLE_RATE = 22_050
DURATION_SECONDS = 1.2


def samples() -> list[float]:
    return [0.4 * math.sin(2 * math.pi * 440 * index / SAMPLE_RATE) for index in range(round(SAMPLE_RATE * DURATION_SECONDS))]


def pcm_wav(sample_width: int, channels: int) -> bytes:
    frames = bytearray()
    for value in samples():
        maximum = (1 << (sample_width * 8 - 1)) - 1
        encoded = int(value * maximum).to_bytes(sample_width, "little", signed=True)
        frames.extend(encoded * channels)
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(channels); wav.setsampwidth(sample_width); wav.setframerate(SAMPLE_RATE); wav.writeframes(frames)
    return output.getvalue()


def float32_wav() -> bytes:
    data = b"".join(struct.pack("<f", value) for value in samples())
    fmt = struct.pack("<HHIIHH", 3, 1, SAMPLE_RATE, SAMPLE_RATE * 4, 4, 32)
    return b"RIFF" + struct.pack("<I", 4 + (8 + len(fmt)) + (8 + len(data))) + b"WAVEfmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(data)) + data


class AudioDecodeTests(unittest.TestCase):
    def assert_normalized(self, payload: bytes, expected_rate: int = SAMPLE_RATE) -> None:
        decoded = decode_wav_to_pcm16_mono(payload)
        with wave.open(io.BytesIO(decoded.wav_bytes), "rb") as wav:
            self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(wav.getsampwidth(), 2)
            self.assertEqual(wav.getframerate(), expected_rate)
        self.assertAlmostEqual(decoded.duration_seconds, DURATION_SECONDS, delta=0.01)

    def test_stereo_pcm_wav(self) -> None:
        self.assert_normalized(pcm_wav(2, 2))

    def test_24_bit_pcm_wav(self) -> None:
        self.assert_normalized(pcm_wav(3, 1))

    def test_32_bit_float_wav(self) -> None:
        self.assert_normalized(float32_wav())

    def test_existing_16_bit_wav(self) -> None:
        fixture = Path(__file__).resolve().parents[1] / "references" / "audio" / "1.wav"
        decoded = decode_wav_to_pcm16_mono(fixture.read_bytes())
        self.assertEqual(decoded.channels, 1)
        self.assertEqual(decoded.bit_depth, 16)
        self.assertEqual(decoded.sample_rate_hz, 44_100)


if __name__ == "__main__":
    unittest.main()
