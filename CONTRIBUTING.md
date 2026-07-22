# Contributing

Thank you for helping improve Whale Acoustic Lab. Contributions must preserve scientific uncertainty, user privacy, accessibility, and reproducibility.

## Before opening a change

1. Read [SCIENTIFIC_LIMITATIONS.md](SCIENTIFIC_LIMITATIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [SECURITY.md](SECURITY.md).
2. Open an issue before changing scientific calculations, reference data, model routing, export schemas, or privacy boundaries.
3. Never commit recordings without documented redistribution permission and attribution.
4. Never commit credentials, private endpoints, model checkpoints, research exports, or user annotations.

## Local checks

Frontend:

```bash
cd frontend
npm ci
npm test
npm run type-check
npm run build
```

Pure local backend checks:

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend -p 'test_*.py'
python3 -m compileall -q backend
python3 scripts/release_checks.py
```

These commands must not invoke Modal, WhAM, OpenAI, a GPU, paid APIs, deployed services, or reference-index builders.

## Scientific changes

A scientific change must include:

- the exact algorithm or threshold changed;
- the source and license of any new data;
- deterministic tests covering normal and edge cases;
- version changes for affected schemas or algorithms;
- updated limitations and reproducibility documentation; and
- neutral language that does not imply translation, identity, intent, emotion, clan, dialect, or biological discovery without appropriate evidence.

Researcher edits are a **review set**, not automatically ground truth. Generated analogies must remain explicitly non-literal.

## Pull requests

Keep changes focused. Describe tests run, data or model provenance, privacy impact, scientific impact, and any unresolved uncertainty. Do not include generated exports or personal recordings in screenshots or fixtures.
