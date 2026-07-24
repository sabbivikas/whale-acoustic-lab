# Project CETI WhAM weights notice

Whale Acoustic Lab is presented as a **noncommercial research and educational demonstration**.

## Separate licenses

- Project CETI WhAM source code: MIT at the pinned source commit `00a8b787c040db23cd51ac4417481a09ac354985`.
- WhAM model checkpoints: “WhAM (Whale Acoustics Model) weights,” creator Orr Paradise, distributed separately through [Zenodo record 17633708](https://doi.org/10.5281/zenodo.17633708) under [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International](https://creativecommons.org/licenses/by-nc-nd/4.0/).

The MIT source license does not cover or relicense the checkpoints. This repository does not claim legal clearance beyond the published terms.

## Application safeguards

- No checkpoint, model-weight file, or weight URL payload is stored in Git or frontend assets.
- Production code expects `codec.pth` and `coarse.pth` only in the private operator-controlled Modal Volume mounted at `/weights`.
- The separate `c2f.pth` and `wavebeat.pth` files listed by Zenodo are not required or mounted by the production API.
- The public FastAPI surface exposes only `POST /embed` and `POST /analyze`; it exposes no weight listing, file-serving, or download route.
- The browser never receives checkpoint bytes or a private Volume path.
- Release checks reject tracked/common checkpoint formats and inspect the production route boundary.

## Operator responsibility

Commercial operators must obtain their own permission or other valid legal basis from the applicable rights holders. Operators are responsible for confirming that their planned use, hosting arrangement, territory, and any service terms comply with the checkpoint license. The project’s noncommercial presentation is not a substitute for legal advice or rights-holder permission.
