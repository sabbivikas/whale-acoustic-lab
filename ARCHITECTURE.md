# Architecture and trust boundaries

## Browser to analysis service

```mermaid
flowchart LR
    U["User chooses sample, upload, or Listen Live"] --> B["Vite browser app"]
    B -->|"Explicit POST /analyze with WAV"| M["Modal FastAPI boundary"]
    M --> D["Decode + boundary trim"]
    D --> C["Waveform click estimates"]
    C --> S["Probable-coda segmentation + EC1 timing comparison"]
    D --> W["WhAM GPU embedding"]
    W --> R["Existing DSWP reference index"]
    S --> E["Compact calculated evidence"]
    E -->|"Optional backend-only request"| G["GPT-5.6 evidence narrator"]
    E --> F["Deterministic narration fallback"]
    R --> O["Structured analysis response"]
    G --> O
    F --> O
    S --> O
    O --> B
```

Only an explicit analysis action sends audio. The backend temporarily writes decoded/trimmed WAV files for processing and removes them in `finally` blocks. Deployed provider logs, volumes, and retention settings remain operational responsibilities.

## Research annotation and export

```mermaid
flowchart TD
    A["Immutable automatic analysis in browser memory"] --> R["Research document"]
    R --> V["Waveform + spectrogram + editable markers/regions"]
    V --> P["Pure local recalculation functions"]
    P --> R
    R --> L["localStorage draft keyed by full audio SHA-256"]
    R --> E["Annotation Evaluation"]
    R --> X["Browser serializers"]
    X --> J["Research JSON"]
    X --> C["Annotation CSV"]
    X --> RC["Raven click table"]
    X --> RD["Raven coda table"]
    E --> EJ["Evaluation JSON"]
    E --> EC["Evaluation CSV"]
```

Editing, evaluation, and downloads do not call the backend. Automatic values are retained separately from human-corrected review values.

## Corpus Explorer local-only flow

```mermaid
flowchart LR
    I["Research-package JSON files"] --> V["Local schema validation"]
    V --> D["Deduplicate by full audio SHA-256"]
    D --> A["Local aggregation + filters"]
    D --> N["Normalize compatible 1,280-value embeddings"]
    N --> C["Pairwise cosine similarity"]
    N --> P["Deterministic PCA"]
    C --> O["k-neighbor outlier score"]
    A --> UI["Corpus dashboard"]
    C --> UI
    P --> UI
    O --> UI
    UI --> X["Browser-only corpus exports"]
    UI -->|"Only after explicit Save"| IDB["IndexedDB"]
```

Imported packages are not uploaded. IndexedDB persistence is opt-in and can be deleted from the interface.

## Secrets and deployment boundaries

```mermaid
flowchart TB
    subgraph Public["Public frontend / Vercel"]
      URL["VITE_WHAM_API_URL: public origin only"]
      APP["Static HTML, CSS, JS, public sample"]
    end
    subgraph Modal["Modal trusted backend"]
      API["FastAPI app"]
      OS["Modal secret: OPENAI_API_KEY"]
      WV["Private WhAM weights volume"]
      NC["Narration cache volume"]
    end
    subgraph Repo["Open-source repository"]
      SRC["Source + docs + attributed sample"]
      IDX["License-cleared static indexes"]
      NOWEIGHTS["No credentials or checkpoints"]
    end
    URL --> API
    APP --> API
    OS --> API
    WV --> API
    NC --> API
    SRC --> APP
    IDX --> API
```

`OPENAI_API_KEY` is referenced only by backend code and must never use a `VITE_` prefix. Modal/Vercel/GitHub/Hugging Face credentials belong in provider secret stores, not files.

## Paid versus browser-only operations

```mermaid
flowchart LR
    U["User action"] --> Q{"Operation"}
    Q -->|"Submit audio"| PAID["Remote analysis boundary"]
    PAID --> GPU["WhAM GPU inference"]
    PAID --> GPT["Optional GPT narration"]
    Q -->|"Edit annotations"| LOCAL["Browser-only CPU work"]
    Q -->|"Evaluate review set"| LOCAL
    Q -->|"Import/explore corpus"| LOCAL
    Q -->|"Generate exports"| LOCAL
    Q -->|"Render homepage/art"| LOCAL
```

The first branch can incur infrastructure/model-provider cost. The second branch must remain local and requires no Modal, GPU, WhAM, OpenAI, or paid API call.

## Frontend lifecycle

The public controls render independently of the Three.js chunk. An intersection-aware loader starts the ocean scene lazily. The renderer caps pixel ratio, lowers complexity on small screens, pauses its frame loop when the document is hidden, honors reduced motion, shows a static fallback without WebGL, and disposes geometries, materials, render targets, listeners, observers, and animation frames during teardown.

## Runtime data inventory

| Data | Location | Network behavior |
|---|---|---|
| Selected/recorded audio | Browser memory, then explicit analysis request | Sent only to configured `/analyze` endpoint after user action. |
| Backend temporary WAV | Ephemeral container filesystem | Local to analysis container; deleted after request. |
| WhAM weights | Private Modal volume | Never sent to browser or stored in Git. |
| Narration evidence | Backend compact JSON | Optional OpenAI request; excludes raw audio, embedding, filename, and researcher notes. |
| Research draft | Browser `localStorage` | Never uploaded by annotation actions. |
| Imported corpus | Browser memory | Never uploaded. |
| Saved corpus | Browser IndexedDB after explicit save | Never uploaded by Corpus Explorer. |
| Exports | Browser-generated downloads | Never uploaded by export actions. |
