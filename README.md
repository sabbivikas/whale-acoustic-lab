# Whale Acoustic Lab

Whale Acoustic Lab is an evidence-bounded product and researcher workspace for exploring sperm-whale recordings. It combines transparent waveform measurements, probable-coda segmentation, Project CETI WhAM acoustic embeddings, cautious comparisons with published timing data, local annotation tools, and deterministic visual art.

> Scientists have not literally translated sperm-whale language. This project analyzes acoustic structure. Its family matches, conversational-role hypotheses, model-space neighbors, and musical analogies are limited comparisons—not statements of meaning, identity, intent, emotion, clan, or dialect.

## Product experience

The public experience provides three immediate paths:

- **Try a real whale call** using an attributed DSWP sample.
- **Upload audio** for analysis.
- **Listen Live** by explicitly choosing microphone recording; permission is not requested before that action.

After analysis, the interface presents:

- a measured call story and probable-coda sequence;
- click timestamps, inter-click intervals (ICIs), rhythm regularity, pace direction, and grouping;
- nearest published EC1 rhythm families with abstention when the accepted range is exceeded;
- conversational-role evidence separately from factual rhythm measurements;
- nearest DSWP recordings in WhAM model space;
- optional GPT-5.6 evidence narration constrained to calculated evidence, with a deterministic fallback;
- a Science view containing measurements, matching definitions, provenance, and limitations; and
- an Art View whose parameters are deterministically derived from the existing embedding.

The homepage includes a lazy-loaded Three.js deep-ocean scene and a procedural sperm whale. Controls work before the scene loads; reduced motion, hidden tabs, WebGL failure, lower-complexity mobile rendering, and resource cleanup are handled explicitly.

## Research Mode

Research Mode becomes available after a recording is analyzed. It keeps the server result immutable while creating a browser-local review document keyed by the audio SHA-256.

Researchers can use synchronized waveform and spectrogram views to:

- add, move, delete, accept, reject, or mark click estimates uncertain;
- resize, split, join, accept, reject, or mark probable coda regions uncertain;
- attach short notes;
- restore the original automatic analysis; and
- recalculate click count, timestamps, ICIs, mean/median ICI, normalized rhythm, duration, coefficient of variation, regularity, and beginning-versus-ending pace locally.

Every edit is labeled `human_corrected`; the original values remain labeled `automatic`. Drafts remain in `localStorage` and are not uploaded.

### Research exports

Browser-generated downloads include a versioned JSON research package, annotation CSV, Raven-compatible click table, and Raven-compatible coda table. Frequency bounds default to 0 Hz and Nyquist when no manual frequency measurement exists. See [RESEARCH_EXPORTS.md](RESEARCH_EXPORTS.md).

### Annotation Evaluation

The evaluation workspace compares the automatic estimates with the current **review set** using one-to-one click matching, configurable 1–100 ms tolerance, coda intersection-over-union, neutral summaries, visual alignment, and JSON/CSV downloads. A review set is not automatically ground truth. See [RESEARCH_EVALUATION.md](RESEARCH_EVALUATION.md).

### Corpus Explorer

Corpus Explorer imports multiple Whale Acoustic Lab research-package JSON files entirely in the browser. It validates and deduplicates packages, aggregates annotations, compares compatible 1,280-value WhAM embeddings with cosine similarity, computes deterministic two-component PCA, and surfaces model-space outlier candidates. Imported files are never uploaded; corpora remain in memory unless the researcher explicitly saves one to IndexedDB. See [CORPUS_EXPLORER.md](CORPUS_EXPLORER.md).

## Screenshots

Release screenshots must use the attributed public sample or synthetic test data—never private recordings or researcher annotations. Before publishing the repository, add reviewed captures for:

1. the 1440 px homepage and procedural whale;
2. the public analysis result;
3. Research Mode waveform/spectrogram editing;
4. Annotation Evaluation; and
5. Corpus Explorer PCA/similarity views.

No screenshot files are currently included; this is tracked as a publication task rather than filling the README with stale or private captures.

## Architecture

- `frontend/` — Vite/TypeScript public experience, Three.js scene, research editing, evaluation, exports, and Corpus Explorer.
- `backend/` — Python waveform analysis, coda logic, evidence narration, local tests, and the Modal service definition.
- `references/` — generated indexes, provenance manifests, and currently local source/reference materials.
- `scripts/` — local release and secret checks.
- `.github/workflows/ci.yml` — secret-free CPU-only validation.

Detailed diagrams and trust boundaries are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Analysis pipeline

The production backend:

