# Final publication audit

Audit updated: 2026-07-24. The code repository is public.

## Verdict

**The code repository is public and passed its publication gates. The
zero-cost static frontend is eligible for deployment after local/CI validation
and free-tier confirmation. A full hosted inference service has separate
unresolved launch requirements.**

The EC1 license/provenance blocker remains resolved. The repository is
https://github.com/sabbivikas/whale-acoustic-lab. Ownership, contribution,
governance, private reporting instructions, dependency/SBOM records, privacy
and retention policy, reviewed screenshots, and local release checks are now
present. Model weights, raw EC1 build inputs, private audio, exports, secrets,
and deployment state remain excluded.

## EC1 provenance and publication boundary

Authoritative source:

- Title: “Dataset and Codebase for paper on Contextual and Combinatorial Structure in Sperm Whale Vocalisations”
- Creator: Pratyusha Sharma
- DOI: `10.5281/zenodo.10817697`
- URL: https://zenodo.org/records/10817697
- License: Creative Commons Attribution 4.0 International
- Archive publication date: 2024-03-14
- Audit access date: 2026-07-22

The generated indexes embed the same DOI/license and source SHA-256 values as the local archived-source inventory. Local source bytes match those embedded hashes. Transformation steps, derived hashes, generators, and local generation timestamps are recorded in `references/coda_code/PROVENANCE.md` and `provenance.json`.

Approved derived files:

- `references/coda_code/rhythm_reference_index.json`
- `references/coda_code/dialogue_context_index.json`
- `references/coda_code/segmentation_thresholds.json`
- byte-identical frontend runtime copies:
  `frontend/src/data/rhythm-reference-index.v1.json` and
  `frontend/src/data/segmentation-thresholds.v1.json`

Required accompanying documents:

- `references/coda_code/ATTRIBUTION.md`
- `references/coda_code/LICENSE.md`
- `references/coda_code/PROVENANCE.md`
- `references/coda_code/provenance.json`

Excluded runtime-unnecessary build inputs:

- `references/coda_code/source/DominicaCodas.csv`
- `references/coda_code/source/sperm-whale-dialogues.csv`
- `references/coda_code/source/rhythms.p`
- `references/coda_code/source/ornaments.p`

The CC BY 4.0 conclusion applies to the archived Zenodo release, not unrelated future GitHub revisions. The derived indexes are identified as modified CC BY 4.0 material and are separate from MIT-licensed Whale Acoustic Lab code.

## Clean publication-tree verification

A temporary clean tree was assembled from the exact Git publishable-file inventory. It contained all three indexes, all attribution/provenance documents, backend coda modules, and frontend research source while containing no raw EC1 build-input directory.

From that clean tree:

- all three JSON indexes loaded successfully;
- `coda_code` interpretation executed locally;
- `coda_segmentation` executed locally;
- all 66 frontend tests passed;
- TypeScript type-checking passed; and
- the production frontend build passed.

## Security and privacy result

- Redacted working-tree credential scan: passed.
- Production frontend bundle credential scan: passed.
- Git history scan: passed across the complete pre-release history.
- Staged files: zero.
- Tracked-file publication policy: passed.
- Model/checkpoint files in worktree: zero.
- Required EC1 publication inventory: passed.
- Raw EC1 source files in publishable inventory: zero.
- `OPENAI_API_KEY` frontend source/bundle references: zero from the preceding release audit and unchanged by this documentation/test-only pass.
- Frontend runtime configuration has no compiled default backend URL.
- Research drafts remain in `localStorage`; corpus persistence is explicit IndexedDB; local annotation, evaluation, and export actions do not transmit those data.
- Credential rotation required: no evidence requiring rotation was found.
- `store:false` and the compact GPT evidence boundary are now release-tested.
- The precomputed sample and browser-only analysis make no analysis API request.
- Raw audio can leave the browser only after a researcher explicitly connects
  a compatible backend and then starts a later analysis.
- OpenAI receives no raw audio, full embedding, filename, or researcher note.
- Research Mode, Annotation Evaluation, Corpus Explorer, PCA, annotation edits, and exports remain browser-only.
- Provider defaults are documented separately from production dashboard settings; those dashboard settings are not yet verified.

## Dependency and provider-policy result

