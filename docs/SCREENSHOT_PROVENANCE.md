# Screenshot provenance

Release screenshot review date: 2026-07-23.

All captures were produced from a local Vite development server. Analysis
screens used a deterministic, loopback-only fixture server and a locally
generated synthetic WAV containing click impulses. Corpus Explorer used six
synthetic research-package JSON files. **No production backend access**,
remote inference, private recording, private research export, user account, or
personal data was used.

The browser viewport was captured locally and each PNG was cropped only at the
bottom edge to an exact 3:2 ratio of 1158×772. No scientific values were added
or altered during image processing.

## Reviewed files

| Filename | Dimensions | File size | Data source | Capture method | Backend access | Attribution |
|---|---:|---:|---|---|---|---|
| `homepage-ocean.png` | 1158×772 | 295,722 bytes | No recording data; original procedural Three.js sperm-whale scene | Local browser capture; bottom-edge 3:2 crop | No | Original Whale Acoustic Lab code and procedural geometry; MIT |
| `call-story.png` | 1158×772 | 240,361 bytes | Clearly named synthetic click recording and synthetic measured response | Local browser capture against loopback-only fixture; bottom-edge 3:2 crop | No production backend access | Synthetic fixture; no third-party recording |
| `research-mode.png` | 1158×772 | 292,198 bytes | Locally generated synthetic click audio and annotations | Local browser capture against loopback-only fixture; bottom-edge 3:2 crop | No production backend access | Synthetic fixture; no third-party recording |
| `annotation-evaluation.png` | 1158×772 | 281,136 bytes | Synthetic automatic annotations and identical synthetic review set | Local browser capture against loopback-only fixture; bottom-edge 3:2 crop | No production backend access | Synthetic fixture; review set is not ground truth |
| `corpus-explorer.png` | 1158×772 | 284,227 bytes | Six files named `Synthetic demo recording 01` through `06`, with deterministic synthetic vectors | Browser-only import and local PCA/similarity; bottom-edge 3:2 crop | No | Synthetic packages; no model inference or biological claim |

## Privacy and scientific review

The reviewed PNGs contain:

- no usernames, tokens, local filesystem paths, browser bookmarks, private
  recordings, research notes, or personal data;
- no loading state, error banner, broken layout, clipped product control, or
  horizontal overflow;
- visible synthetic filenames or synthetic recording labels on every
  data-bearing view;
- neutral terms such as *probable coda*, *review set*, and *model-space
  comparison*; and
- no literal translation, whale identity, clan, dialect, meaning, intent, or
  behavioral claim.

No private recordings or researcher-generated exports were used. The
attributed DSWP sample remains available in the product but was not needed for
these release captures.