1. validates and decodes a user-submitted WAV;
2. normalizes it to mono 16-bit PCM where required;
3. trims only low-energy leading/trailing boundaries;
4. estimates waveform click onsets;
5. segments probable codas and calculates timing measurements;
6. compares normalized rhythm to equal-click-count EC1 families using MSE and an abstention threshold;
7. extracts a WhAM layer-10 acoustic embedding and compares it to the existing DSWP reference index; and
8. optionally requests schema-bound GPT-5.6 narration over a compact calculated-evidence object. If narration is unavailable or invalid, deterministic text is returned.

WhAM embeddings are acoustic representations, not semantic translations. Model checkpoints are not included in this repository and are not covered by this project’s MIT license.

## Local frontend setup

Requirements: a current Node.js LTS release and npm.

```bash
cp .env.example frontend/.env.local
cd frontend
npm ci
npm run dev
```

Set `VITE_WHAM_API_URL` to a public backend origin. It is compiled into browser code and must never contain credentials. The public UI can load locally without a working backend, but an analysis submission requires one.

## Backend configuration

The backend definition pins Project CETI WhAM source commit `00a8b787c040db23cd51ac4417481a09ac354985`. Production weights live in a Modal volume and are not part of this repository. `OPENAI_API_KEY` is read only by backend narration code and is supplied through the Modal secret named `whale-acoustic-lab-openai`.

The reviewed direct Python compatibility set is in [backend/requirements.lock](backend/requirements.lock), developer tooling is in [backend/requirements-dev.lock](backend/requirements-dev.lock), and the runtime inventory is in [SBOM.md](SBOM.md). These files preserve the versions and Git commits used by the existing compatibility-tested definition; they do not authorize rebuilding or deploying it.

This repository intentionally does not provide a one-command deployment. Review [SECURITY.md](SECURITY.md), [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md), [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), and the service-specific configuration before any private deployment.

## Testing

The release-safe local suite is:

```bash
cd frontend
npm ci
npm test
npm run type-check
npm run build

cd ..
PYTHONPATH=backend python3 -m unittest discover -s backend -p 'test_*.py'
python3 -m compileall -q backend
python3 scripts/release_checks.py
```

These checks do not require secrets, GPUs, Modal execution, OpenAI, WhAM inference, deployed services, or reference-index rebuilding.

## Privacy

The browser transmits a recording only after the user explicitly selects the public sample, uploads a file, or completes a microphone recording and submits it for analysis. The browser sends that audio to `VITE_WHAM_API_URL/analyze`. Research edits, evaluation, exports, imported research packages, PCA, similarity, filtering, and outlier scoring are browser-only. Corpus persistence is opt-in.

The optional OpenAI request receives compact calculated evidence—not raw audio, the full embedding, filenames, or researcher annotations—and uses `store:false`. This setting avoids Responses application-state storage; default API abuse-monitoring retention can still apply unless the organization has approved data controls.

Read [PRIVACY.md](PRIVACY.md) and [DATA_RETENTION.md](DATA_RETENTION.md). Do not use this project with recordings you are not authorized to process. Review the deployed Modal, OpenAI, and Vercel dashboard settings before processing sensitive or embargoed research data.

## Scientific limitations and reproducibility

Read [SCIENTIFIC_LIMITATIONS.md](SCIENTIFIC_LIMITATIONS.md) before interpreting any result. Algorithm definitions, thresholds, schema versions, deterministic identifiers, and known failure modes are documented there and in:

- [backend/AUDIO_ANALYSIS.md](backend/AUDIO_ANALYSIS.md)
- [backend/AUDIO_TRIMMING.md](backend/AUDIO_TRIMMING.md)
- [references/coda_code/SEGMENTATION.md](references/coda_code/SEGMENTATION.md)
- [references/coda_code/VALIDATION.md](references/coda_code/VALIDATION.md)
- [RESEARCH_EXPORTS.md](RESEARCH_EXPORTS.md)
- [RESEARCH_EVALUATION.md](RESEARCH_EVALUATION.md)
- [CORPUS_EXPLORER.md](CORPUS_EXPLORER.md)

## Citation and licenses

Use [CITATION.cff](CITATION.cff) for this software and cite the upstream WhAM and EC1 research sources appropriate to your use. Original Whale Acoustic Lab code is MIT-licensed. EC1-derived runtime indexes and the DSWP sample are CC BY 4.0; WhAM source and weights retain separate terms. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and the [EC1 attribution](references/coda_code/ATTRIBUTION.md).

The repository remains private. Complete the administrative, dependency-image, legal, and production-dashboard items in [PUBLICATION_AUDIT.md](PUBLICATION_AUDIT.md) before making it public.
