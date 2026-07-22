# Active-audio boundary trimming

The analyzer transparently removes only low-energy audio before the first reliable active frame and after the last reliable active frame. It never removes gaps inside that span.

Audio is divided into 20 ms frames and each frame’s RMS waveform energy is measured. The activity threshold is the maximum of 5% of peak frame RMS, four times the mean RMS of the quietest 10% of frames, and `1e-5`. A peak below `0.002` full scale is treated as having no reliable active region. The first and last frames above the threshold define the active span, with 150 ms of configurable padding restored at each boundary.

The unpadded active span must be at least one second. Otherwise analysis stops with an error. Failure cases include recordings where playback is too quiet, sustained room noise is as loud as the target, automatic gain control raises silence, or unrelated sounds occur near a boundary. The response always reports original duration, analyzed duration, exact trim boundaries, and whether trimming occurred.
