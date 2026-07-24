# Dependency policy

## Principles

- Production and research behavior must be reproducible from reviewed versions.
- WhAM, PyTorch, torchaudio, torchvision, NumPy, CUDA, and audio dependencies are compatibility-critical. They are never upgraded silently.
- Git dependencies use immutable commit hashes, not branches or tags.
- Model checkpoints are external runtime assets, not Python dependencies, and are never committed.
- CI uses only local/pure tests. It must not invoke Modal, WhAM inference, GPUs, OpenAI, paid APIs, deployments, or index builders.

## Sources of truth

- `backend/requirements.lock`: direct production compatibility roots and Git commits.
- `backend/requirements-dev.lock`: developer tooling.
- `frontend/package-lock.json`: exact JavaScript dependency graph.
- `backend/wham_embedding_api.py`: declared production image and runtime mounts.
- `SBOM.md`: human-readable runtime, license, redistribution, and concern inventory.

The Python lock is a direct compatibility lock, not yet a hash-complete snapshot of an already built Modal image. Before public production, capture `pip freeze`, wheel hashes, Debian package versions, FFmpeg configuration, CUDA versions, and the base-image identity from the deployed image. Review differences rather than automatically replacing this lock.

## Change process

1. State the reason, security impact, license impact, and expected behavior change.
2. Update the applicable lockfile and SBOM in the same change.
3. For WhAM/PyTorch/NumPy/CUDA/audio changes, build a separate candidate image and run the existing compatibility test only with explicit authorization and a cost review.
4. Compare embedding shape, reference behavior, audio decode coverage, and scientific outputs. Do not regenerate reference indexes as a side effect.
5. Review upstream license files and security advisories.
6. Roll out only after local gates, private CI, and a documented rollback path pass.

## System packages and containers

The current Modal definition uses Debian APT for FFmpeg, `libsndfile1`, Git, and build tools. A future release should pin an immutable image/snapshot if Modal supports the required mechanism, or at minimum record installed package versions and the image build identifier. FFmpeg license behavior depends on compile options, so its actual `-version` and configuration output must be retained with the release record.

## Vulnerabilities

Security updates do not override scientific compatibility. For a critical vulnerability:

1. determine reachability in the deployed service;
2. disable or isolate affected functionality if necessary;
3. test the smallest compatible patched version;
4. record the exception if an immediate upgrade is unsafe;
5. never suppress an advisory without an owner and review date.

## Licenses

The project MIT license does not relicense dependencies, datasets, or model weights. The production image deliberately removes VampNet’s unused WaveBeat installer declaration; reintroducing WaveBeat requires a new reachability, scientific-need, compatibility, and GPL review. CC BY-NC-ND WhAM weights, CC BY EC1/DSWP materials, and font licenses retain their own terms. Distribution of a container or bundled artifact requires a fresh license-notice and source-obligation review.
