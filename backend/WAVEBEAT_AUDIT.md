# WaveBeat production reachability audit

Audit date: 2026-07-23
WhAM source commit: `00a8b787c040db23cd51ac4417481a09ac354985`

## Conclusion

WaveBeat is **not required** by Whale Acoustic Lab’s current production features.

The application:

- constructs `vampnet.interface.Interface` with only codec and coarse checkpoints;
- uses `vampnet_embed(...)` to preprocess audio, encode codec tokens, run the coarse VampNet model, and mean-pool activations;
- performs click detection in Whale Acoustic Lab’s local waveform-analysis module, not with WaveBeat;
- never loads a WaveBeat checkpoint;
- never calls `snap_to_beats`, `make_beat_mask`, or another beat-tracker method.

## Upstream evidence

At the pinned commit:

- `vampnet/setup.py` declares WaveBeat unconditionally.
- `vampnet/vampnet/interface.py` constructs `WaveBeat` only when `wavebeat_ckpt` is not `None`.
- `vampnet/vampnet/beats.py` imports `wavebeat.dstcn` only inside `WaveBeat.__init__`, not at module import time.
- `vampnet/scripts/utils/visualize_embeddings.py::vampnet_embed` does not access `beat_tracker`.

Pinned source:

- https://github.com/Project-CETI/wham/blob/00a8b787c040db23cd51ac4417481a09ac354985/vampnet/setup.py
- https://github.com/Project-CETI/wham/blob/00a8b787c040db23cd51ac4417481a09ac354985/vampnet/vampnet/interface.py
- https://github.com/Project-CETI/wham/blob/00a8b787c040db23cd51ac4417481a09ac354985/vampnet/vampnet/beats.py
- https://github.com/Project-CETI/wham/blob/00a8b787c040db23cd51ac4417481a09ac354985/vampnet/scripts/utils/visualize_embeddings.py

## Production change

The Modal image removes only the unused WaveBeat requirement line from the pinned VampNet `setup.py` before installing that package. No WhAM model code, checkpoint, embedding calculation, click calculation, segmentation, rhythm analysis, narration, or reference matching is changed.

Static release tests require:

- the installer removal step;
- no WaveBeat entry in `backend/requirements.lock`;
- no `wavebeat_ckpt` or WaveBeat checkpoint in the production API; and
- no public weight/checkpoint route.