- Direct production compatibility roots and immutable Git sources are recorded in `backend/requirements.lock`.
- Local developer tooling is recorded in `backend/requirements-dev.lock`.
- `SBOM.md` records purpose, source, license where verified, runtime location, redistribution status, and unresolved concerns.
- `DEPENDENCY_POLICY.md` prohibits silent upgrades of WhAM, PyTorch, NumPy, CUDA, and audio dependencies.
- WaveBeat was confirmed unreachable from the configured embedding features and removed from the declared production installer path; no WaveBeat checkpoint is configured.
- DM Sans and Manrope are now self-hosted from a pinned authoritative Google Fonts commit with their OFL texts.
- Narration-cache entries have a fixed 30-day validity period and an authenticated, non-HTTP operator deletion function.
- `PRIVACY.md` and `DATA_RETENTION.md` distinguish verified code behavior, current provider policy, and manual dashboard checks.
- The exact deployed Debian/FFmpeg/Python-transitive/CUDA inventory cannot be recovered locally without inspecting or rebuilding the private Modal image; it remains a production verification item.

## License inventory

- Original Whale Acoustic Lab code: MIT; copyright © 2026 Vikas Sabbi.
- EC1 DOI-pinned archive and the three modified derived indexes: CC BY 4.0.
- DSWP bundled public sample: CC BY 4.0.
- Project CETI WhAM source: MIT at the pinned source repository/commit.
- WhAM model weights: separately CC BY-NC-ND 4.0; not included.
- Three.js: MIT.
- DM Sans and Manrope: SIL Open Font License 1.1; self-hosted with pinned provenance and license texts.

## Final local validation

- Frontend tests: **66/66 passed**.
- Pure local backend tests: **70/70 passed**, including three EC1 publication/runtime tests plus WaveBeat, weight-route, cache-lifecycle, font-hosting, and privacy-boundary tests.
- TypeScript type-check: passed.
- Production frontend build: passed.
- Python syntax/compile validation: passed.
- JSON provenance validation: passed.
- `CITATION.cff` and GitHub Actions YAML syntax: passed.
- CI local-only command/policy validation: passed.
- Secret, bundle, history, checkpoint, license, and publishable-file checks: passed.
- `git diff --check`: passed.

The lazy Three.js homepage chunk remains approximately 540 kB minified / 137 kB gzip and produces Vite’s non-blocking 500 kB chunk warning. It is already dynamically loaded and is not a publication blocker.

## Files intentionally excluded from publication

- local `.env` files, especially `frontend/.env.local`;
- OS/editor artifacts;
- `frontend/node_modules/` and `frontend/dist/`;
- Python/test caches;
- Modal and Vercel local state;
- all model/checkpoint formats;
- `test-whale.wav` and `unseen-whale-26.wav`;
- `references/audio/*.wav` local reference copies;
- the four raw EC1 build inputs;
- research, annotation, evaluation, and corpus exports; and
- temporary files.

The sole approved bundled audio is `frontend/public/samples/dswp-1.wav`, with DSWP attribution and checksum metadata.

## Code-repository and hosted-service boundary

The code repository is public and its GitHub-native security protections are
tracked separately from hosting. Private Vulnerability Reporting is the
documented sensitive-reporting path.

The maintainer’s Modal application must remain stopped. The static Vercel
frontend may be deployed without a backend URL, functions, analytics,
databases, or paid features after the zero-cost release gates pass. A
researcher-operated inference service retains the separate blockers below.

## GitHub Actions compatibility

The workflow now uses the officially supported Node 24 generations:

- [`actions/checkout@v7`](https://github.com/actions/checkout/releases)
- [`actions/setup-node@v7`](https://github.com/actions/setup-node/releases)
- [`actions/setup-python@v7`](https://github.com/actions/setup-python/releases)

This replaces the older action generations responsible for the GitHub Actions
Node.js deprecation warning. The major-version tags are verified by the local
release checker and must also pass GitHub-hosted CI before the repository
visibility changes.

## Hosted production-service blockers

These do **not** block publishing the source repository because checkpoints and
provider configuration are excluded, but they do block representing a hosted
service as fully production-cleared:

1. Complete legal review of WhAM checkpoint use for the intended hosted
   service. The published weight terms are CC BY-NC-ND 4.0; commercial
   operators must obtain their own permission or another valid legal basis.
2. Capture and review the exact deployed Modal image inventory: base image,
   Debian/APT packages, FFmpeg build, complete Python/transitive dependency
   inventory, torch CUDA build, CUDA runtime, and driver.
3. Manually verify and record Modal, OpenAI, and Vercel dashboard logging,
   retention, collaborator, analytics, and data-control settings.
4. Operator-test targeted narration-cache deletion and scheduled expired-entry
   cleanup in the authorized private production environment.
