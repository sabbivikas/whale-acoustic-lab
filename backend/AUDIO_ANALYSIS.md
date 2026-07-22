# Transparent click and rhythm estimates

This module estimates impulsive click locations directly from decoded PCM waveform samples. WhAM embeddings are not used.

## Method

1. Decode an uncompressed 16-bit PCM WAV and average channels to mono.
2. Normalize samples to `[-1, 1]` and apply first-order pre-emphasis: `y[n] = x[n] - 0.97x[n-1]`.
3. Square the emphasized waveform and calculate a centered 1 ms moving-average energy envelope.
4. Set the detection threshold to the larger of:
   - `median envelope + 10 × 1.4826 × median absolute deviation`; or
   - 1% of maximum envelope energy.
5. Treat contiguous above-threshold regions as candidates and place each onset at its strongest emphasized waveform sample.
6. Apply 40 ms non-maximum suppression, retaining the strongest candidate when events are too close.
7. Calculate inter-click intervals from successive estimates. The normalized rhythm pattern divides every interval by their mean.

Synthetic tests use impulses at 0.20, 0.55, and 0.90 seconds and require onset estimates within 2 ms.

## Limitations and failure cases

The public DSWP files do not provide ground-truth click timestamps, so every onset and derived rhythm value is an algorithmic estimate. Loud mechanical impulses, clipping, tag contact noise, reverberation, overlapping whales, and echolocation clicks may produce false detections. Quiet clicks can be missed. Clicks separated by less than 40 ms are intentionally merged. The fixed threshold may behave poorly under rapidly changing background noise. Results are descriptive signal measurements and must not be used to assign a coda type or infer biological or semantic attributes.
