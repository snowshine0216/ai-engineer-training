# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.0] - 2026-04-27 — Two-Pane Workspace UI redesign

### Added

- **Single-page workspace dashboard** (`workspace.html` + Alpine.js) replaces four separate Jinja2 template pages
  - Left pane: Upload Dataset, New Training Job, Jobs list with live 5 s status polling (paused on hidden tab)
  - Right pane: Predict Quick (single prompt), Predict Expanded (history panel), Predict Batch (eval-set loader with accuracy matrix)
- **Multi-model comparison** — side-by-side fan-out inference across base models and trained adapters
  - `POST /api/predict-intent/compare` with parallel fan-out via `asyncio.gather`
  - Chip-picker model selector with majority-vote agreement summary
- **New REST endpoints**: `GET /api/datasets`, `GET /api/artifacts`, `GET /api/models/base`, `GET /api/datasets/{id}/eval`
- **Pure domain function** `aggregate_compare_results` and `scan_artifacts` with 100% unit-test coverage

### Security (adversarial review)

- Path traversal blocked on all user-supplied path fields (`model_path`, `adapter_dir`, `merged_model_dir`, `ModelSpec.ref`) via Pydantic `field_validator`
- Server-side filesystem paths (`raw_path`, `train_path`, `eval_path`, model directory) no longer exposed in API responses
- `GET /api/models/base` returns `{name}` only; server resolves name → path internally in `run_one()`
- Atomic job file writes: write to `.tmp` then rename, eliminating partial-read races
- Malformed job JSON files are skipped rather than propagating HTTP 500

### Fixed

- `response.ok` guards added to all `refresh*()` polling functions and `run()` prediction calls
- `URL.revokeObjectURL()` deferred to next tick via `setTimeout(..., 100)` to avoid Safari revoke-before-navigate
- Load Eval Set button is now guarded against double-click during `batchBusy`
- CSS `font-size: 14px` annotated as intentional developer-tool density choice
- `:focus-visible` keyboard-navigation outlines added to `.btn`, `.chip`, `.chip-add`

## [0.1.0.0] - 2026-04-26

### Added

- **Fine-tuning platform MVP** (`projects/fine-tuning-platform/`) — standalone FastAPI app for ModelScope SWIFT LoRA fine-tuning workflows targeting `Qwen2.5-7B-Instruct` intent analysis
  - Upload and validate intent datasets (JSONL rows with `text` + `intent` fields or SWIFT-ready format)
  - Convert intent rows into SWIFT SFT instruction records with deterministic 80/20 train/eval split (seed=42)
  - Pure domain layer: dataset parsing, job status state machine, intent metrics, SWIFT command builders
  - Service layer: filesystem artifact storage, JSON job repository, subprocess log capture, inference output parser
  - REST API: `POST /api/datasets`, `POST /api/jobs`, `GET /api/jobs/{id}/logs`, `POST /api/jobs/{id}/merge`, `POST /api/jobs/{id}/quantize`, `POST /api/jobs/{id}/eval`, `POST /api/predict-intent`
  - Server-rendered UI pages (Jinja2): dataset upload, job creation, inference, index
  - Apple Silicon training profile: `PYTORCH_ENABLE_MPS_FALLBACK=1`, batch size 1, gradient accumulation 16, LoRA rank 8
  - 56 tests covering all domain paths, API routes, and error conditions (TDD throughout)
  - Design spec: `docs/superpowers/specs/2026-04-26-fine-tuning-platform-design.md`

### Security

- Path traversal prevention: `dataset_id` and `job_id` are validated against `^(dataset|job)-[a-f0-9]{12}$` before use in filesystem path construction
- Subprocess uses list-form argv (no `shell=True`); `quant_bits` validated against allowlist `{4, 8}`
- Binary file uploads return HTTP 400 instead of leaking a 500 with stack trace
- Async file I/O wrapped in `asyncio.to_thread()` to avoid blocking the event loop

### Performance

- O(N) JSONL parsing (replaced O(N²) list concatenation with `list.append()`)
- Subprocess resource management: `try/finally` ensures `process.kill()` on I/O exception
