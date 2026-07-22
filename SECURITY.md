# Security policy

## Reporting a vulnerability

Do not open a public issue for credentials, private recordings, annotation leakage, authentication problems, or a vulnerability that could expose a deployed service. Before the repository is public, contact the maintainer privately. After publication, enable GitHub private vulnerability reporting and use it as the primary channel.

Include a minimal description, affected component, reproduction steps, and impact. Do not include real user audio, annotations, credentials, or destructive proof-of-concept data.

## Secret boundaries

- `OPENAI_API_KEY` is a backend-only environment variable supplied by the Modal secret named `whale-acoustic-lab-openai`.
- The browser receives only `VITE_WHAM_API_URL`, which is a public analysis-service origin and is not a credential.
- Modal, Vercel, GitHub, and Hugging Face credentials must remain in their respective secret stores or local credential managers.
- WhAM checkpoints must remain outside Git and outside frontend artifacts.
- Research drafts remain in browser `localStorage`; saved corpora use IndexedDB only after explicit user action.

If a credential is ever committed, remove it from publication history and rotate it with the issuing service. History rewriting alone does not revoke a credential.

## Supported versions

Until the first tagged release, only the current default branch is supported. Security fixes will be documented in release notes after versioned releases begin.
