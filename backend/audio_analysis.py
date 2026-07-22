"""Transparent waveform-only click-onset estimates for PCM WAV audio."""

import array
import io
import math
import statistics
import sys
import wave
from typing import Sequence


ENVELOPE_WINDOW_SECONDS = 0.001
REFRACTORY_SECONDS = 0.040
MAD_MULTIPLIER = 10.0
PEAK_ENERGY_FLOOR_RATIO = 0.01
ESTIMATE_NOTE = (
    "Click locations are estimated from the waveform and were not supplied as scientific annotations."
)


def _moving_average(values: Sequence[float], window: int) -> list[float]:
    prefix = [0.0]
    for value in values:
        prefix.append(prefix[-1] + value)
    half = window // 2
    return [
        (prefix[min(len(values), index + half + 1)] - prefix[max(0, index - half)])
        / (min(len(values), index + half + 1) - max(0, index - half))
        for index in range(len(values))
    ]


def analyze_pcm(samples: Sequence[float], sample_rate: int) -> dict:
    if sample_rate <= 0 or not samples:
        raise ValueError("audio must contain samples with a positive sample rate")

    normalized = [max(-1.0, min(1.0, float(sample))) for sample in samples]
    emphasized = [normalized[0]] + [
        normalized[index] - 0.97 * normalized[index - 1]
        for index in range(1, len(normalized))
    ]
    instantaneous_energy = [value * value for value in emphasized]
    window = max(1, round(sample_rate * ENVELOPE_WINDOW_SECONDS))
    envelope = _moving_average(instantaneous_energy, window)
    median_energy = statistics.median(envelope)
    mad = statistics.median(abs(value - median_energy) for value in envelope)
    robust_sigma = 1.4826 * mad
    peak_energy = max(envelope)
    threshold = max(
        median_energy + MAD_MULTIPLIER * robust_sigma,
        peak_energy * PEAK_ENERGY_FLOOR_RATIO,
        1e-12,
    )

    regions: list[tuple[int, int]] = []
    start = None
    for index, value in enumerate(envelope):
        if value >= threshold and start is None:
            start = index
        elif value < threshold and start is not None:
            regions.append((start, index))
            start = None
    if start is not None:
        regions.append((start, len(envelope)))

    candidates = [
        max(range(start, end), key=lambda index: instantaneous_energy[index])
        for start, end in regions
        if end > start
    ]
    refractory_samples = max(1, round(sample_rate * REFRACTORY_SECONDS))
    selected: list[int] = []
    for candidate in sorted(candidates, key=lambda index: instantaneous_energy[index], reverse=True):
        if all(abs(candidate - existing) >= refractory_samples for existing in selected):
            selected.append(candidate)
    selected.sort()

    onsets = [index / sample_rate for index in selected]
    intervals = [right - left for left, right in zip(onsets, onsets[1:])]
    average_interval = statistics.fmean(intervals) if intervals else None
    normalized_rhythm = (
        [interval / average_interval for interval in intervals]
        if average_interval and average_interval > 0
        else []
    )
    return {
        "estimate_status": "algorithmic_estimate_without_ground_truth_timestamps",
        "ground_truth_click_timestamps_available": False,
        "estimate_note": ESTIMATE_NOTE,
        "estimated_click_count": len(onsets),
        "estimated_click_onsets_seconds": onsets,
        "estimated_inter_click_intervals_seconds": intervals,
        "estimated_average_inter_click_interval_seconds": average_interval,
        "recording_duration_seconds": len(samples) / sample_rate,
        "estimated_normalized_rhythm_pattern": normalized_rhythm,
        "normalized_rhythm_definition": "Each estimated inter-click interval divided by the average estimated inter-click interval.",
        "method": {
            "signal": "mono waveform with first-order pre-emphasis coefficient 0.97",
            "energy_envelope_window_seconds": ENVELOPE_WINDOW_SECONDS,
            "threshold": "max(median + 10 × 1.4826 × MAD, 1% of peak envelope energy)",
            "refractory_period_seconds": REFRACTORY_SECONDS,
        },
    }


def analyze_wav_bytes(payload: bytes) -> dict:
    with wave.open(io.BytesIO(payload), "rb") as wav:
        if wav.getcomptype() != "NONE" or wav.getsampwidth() != 2:
            raise ValueError("click analysis currently requires uncompressed 16-bit PCM WAV")
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        raw = wav.readframes(wav.getnframes())
    pcm = array.array("h")
    pcm.frombytes(raw)
    if sys.byteorder != "little":
        pcm.byteswap()
    mono = [
        math.fsum(pcm[index : index + channels]) / (channels * 32768.0)
        for index in range(0, len(pcm), channels)
    ]
    return analyze_pcm(mono, sample_rate)
