"""Decode common WAV encodings to a normalized mono 16-bit PCM WAV."""

import io
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path


DECODE_TIMEOUT_SECONDS = 30


class AudioDecodeError(ValueError):
    """Raised when an uploaded WAV cannot be decoded safely."""


@dataclass(frozen=True)
class DecodedWav:
    wav_bytes: bytes
    duration_seconds: float
    sample_rate_hz: int
    channels: int = 1
    bit_depth: int = 16


def decode_wav_to_pcm16_mono(payload: bytes) -> DecodedWav:
    if len(payload) < 12 or payload[:4] not in {b"RIFF", b"RIFX", b"RF64"} or payload[8:12] != b"WAVE":
        raise AudioDecodeError("uploaded audio is not a recognized WAV container")

    try:
        with tempfile.TemporaryDirectory(prefix="whale-audio-decode-") as directory:
            source_path = Path(directory) / "upload.wav"
            output_path = Path(directory) / "normalized.wav"
            source_path.write_bytes(payload)
            process = subprocess.run(
                [
                    "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", str(source_path), "-map", "0:a:0", "-vn", "-ac", "1",
                    "-c:a", "pcm_s16le", str(output_path),
                ],
                capture_output=True,
                text=True,
                timeout=DECODE_TIMEOUT_SECONDS,
                check=False,
            )
            if process.returncode != 0 or not output_path.is_file():
                detail = process.stderr.strip().splitlines()[-1] if process.stderr.strip() else "unknown decoder error"
                raise AudioDecodeError(f"WAV could not be decoded: {detail}")
            normalized = output_path.read_bytes()
    except FileNotFoundError as exc:
        raise AudioDecodeError("server audio decoder is unavailable") from exc
    except subprocess.TimeoutExpired as exc:
        raise AudioDecodeError("WAV decoding exceeded the 30-second limit") from exc

    try:
        with wave.open(io.BytesIO(normalized), "rb") as wav:
            sample_rate = wav.getframerate()
            frames = wav.getnframes()
            if wav.getcomptype() != "NONE" or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
                raise AudioDecodeError("decoder did not produce mono 16-bit PCM")
            if sample_rate <= 0 or frames <= 0:
                raise AudioDecodeError("decoded WAV contains no audio frames")
            duration = frames / sample_rate
    except (wave.Error, EOFError) as exc:
        raise AudioDecodeError(f"normalized WAV is invalid: {exc}") from exc

    return DecodedWav(normalized, duration, sample_rate)
