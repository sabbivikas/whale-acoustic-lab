# Third-party licenses and provenance

This file separates the Whale Acoustic Lab code license from third-party software, data, and model artifacts. The root MIT license applies only to original project code and documentation unless a file states otherwise.

## Runtime and development software

| Component | Version used | License | Source | Use |
|---|---:|---|---|---|
| Three.js | 0.185.1 | MIT | https://github.com/mrdoob/three.js | Browser 3D homepage. |
| `@types/three` | 0.185.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | Type declarations. |
| Vite | 6.4.3 resolved | MIT | https://github.com/vitejs/vite | Frontend build tooling. |
| TypeScript | 5.9.3 resolved | Apache-2.0 | https://github.com/microsoft/TypeScript | Type checking/compiler. |
| tsx | 4.23.1 resolved | MIT | https://github.com/privatenumber/tsx | TypeScript test execution. |
| `@types/node` | 22.20.1 resolved | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | Node.js type declarations. |

Exact JavaScript dependency versions are locked in `frontend/package-lock.json`. Transitive dependency notices must be preserved when redistributing bundled dependencies.

The Modal image also installs Python packages including Cython, NumPy, PyTorch, torchaudio, torchvision, FastAPI, python-multipart, OpenAI’s Python SDK, Audiotools, and WhAM/VampNet dependencies. These packages are fetched at image-build time and are not vendored here. Their own licenses apply; a production distributor should generate and review a locked Python software bill of materials before release.

## Fonts

The frontend requests **DM Sans** and **Manrope** from Google Fonts at runtime. Both families are distributed under SIL Open Font License 1.1. No font binaries are stored in this repository. Loading Google Fonts contacts Google; deployments with stricter privacy requirements should self-host properly licensed font files and retain their license texts.

## Project CETI WhAM

- Source: https://github.com/Project-CETI/wham
- Pinned source commit used by the backend: `00a8b787c040db23cd51ac4417481a09ac354985`
- Source-code license: MIT, copyright Project CETI.
- Model weights: https://doi.org/10.5281/zenodo.17633708
- Weight license: Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0).

WhAM source code and WhAM checkpoints are separate artifacts under separate terms. **No checkpoint is included in this repository.** The root MIT license does not cover the weights. Their noncommercial/no-derivatives restrictions require an independent use review before any public or commercial service uses them.

## Dominica Sperm Whale Project dataset

- Dataset: https://huggingface.co/datasets/orrp/DSWP
- License: Creative Commons Attribution 4.0 International (CC BY 4.0).
- Associated work: Orr Paradise et al., “Towards A Translative Model of Sperm Whale Vocalization,” NeurIPS 2025.

`frontend/public/samples/dswp-1.wav` is the single intended public sample. Its source URL, checksum, attribution, and dataset-level provenance are recorded in `references/manifest.json` and `references/ATTRIBUTION.md`.

The 25 files currently under `references/audio/` are local index-source copies. They are not required by the runtime and are excluded by the root `.gitignore`; do not publish them without intentionally deciding to redistribute the files and preserving per-file attribution.

## EC1 archived data and derived timing/dialogue indexes

- Article: Pratyusha Sharma et al., “Contextual and combinatorial structure in sperm whale vocalisations,” *Nature Communications* 15, 3617 (2024), https://doi.org/10.1038/s41467-024-47221-8
- Code/data repository: https://github.com/pratyushasharma/sw-combinatoriality
- Archived release: https://doi.org/10.5281/zenodo.10817697

License authority: the DOI-pinned Zenodo archived release. Its Rights section identifies the release as **Creative Commons Attribution 4.0 International (CC BY 4.0)**. This project does not claim that unrelated future GitHub revisions automatically share those terms.

Raw local build inputs copied from the archive include:

- `references/coda_code/source/DominicaCodas.csv`
- `references/coda_code/source/sperm-whale-dialogues.csv`
- `references/coda_code/source/rhythms.p`
- `references/coda_code/source/ornaments.p`

Those raw inputs remain ignored and are not approved for publication because they are unnecessary at runtime. The following modified/derived CC BY 4.0 files are required and approved:

- `references/coda_code/rhythm_reference_index.json`
- `references/coda_code/dialogue_context_index.json`
- `references/coda_code/segmentation_thresholds.json`

Exact source/derived hashes, transformations, generators, dates, and attribution are in `references/coda_code/ATTRIBUTION.md`, `LICENSE.md`, `PROVENANCE.md`, and `provenance.json`. EC1 material is not MIT-licensed; only the original generation/application code is covered by the root MIT license.

## Homepage sperm whale

No third-party whale model is included. The whale is generated procedurally at runtime in `frontend/src/home-ocean-scene.ts`. It uses original project code and Three.js primitives/materials.

Model options previously reviewed but not included:

- CARI’MAM “Sperm whale,” by Weeteam with Caribbean-region scientists: CC BY-NC-SA; not used because of noncommercial/share-alike restrictions.
- Poly by Google “Sperm Whale”: CC BY; not used because its low-poly direction did not meet the project’s visual requirements.

No model with unknown, editorial-only, noncommercial, or otherwise incompatible terms was downloaded or bundled.
