# Privacy and data flow

Last reviewed: 2026-07-23. This document describes verified project behavior and current provider documentation. It is not legal advice. Production dashboard settings must be checked before accepting sensitive or embargoed recordings.

## What the code does

| Data | Destination | Trigger | Verified use |
|---|---|---|---|
| Uploaded/sample/microphone WAV | Modal analysis endpoint | Only after the user selects a sample, chooses a file, or finishes a live recording and starts analysis | Decode/trim, click and coda analysis, WhAM embedding, acoustic-neighbor comparison. Temporary files are removed in `finally`. |
| Compact calculated evidence | OpenAI Responses API | Backend narration step during analysis when a backend key exists and no valid cache hit is available | Schema-bound narration. The whitelist excludes raw audio, full embeddings, filenames, identities, and researcher annotations. |
| Automatic and corrected annotations | Browser localStorage | Research Mode edits | Draft restoration keyed by audio SHA-256. No annotation-edit network request exists. |
| Imported research packages/corpus | Browser memory | Researcher selects files | Validation, aggregation, cosine similarity, PCA, filtering, outlier scoring, and export. |
| Saved corpus | Browser IndexedDB | Only when the researcher selects “Save this corpus locally” | Optional local restoration. It is never saved automatically. |
| Research/evaluation/corpus exports | Browser downloads | Explicit export action | Generated locally; not uploaded by this application. |

The analysis response returns an embedding to the browser for Art View and optional research-package export. Corpus Explorer may process an embedding already present in an imported package. Those browser operations remain local.

## OpenAI boundary

`backend/evidence_narrator.py` constructs a new compact object using an explicit allowlist. It sends that JSON as the user content and sets `store=False`. `OPENAI_API_KEY` is read only in backend Python and is injected through a Modal secret; it is absent from frontend source and production bundles.

Provider policy: OpenAI states that API data is not used to train models unless an organization explicitly opts in. Default abuse-monitoring logs may retain API content for up to 30 days; approved Zero Data Retention or Modified Abuse Monitoring controls alter that behavior. `store=False` prevents Responses application-state storage, but by itself does not remove default abuse-monitoring retention. See [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data).

Manual verification: confirm the production OpenAI organization/project Data Controls setting (Default, Modified Abuse Monitoring, or Zero Data Retention), any opt-in sharing, and whether prompt caching is enabled.

## Modal boundary

The WAV request is sent to the Modal-hosted FastAPI endpoint. The application reads it into request memory and writes only a trimmed temporary WAV for inference; that file is deleted. WhAM weights remain in a private persistent volume. Generated narration JSON may be cached for 30 days in a separate persistent Modal volume using a hash-derived key. The minimal cache envelope contains schema version, creation/expiration timestamps, and validated narration only; it excludes raw audio, embeddings, filenames, research notes, the source audio hash, and personal information. Expired entries cannot be returned as cache hits.

Modal documents encryption in transit/at rest, container reuse, persistent Volumes, Secret injection as environment variables, and plan-dependent log retention. Its security guide distinguishes request/response handling by endpoint type. Confirm in the production dashboard how this `@modal.asgi_app` endpoint is classified and which logs/retention apply. See [Modal security and privacy](https://modal.com/docs/guide/security), [Secrets](https://modal.com/docs/guide/secrets), [Volumes](https://modal.com/docs/guide/volumes), and [container lifecycle](https://modal.com/docs/guide/lifecycle-functions).

Manual verification: Modal plan/log retention, endpoint request-body logging classification, log drains, volume inventory/access, collaborators, secret access, regional requirements, and deletion procedures.

## Vercel boundary

The repository deploys a static Vite frontend; it contains no Vercel Function handling recordings. Vercel still produces deployment/build and web-request records. Current Vercel documentation lists plan-dependent runtime-log retention and says build logs are stored with deployments; Web Analytics, if enabled, has its own privacy behavior. The repository does not include `@vercel/analytics`, but dashboard enablement must be checked. See [Runtime Logs](https://vercel.com/docs/logs/runtime), [Logs](https://vercel.com/docs/logs), [limits and build-log retention](https://vercel.com/docs/limits), and [Web Analytics privacy](https://vercel.com/docs/analytics/privacy-policy).

Manual verification: deployment visibility, runtime/request log retention, build logs, log drains, Web Analytics, Speed Insights, access logs, team access, and deletion/retention settings.

## Font requests

DM Sans and Manrope are self-hosted from `/fonts/` with their OFL texts. The frontend no longer contacts Google Fonts.

## User controls and deletion

- Research draft: “Restore automatic analysis” clears the saved draft for that audio hash; site-data controls can clear all localStorage.
- Saved corpus: delete it in Corpus Explorer, or clear site IndexedDB.
- Downloads: delete exported files using the operating system.
- Modal narration cache: an authenticated operator can invoke the non-HTTP `delete_narration_cache_entry` Modal function with the full audio SHA-256. It returns only whether an entry was deleted. A daily authenticated scheduled function removes expired/invalid envelopes. No public cache-list or cache-delete endpoint exists.
- Provider logs: use the applicable provider dashboard/support and retention process; the application cannot retract records already retained by a provider.
- Uploaded audio: the application keeps no product database copy, but provider-level logs/settings must still be verified.

## Scientific and sensitive-data boundary

Do not upload recordings without authorization. Avoid personal data in filenames and research notes. Review sets are not automatically scientific ground truth, and model-space embeddings or PCA/outlier results are not identity, clan, dialect, meaning, or behavioral discoveries.
