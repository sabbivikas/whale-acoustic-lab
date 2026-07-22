"""Transparent boundary-only active-audio trimming for 16-bit PCM WAV."""

import array
import io
import math
import sys
import wave
from dataclasses import dataclass


FRAME_SECONDS = 0.020
DEFAULT_PADDING_SECONDS = 0.150
PEAK_THRESHOLD_RATIO = 0.05
NOISE_MULTIPLIER = 4.0
MINIMUM_RELIABLE_PEAK_RMS = 0.002
MINIMUM_ACTIVE_SPAN_SECONDS = 1.0


class AudioTrimmingError(ValueError):
    """Raised when no reliable, sufficiently long active region exists."""


@dataclass(frozen=True)
class TrimmedAudio:
    wav_bytes: bytes
    original_duration_seconds: float
    analyzed_duration_seconds: float
    trim_start_seconds: float
    trim_end_seconds: float
    trimming_applied: bool


def trim_wav_bytes(payload: bytes, padding_seconds: float = DEFAULT_PADDING_SECONDS) -> TrimmedAudio:
    if padding_seconds < 0:
        raise ValueError("padding_seconds must not be negative")
    with wave.open(io.BytesIO(payload), "rb") as source:
        if source.getcomptype() != "NONE" or source.getsampwidth() != 2:
            raise AudioTrimmingError("active-audio trimming requires uncompressed 16-bit PCM WAV")
        parameters = source.getparams()
        channels = source.getnchannels()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
        raw = source.readframes(frame_count)

    pcm = array.array("h")
    pcm.frombytes(raw)
    if sys.byteorder != "little":
        pcm.byteswap()
    mono = [
        math.fsum(pcm[index : index + channels]) / (channels * 32768.0)
        for index in range(0, len(pcm), channels)
    ]
    if not mono or sample_rate <= 0:
        raise AudioTrimmingError("audio contains no samples")

    frame_size = max(1, round(sample_rate * FRAME_SECONDS))
    energies = [
        math.sqrt(math.fsum(value * value for value in mono[start : start + frame_size]) / len(mono[start : start + frame_size]))
        for start in range(0, len(mono), frame_size)
    ]
    peak_rms = max(energies)
    if peak_rms < MINIMUM_RELIABLE_PEAK_RMS:
        raise AudioTrimmingError("no reliable active audio region was detected above the room-noise floor")
    ordered = sorted(energies)
    quiet_count = max(1, math.ceil(len(ordered) * 0.1))
    noise_floor = math.fsum(ordered[:quiet_count]) / quiet_count
    threshold = max(peak_rms * PEAK_THRESHOLD_RATIO, noise_floor * NOISE_MULTIPLIER, 1e-5)
    active_frames = [index for index, rms in enumerate(energies) if rms >= threshold]
    if not active_frames:
        raise AudioTrimmingError("no reliable active audio region was detected")

    active_start_sample = active_frames[0] * frame_size
    active_end_sample = min(len(mono), (active_frames[-1] + 1) * frame_size)
    active_span_seconds = (active_end_sample - active_start_sample) / sample_rate
    if active_span_seconds < MINIMUM_ACTIVE_SPAN_SECONDS:
        raise AudioTrimmingError(
            f"detected active audio is {active_span_seconds:.3f} seconds; at least 1.000 second is required"
        )

    padding_samples = round(padding_seconds * sample_rate)
    trim_start_sample = max(0, active_start_sample - padding_samples)
    trim_end_sample = min(len(mono), active_end_sample + padding_samples)
    start_byte = trim_start_sample * channels * 2
    end_byte = trim_end_sample * channels * 2
    output = io.BytesIO()
    with wave.open(output, "wb") as destination:
        destination.setparams(parameters)
        destination.setnframes(trim_end_sample - trim_start_sample)
        destination.writeframes(raw[start_byte:end_byte])

    original_duration = len(mono) / sample_rate
    trim_start = trim_start_sample / sample_rate
    trim_end = trim_end_sample / sample_rate
    return TrimmedAudio(
        wav_bytes=output.getvalue(),
        original_duration_seconds=original_duration,
        analyzed_duration_seconds=(trim_end_sample - trim_start_sample) / sample_rate,
        trim_start_seconds=trim_start,
        trim_end_seconds=trim_end,
        trimming_applied=trim_start_sample > 0 or trim_end_sample < len(mono),
    )
