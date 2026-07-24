# Final publication audit

Audit updated: 2026-07-23. This repository remains private.

## Verdict

**Private CI candidate; not yet safe for public release.**

The EC1 license/provenance blocker remains resolved. Dependency, SBOM, privacy, and retention documentation now exists, and release checks enforce the core data boundary. Public release remains blocked by the manual and legal items below.

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
- all 60 frontend tests passed;
- TypeScript type-checking passed; and
- the production frontend build passed.

## Security and privacy result

- Redacted working-tree credential scan: passed.
- Production frontend bundle credential scan: passed.
- Git history scan: passed across the two existing commits before this policy update.
- Staged files: zero.
- Tracked files reviewed before this policy update: 105.
- Model/checkpoint files in worktree: zero.
- Required EC1 publication inventory: passed.
- Raw EC1 source files in publishable inventory: zero.
- `OPENAI_API_KEY` frontend source/bundle references: zero from the preceding release audit and unchanged by this documentation/test-only pass.
- `frontend/.env.local`: ignored; contains only the public `VITE_WHAM_API_URL` endpoint without embedded URL credentials.
- Research drafts remain in `localStorage`; corpus persistence is explicit IndexedDB; local annotation, evaluation, and export actions do not transmit those data.
- Credential rotation required: no evidence requiring rotation was found.
- `store:false` and the compact GPT evidence boundary are now release-tested.
- Raw audio reaches Modal only after an explicit analysis action.
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

- Original Whale Acoustic Lab code: MIT, subject to final copyright-owner/contributor confirmation.
- EC1 DOI-pinned archive and the three modified derived indexes: CC BY 4.0.
- DSWP bundled public sample: CC BY 4.0.
- Project CETI WhAM source: MIT at the pinned source repository/commit.
- WhAM model weights: separately CC BY-NC-ND 4.0; not included.
- Three.js: MIT.
- DM Sans and Manrope: SIL Open Font License 1.1; self-hosted with pinned provenance and license texts.

## Final local validation

- Frontend tests: **60/60 passed**.
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

## Remaining public-release blockers

1. Confirm the final copyright holder and contributor agreement for the project’s MIT license.
2. Establish a monitored private security and conduct-reporting contact before public participation.
3. Add reviewed screenshots created only with the attributed public sample or synthetic data.
4. Capture and review the exact deployed Modal image inventory: base identity, Debian/APT packages, FFmpeg build, complete `pip freeze`/hashes, torch CUDA build, CUDA runtime, and driver.
5. Manually verify and record production Modal, OpenAI, and Vercel dashboard settings; operator-test cache deletion and periodic expired-file cleanup.
6. Complete legal review of WhAM checkpoint use for the intended service; commercial operators must obtain their own permission or other valid legal basis.

These items do not prevent continued private CI. They must be completed or explicitly resolved before marking the repository safe for public release.
