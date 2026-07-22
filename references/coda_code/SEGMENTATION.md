# Automatic multi-coda segmentation

All boundaries are waveform-derived estimates, not scientific annotations.

## Measured distributions

- Included EC1 within-coda ICIs: 30,721. Median 0.156356 s; 95th percentile 0.442600 s; 99th percentile 0.485883 s; maximum 0.551720 s.
- Positive between-coda silent gaps: 2,910; 908 overlapping pairs are excluded. Median 3.085446 s; 5th percentile 0.328220 s.

## Rule

- Split threshold: **0.517216 s**, selected by maximum balanced accuracy (96.190%) between within-coda ICIs and positive between-coda silence.
- Ambiguity band: **0.485883–0.551720 s**, from the within-coda 99th percentile through its observed maximum.
- At the split threshold: between-coda sensitivity 92.612%; within-coda specificity 99.769%.
- Gaps above 0.551720 s are clear because they exceed every included EC1 within-coda ICI; this retains 92.302% of positive between-coda gaps.

## Limitations

- Dialogue codas can overlap; negative silent gaps cannot teach a one-dimensional gap boundary and are reported separately.
- Waveform click detection errors propagate into segmentation. Reverberation may add clicks and weak clicks may be missed.
- Groups with fewer than three clicks are rejected as isolated/noise candidates. Groups above ten clicks are not forced into published coda families.
- An ambiguous boundary is still a split when it exceeds the balanced-accuracy threshold, but its uncertainty is returned. Potential boundaries below that threshold remain marked without forcing a split.
