# Workspace UI Redesign — Fine-Tuning Platform

**Date:** 2026-04-27
**Scope:** `projects/fine-tuning-platform/`
**Status:** Design approved, awaiting implementation plan.

## Problem

The current UI is four separate Jinja pages (`/`, `/datasets/new`, `/jobs/new`, `/predict`) with ~10 lines of bare HTML each, no visible styling, and broken forms (the `/jobs/new` and `/predict` forms have no `action`/`method` and don't submit). Three concrete usability gaps:

1. **Page-fragmentation** — every action requires a top-nav click; the rest of the screen sits empty even though there is room for related context.
2. **No selectors for IDs** — users must hand-type `dataset-xxxxxxxxxxxx` and artifact paths; there is no listing endpoint and no UI surface for choosing them.
3. **Single-model predict only** — `POST /api/predict-intent` accepts one `model_artifact_id`. Comparing fine-tuned variants against the base model means submitting one request, recording the answer, switching `model_artifact_id`, repeating. No side-by-side view.

## Goal

A single-page workspace dashboard that consolidates all four flows, exposes selectable lists for datasets/artifacts, and supports multi-model side-by-side prediction comparison — without changing the SWIFT training pipeline or breaking existing API contracts.

## Design picks (from brainstorming)

- **Layout:** Two-Pane Workspace — Jobs table dominant on the left; Upload, New Job, Predict stacked as compact cards on the right rail.
- **Predict view:** Hybrid Quick / Batch tabs — Card Row for ad-hoc single-prompt comparison; Comparison Matrix for batch runs.
- **Visual style:** Modern Workspace — soft slate background, rounded corners (8–10 px), subtle shadows, indigo→violet primary gradient, status pills.

## Architecture

### File layout (new and changed)

```
projects/fine-tuning-platform/
  app/
    main.py                          # add 4 endpoints; redirect legacy routes
    domain/
      artifacts.py        (new)      # pure: scan_artifacts, Artifact model
      datasets_listing.py (new)      # pure: scan_datasets, DatasetSummary
      compare_aggregation.py (new)   # pure: aggregate_compare_results
    services/
      inference.py                   # extend: parallel fan-out helper
    static/                (new dir)
      workspace.css                  # design tokens + components
      workspace.js                   # Alpine.js init + helpers (small)
    templates/
      workspace.html       (new)     # the single page
      base.html                      # gut, point at /static/workspace.css
      index.html / dataset_new.html / job_new.html / predict.html
                                     # delete OR replace with redirect-only stubs
  tests/
    api/
      test_datasets_list_api.py    (new)
      test_artifacts_list_api.py   (new)
      test_models_base_api.py      (new)
      test_predict_compare_api.py  (new)
      test_pages.py                # update — single workspace template renders
    domain/
      test_artifacts.py            (new)
      test_datasets_listing.py     (new)
      test_compare_aggregation.py  (new)
```

### Tech choices

- **No build pipeline.** Jinja2 + Alpine.js (CDN) + hand-rolled CSS with CSS-variable tokens. Mount `app/static/` via `app.mount("/static", StaticFiles(directory=...))`.
- **Reactivity:** Alpine.js `x-data` block on the page root. Component-local state only (no global store). Fetches use the native `fetch` API.
- **No SSE/WebSocket** in this iteration; jobs poll `GET /api/jobs` every 5 s.

### Functional-programming boundaries (per repo CLAUDE.md)

- `scan_datasets(training_data_dir: Path) -> list[DatasetSummary]` — pure; deterministic given a directory snapshot.
- `scan_artifacts(jobs_dir: Path, output_dir: Path, merged_dir: Path, quantized_dir: Path) -> list[Artifact]` — pure; reads JSON job records, intersects with on-disk paths, emits immutable artifact rows.
- `aggregate_compare_results(results: list[CompareResult]) -> CompareSummary` — pure; computes agreement %, per-model latency stats.
- I/O (filesystem reads, subprocess inference) stays inside the FastAPI handler / `services/inference.py`. Pure functions never touch I/O.

## API additions

### `GET /api/datasets`

Lists uploaded datasets discovered by scanning `training_data/`.

```json
{
  "datasets": [
    {
      "dataset_id": "dataset-7c9a1b2c3d4e",
      "row_count": 312,
      "created_at": "2026-04-27T10:14:22Z",
      "train_path": "training_data/dataset-7c9a1b2c3d4e/train.jsonl",
      "eval_path": "training_data/dataset-7c9a1b2c3d4e/eval.jsonl"
    }
  ]
}
```

`row_count` is read from a stored sidecar (write `meta.json` at upload time) rather than re-counting `train.jsonl`/`eval.jsonl`. `created_at` from the directory mtime.

### `GET /api/artifacts`

Lists model artifacts that exist on disk and are derivable from finished jobs. Each "kind" represents a SWIFT pipeline stage.

```json
{
  "artifacts": [
    {
      "artifact_id": "job-a1b2c3d4e5f6:adapter",
      "job_id": "job-a1b2c3d4e5f6",
      "kind": "adapter",
      "path": "output/job-a1b2c3d4e5f6",
      "label": "LoRA adapter (job-a1b2)",
      "created_at": "2026-04-27T09:55:00Z"
    },
    {
      "artifact_id": "job-a1b2c3d4e5f6:merged",
      "job_id": "job-a1b2c3d4e5f6",
      "kind": "merged",
      "path": "merged_models/job-a1b2c3d4e5f6",
      "label": "Merged model (job-a1b2)",
      "created_at": "2026-04-27T10:02:13Z"
    }
  ]
}
```

`kind` ∈ `{"adapter", "merged", "quantized"}`. `scan_artifacts` only emits a row if both the job record and the on-disk directory exist.

### `GET /api/models/base`

Lists base models available for training/inference. Scans `models/` directory; missing directory returns empty list.

```json
{
  "models": [
    { "name": "Qwen2.5-7B-Instruct", "path": "models/Qwen2.5-7B-Instruct" }
  ]
}
```

### `POST /api/predict-intent/compare`

Runs one prompt against N models in parallel and returns all results plus an aggregate.

Request:
```json
{
  "text": "帮我查一下明天的天气",
  "model_specs": [
    { "kind": "base",     "ref": "models/Qwen2.5-7B-Instruct" },
    { "kind": "artifact", "ref": "job-a1b2c3d4e5f6:adapter" },
    { "kind": "artifact", "ref": "job-c3d4e5f6a1b2:merged" }
  ]
}
```

Response:
```json
{
  "text": "帮我查一下明天的天气",
  "results": [
    { "model_id": "models/Qwen2.5-7B-Instruct", "kind": "base",     "intent": "other",         "latency_ms": 230, "raw": "..." },
    { "model_id": "job-a1b2c3d4e5f6:adapter",   "kind": "artifact", "intent": "weather_query", "latency_ms": 180, "raw": "..." },
    { "model_id": "job-c3d4e5f6a1b2:merged",    "kind": "artifact", "intent": "weather_query", "latency_ms": 195, "raw": "..." }
  ],
  "summary": { "agreement": 0.667, "majority": "weather_query" }
}
```

Server-side fan-out via `asyncio.gather`. If a single model errors, its result entry contains an `error` field and the others still return.

### Existing endpoints — no breaking changes

`POST /api/predict-intent` (single-model) stays for back-compat. `compare` is a thin layer above the same parsing logic in `app/services/inference.py`.

### Legacy routes — redirects

`/datasets/new`, `/jobs/new`, `/predict` return `307` redirects to `/` (the workspace). This keeps any bookmarks working without dragging four templates forward.

## Frontend layout

Single page `workspace.html`. ASCII overview:

```
┌─────────────────────────────────────────────────────────┐
│  [▦] Fine-Tuning Platform        [● 2 running]  [⛶]    │  sticky topbar
├──────────────────────────────────┬──────────────────────┤
│  Jobs                  8 total   │  Upload Dataset      │
│  ┌─────────────────────────────┐ │   [drop .jsonl]      │
│  │ ● job-a1b2... 3m  running   │ ├──────────────────────┤
│  │ ● job-c3d4... 12m running   │ │  New Job             │
│  │ ○ job-9f8e... 2h  done      │ │   Dataset [▾ ...]    │
│  │ ✕ job-1a2b... 4h  failed    │ │   Base    [▾ ...]    │
│  └─────────────────────────────┘ │   [▶ Train]          │
│                                  ├──────────────────────┤
│                                  │  Predict        [⛶] │
│                                  │   3 models, 1 prompt │
└──────────────────────────────────┴──────────────────────┘
```

When Predict's `⛶` is clicked, the workspace re-flows: Jobs becomes a slim 280-px sidebar; Predict expands to fill the main column with the Quick / Batch tabbed view.

### Design tokens (`workspace.css`)

```css
:root {
  --bg:           #f5f7fb;
  --surface:      #ffffff;
  --border:       #e2e8f0;
  --border-soft:  #f1f5f9;
  --text:         #0f172a;
  --text-muted:   #64748b;
  --primary:      #6366f1;
  --primary-grad: linear-gradient(135deg, #6366f1, #8b5cf6);
  --green:        #16a34a; --green-bg:  #dcfce7; --green-fg:  #166534;
  --indigo-bg:    #e0e7ff; --indigo-fg: #3730a3;
  --red-bg:       #fee2e2; --red-fg:    #991b1b;
  --slate-bg:     #f1f5f9; --slate-fg:  #475569;
  --r-sm: 6px; --r-md: 8px; --r-lg: 10px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px;
  --shadow-1: 0 1px 3px rgba(15,23,42,.05);
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", monospace;
}
```

Job IDs and artifact IDs render in `--font-mono`. Headings, buttons, and prose use `--font-sans`.

## Predict comparison flow

### Compact view (right-rail card)

- 1-line prompt input + small Run button.
- "Models" row: chip-picker with up to 3 chips visible + `+N more`.
- After a Run, render a 3-card row inline; if more selected, show "Expand for all".

### Expanded view (full main column)

Tabs: **Quick** (default) | **Batch**.

#### Quick tab

- Multi-line prompt textarea. `Cmd/Ctrl + Enter` runs.
- Model chip-picker:
  - Source: `/api/models/base` (kind=`base`, blue chip) + `/api/artifacts` (kind=adapter/merged/quantized, green chip with kind badge).
  - Click a row in the dropdown to add; click an existing chip to remove.
  - Sort order: base models first, then artifacts newest-first.
- Run button → `POST /api/predict-intent/compare`.
- Result row: one card per selected model in the same order. Card content:
  - Model label + kind badge + parent job id.
  - Predicted intent (large).
  - Latency (subscript).
  - "Show raw" toggle for the raw model output.
  - Disagreement highlight: if the predicted intent ≠ majority, the card gets a soft red border and a "minority" badge.
- History panel (collapsible, right side of expanded view): scrollable list of recent (prompt, intent-summary) pairs from `localStorage`. Click to re-populate the input. No server persistence in MVP.

#### Batch tab

- Prompts source picker:
  - `Paste prompts` — textarea, one prompt per line.
  - `Load eval set` — select a dataset, load `eval.jsonl` as `{text, intent}` rows.
- Same model chip-picker as Quick.
- Run → fan-out the matrix client-side (one `compare` request per prompt; sequential to avoid hammering the local SWIFT process). Show a progress bar (`x/N done`).
- Results matrix:
  - Rows = prompts. Columns = models.
  - Cells: predicted intent, latency in subscript.
  - If the dataset row had a ground-truth `intent`, show a column "expected" between the prompt and the model columns and color cells green/red based on match.
  - Row highlight if any cell disagrees with the majority.
  - Footer: aggregate agreement %, per-model accuracy (when ground truth present), per-model average latency.
- Export: download results as JSON.

## Selector pattern (covers ask #2)

| Field | Source | UI |
|---|---|---|
| Dataset (in New Job) | `GET /api/datasets` | `<select>` showing `dataset-xxx — N rows · Mm ago`. Refreshes after a successful upload via Alpine event. |
| Base model (in New Job) | `GET /api/models/base` | `<select>`; default to first entry; allow free-text override for paths not in `models/`. |
| Models (in Predict) | `GET /api/models/base` + `GET /api/artifacts` | Chip multi-picker; base always available so users can compare against baseline. |

Every Job row in the Jobs table has a "▶ Predict with this" affordance: clicking it opens the expanded Predict view with that job's artifact pre-selected.

## Live updates

- On page load: fetch jobs, datasets, artifacts, base models in parallel.
- Every 5 s: `GET /api/jobs`; diff against current Alpine state; only re-render rows whose status changed.
- Polling pauses when the document is hidden (`visibilitychange`) and resumes on focus.

## Accessibility & responsive

- Keyboard: every interactive element reachable via Tab; Run buttons triggered by `Cmd/Ctrl + Enter` in the prompt input.
- Color-coded status pills always include a text label, never color alone.
- `<1024 px` viewport: layout collapses to single-column (right rail flows below Jobs); Predict expanded view stacks vertically.

## Testing

Unit (pure functions, no mocks):

- `tests/domain/test_artifacts.py` — `scan_artifacts` with synthetic job-records + on-disk fixtures: missing directory ignored, kinds resolved, ordering deterministic.
- `tests/domain/test_datasets_listing.py` — `scan_datasets` with a fixture training_data dir.
- `tests/domain/test_compare_aggregation.py` — agreement %, majority, ties.

Integration (FastAPI TestClient):

- `tests/api/test_datasets_list_api.py` — empty list, populated list, malformed dir tolerated.
- `tests/api/test_artifacts_list_api.py` — empty, mixed kinds, orphan dirs (job missing).
- `tests/api/test_models_base_api.py` — present, missing models dir.
- `tests/api/test_predict_compare_api.py` — fan-out using a fake `infer_raw`; all-success, partial-error, agreement math.
- `tests/api/test_pages.py` — `/` renders the workspace template; `/datasets/new`, `/jobs/new`, `/predict` redirect with 307; existing health check still green.

No browser e2e/Playwright in this iteration — out of scope for an MVP redesign.

## Out of scope (deferred)

- Authentication / multi-user.
- Artifact/job deletion or pruning UI.
- Per-job training-hyperparam configuration UI (current `New Job` only takes dataset + base model path; that stays).
- Live training-log streaming (we already expose `GET /api/jobs/{id}/logs` as a one-shot read; UI can show the log on click but not stream).
- Real-time training-metrics charts.
- Dataset row inspector / preview.
- WebSocket / Server-Sent Events.

## Risks and mitigations

- **SWIFT inference is slow on Apple Silicon.** Multi-model Quick runs may take many seconds. Mitigation: server-side `asyncio.gather` for parallel fan-out; surface latency per result; do not block the page on Run (fire-and-forget with a per-card spinner).
- **Artifact discovery races.** A job may be marked complete while its merged-model dir is still being written. Mitigation: `scan_artifacts` only emits rows whose paths exist *and* whose job record status is `succeeded`/`completed`.
- **localStorage history can grow unbounded.** Cap at 50 entries; FIFO eviction.
- **Polling at 5 s on a stale tab.** Pause on `visibilitychange` (already in plan).

## Open assumptions (record so they can be verified during planning)

- The `models/` directory layout matches the existing README convention (one subdir per base model).
- Completed jobs that have run `merge` / `quantize` have their merged/quantized output in `merged_models/<job_id>/` and `quantized_models/<job_id>-<method>-int<bits>/` — matches `app/main.py:147,158`.
- A `meta.json` sidecar can be written under `training_data/<dataset_id>/` at upload time without breaking existing tests. (If not, `row_count` falls back to streaming-counting `train.jsonl` + `eval.jsonl` lines.)
