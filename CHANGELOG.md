# Changelog

All notable changes to this project will be documented in this file.

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
