# Security policy

## Reporting a vulnerability

Do not open a public issue for credentials, private recordings, annotation
leakage, authentication problems, or a vulnerability that could expose a
deployed service.

### While the repository is private

Repository collaborators should open a **draft GitHub Security Advisory** under
`Security → Advisories → New draft security advisory`. Do not put sensitive
details in an Issue, pull request, Discussion, or commit message.

### Before and after the repository becomes public

GitHub supports Private Vulnerability Reporting for public repositories, not
private repositories. Immediately before changing repository visibility, Vikas
Sabbi must enable it under:

`Settings → Code security and analysis → Private vulnerability reporting`

After it is enabled, use `Security → Advisories → Report a vulnerability`.
This is the project’s private reporting channel. No personal reporting email is
published.

Include a minimal description, affected component, reproduction steps, and impact. Do not include real user audio, annotations, credentials, or destructive proof-of-concept data.

## Secret boundaries

- `OPENAI_API_KEY` is a backend-only environment variable supplied by the Modal secret named `whale-acoustic-lab-openai`.
- The browser receives only `VITE_WHAM_API_URL`, which is a public analysis-service origin and is not a credential.
- Modal, Vercel, GitHub, and Hugging Face credentials must remain in their respective secret stores or local credential managers.
- WhAM checkpoints must remain outside Git and outside frontend artifacts.
- Research drafts remain in browser `localStorage`; saved corpora use IndexedDB only after explicit user action.
- The OpenAI Responses call must retain `store=False` and must receive only `compact_evidence(...)`, never raw audio, a full embedding, filenames, or researcher notes.
- `backend/requirements.lock`, `backend/requirements-dev.lock`, `SBOM.md`, `PRIVACY.md`, and `DATA_RETENTION.md` are release-controlled security artifacts.

If a credential is ever committed, remove it from publication history and rotate it with the issuing service. History rewriting alone does not revoke a credential.

## Production verification checklist

Before accepting public recordings, manually record and review:

- Modal plan, endpoint/request logging classification, log retention, log drains, Volume access/deletion, collaborator access, and Secret access;
- OpenAI organization/project Data Controls, data-sharing opt-ins, and prompt-caching configuration;
- Vercel deployment visibility, request/runtime logs, build logs, log drains, Web Analytics/Speed Insights, and team access;
- the deployed image’s Python/OS/FFmpeg/CUDA inventory and vulnerability report; and
- an operator-tested narration-cache deletion/retention procedure.

See [PRIVACY.md](PRIVACY.md), [DATA_RETENTION.md](DATA_RETENTION.md), and [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md). Provider defaults must not be represented as verified production settings until the dashboard has been checked.

## Supported versions

Until the first tagged release, only the current default branch is supported.
Security fixes will be documented in release notes after versioned releases
begin.
