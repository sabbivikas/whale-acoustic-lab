# Data retention and deletion

Last reviewed: 2026-07-24.

| Data class | Application storage | Expected application lifetime | Deletion method | Provider/dashboard verification |
|---|---|---|---|---|
| Precomputed public result | Versioned static JSON in the public repository/site | Release lifetime | Remove in a reviewed future release | Contains attributed sample calculations and an existing stored embedding; no user data. |
| Default upload/microphone audio | Browser memory/object URL | Current analysis/page session | Analyze another recording, reset/close page, or clear site data | Never uploaded by default. |
| Optional compatible backend URL | Browser localStorage | Until the researcher disconnects or clears site data | “Use browser-only mode” or browser site-data controls | Contains a public endpoint URL only; no API key is requested. |
| Submitted WAV bytes | Request memory; a trimmed temporary file inside the Modal container | Request/inference lifetime; temp file deleted in `finally` | Automatic application cleanup | Confirm Modal endpoint classification and request/log retention. |
| WhAM embedding | Response memory/browser state; optionally included in a user-exported research package | Current page session unless the user exports or explicitly saves a corpus containing it | Close/reset page; delete local export/saved corpus | No backend embedding database exists in code. Confirm provider logs do not capture response bodies. |
| Compact GPT evidence | OpenAI request; backend memory | Provider-policy dependent | Provider controls/support; not retained in app database | Confirm OpenAI org/project Data Controls. `store=False` is enabled, but default abuse monitoring may last up to 30 days. |
| Generated narration cache | `whale-art-narration-cache` Modal Volume, hash-derived JSON envelope | 30 days; expired entries are invalid and a daily authenticated scheduled function removes expired/invalid envelopes | Authenticated, non-HTTP `delete_narration_cache_entry` operator function; whole-volume deletion remains available to operators | Operator-test scheduled and targeted deletion after private deployment. |
| WhAM weights | `whale-art-wham-weights` Modal Volume | Persistent while service is operated | Delete volume (breaks inference until restored) | Restrict operator access and verify license/use. |
| Research draft | Browser localStorage, audio-SHA-keyed | Until restore/clear/site-data eviction | Restore automatic analysis or clear site data | Browser/device controlled. |
| Imported corpus | Browser memory | Page lifetime | Reset/close page | Never uploaded by project code. |
| Explicitly saved corpus | Browser IndexedDB | Until researcher deletes it or browser evicts/clears it | Corpus Explorer delete action or browser site-data controls | Never saved automatically. |
| Research/evaluation/corpus exports | User-selected download location | User controlled | Delete locally | Never uploaded by project code. |
| Vercel deployment/build/request logs | Vercel systems | Plan/product dependent | Dashboard/deployment deletion or provider process | Verify plan, logs, drains, analytics, and deletion in production dashboard. |
| Modal operational logs/metadata | Modal systems | Plan/data-class dependent | Dashboard/provider process | Verify current plan and endpoint behavior. |

## Production policy decisions still required

These decisions apply only to a separately operated compatible backend. The
public static site does not start or use the maintainer’s stopped Modal app.

1. Operator-test the authenticated targeted deletion and scheduled expiration cleanup after private deployment.
2. Record Modal, OpenAI, and Vercel dashboard settings with an owner and review date.
3. Decide whether research/embargoed recordings are permitted at all.
4. Publish a contact and verified workflow for deletion requests that involve provider records.

No retention statement should promise provider deletion faster than the verified production configuration supports.
