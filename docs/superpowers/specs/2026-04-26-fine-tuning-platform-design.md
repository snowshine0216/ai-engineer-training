# Fine-Tuning Platform MVP Design

Date: 2026-04-26

## Context

The project needs a small fine-tuning platform for LoRA-based training with ModelScope SWIFT. The first target model is a generative user-intent analysis model based on `Qwen2.5-7B-Instruct`. The platform should run locally on Apple Silicon first, follow the existing `swift-m5-lab` conventions, and leave a clean HTTP integration path for `/Users/snow/Documents/Repository/ai-engineer-training/projects/chat-site`.

Relevant local references:

- `/Users/snow/Documents/Repository/snow-knowledge-database/courses/ai-engineering-training-camp/module-2-fine-tuning/020-model-evaluation-and-deployment.md`
- `/Users/snow/Documents/Repository/ai-engineer-training/swift-m5-lab/README.md`
- `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/project2_1`
- `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/project2_2`
- `/Users/snow/Documents/Repository/ai-engineer-training/projects/chat-site`

External documentation checked during design:

- ModelScope SWIFT: https://github.com/modelscope/ms-swift
- Qwen ms-swift SFT docs: https://qwen.readthedocs.io/en/v2.5/training/SFT/ms_swift.html

## Decision

Build a standalone Python FastAPI app at:

`/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/fine-tuning-platform`

The MVP uses FastAPI for both backend and a simple server-rendered UI. It orchestrates SWIFT through CLI subprocesses instead of importing SWIFT internals. This keeps the system aligned with SWIFT's documented interface and makes local failures easier to debug.

## Goals

- Upload and validate intent datasets.
- Convert intent rows into SWIFT SFT JSONL for generative intent classification.
- Train `Qwen2.5-7B-Instruct` with LoRA using Apple Silicon-friendly defaults.
- Evaluate adapter and merged artifacts using deterministic intent metrics.
- Evaluate quantized artifacts when the selected quantization method is runnable locally.
- Merge LoRA adapters into a full model artifact.
- Quantize merged artifacts after merge.
- Expose a development inference endpoint for intent prediction.
- Preserve an HTTP contract that `chat-site` can call later.

## Non-Goals

- User accounts, teams, permissions, or billing.
- Distributed workers or production job queues.
- Production-grade high-throughput model serving.
- Direct modification of `chat-site` in the MVP.
- CUDA/vLLM production deployment automation in the first version.
- Multi-model registry beyond local artifact metadata.

## Architecture

The system boundary is:

`Browser UI -> FastAPI routes -> pure domain functions -> service/effect layer -> SWIFT CLI -> local artifacts`

FastAPI owns the UI, API routes, job metadata, log access, and inference endpoint. SWIFT remains the training/export backend. `chat-site` is not coupled to the platform code; it later calls the inference endpoint over HTTP.

The Apple Silicon profile is the default. It uses small per-device batch sizes, gradient accumulation, conservative max sequence length, LoRA training, and MPS/CPU-compatible environment settings. CUDA deployment settings are generated or documented later rather than assumed in the MVP runtime.

## Project Structure

```text
projects/fine-tuning-platform/
├── app/
│   ├── main.py
│   ├── api/
│   ├── domain/
│   ├── services/
│   ├── templates/
│   └── static/
├── tests/
│   ├── domain/
│   ├── api/
│   └── services/
├── training_data/
├── jobs/
├── logs/
├── output/
├── merged_models/
├── quantized_models/
├── eval_reports/
├── pyproject.toml
├── uv.lock
└── README.md
```

Large artifacts are kept out of git. Existing repository ignore rules already cover common training artifact directories such as `training_data`, `output`, `logs`, `merged_models`, and `quantized_models`.

## Core Modules

`app/main.py` wires FastAPI, routes, templates, and app configuration.

`app/domain/datasets.py` contains pure validation and conversion logic. It accepts source rows shaped as `{"text": "...", "intent": "..."}` and SWIFT-ready rows shaped as `{"instruction": "...", "output": "..."}`. It normalizes both into SWIFT instruction rows whose expected output is strict JSON.

`app/domain/training_config.py` normalizes training settings and applies the Apple Silicon preset.

`app/domain/swift_commands.py` builds `swift sft`, `swift infer`, and `swift export` commands as pure data.

`app/domain/metrics.py` parses model output JSON and computes exact match, per-intent precision, recall, F1, parse failures, and bad cases.

`app/domain/jobs.py` defines job statuses and pure status transition rules.

`app/services/storage.py` owns file reads, writes, manifests, and artifact paths.

`app/services/job_runner.py` owns subprocess execution, stdout/stderr capture, exit codes, and cancellation boundaries.

`app/services/job_repository.py` stores local job metadata. SQLite is acceptable, but JSON files are sufficient for the MVP if they keep the implementation simpler.

`app/services/inference.py` owns inference execution. It may call SWIFT through a subprocess in the MVP and can later proxy to a long-running OpenAI-compatible or vLLM service.

## Dataset And Eval Behavior

The required upload is `training_dataset.jsonl`.

The optional upload is `eval_dataset.jsonl`.

If no eval dataset is provided, the platform creates a deterministic train/eval split from the training dataset. The default split is 80/20 with a fixed seed. If a separate eval dataset is uploaded, no split is performed and that dataset becomes the benchmark.

The source intent format is:

```json
{"text": "帮我查一下今天上海天气", "intent": "weather_query"}
```

The normalized SWIFT SFT format is:

```json
{
  "instruction": "Analyze the user intent and respond with strict JSON.",
  "input": "帮我查一下今天上海天气",
  "output": "{\"intent\":\"weather_query\",\"confidence\":1.0}"
}
```

The model is trained as a generative SFT model, not as a sequence classification head. This aligns with SWIFT SFT, Qwen instruct serving, and future chat-style integration.

## Pipeline

The MVP pipeline is:

1. Upload dataset.
2. Validate and normalize dataset.
3. Create deterministic train/eval split if needed.
4. Start LoRA SFT with SWIFT.
5. Evaluate the LoRA adapter on the eval set.
6. Merge LoRA adapter into a full model artifact.
7. Evaluate the merged model.
8. Quantize the merged model.
9. Smoke-test and evaluate the quantized model when the selected method is runnable locally.
10. Expose selected artifacts through the development inference endpoint.

Quantization happens only after merge. The UI must show that Apple Silicon local quantization and CUDA/server quantization are not equivalent deployment targets. If a selected quantization method is not runnable on the current machine, the platform should fail early with a clear compatibility message or mark the step as a deployment-prep artifact rather than pretending local serving is supported.

## UI

The UI is intentionally plain and operational.

- `/` shows recent jobs and artifact health.
- `/datasets/new` uploads JSONL and shows validation results.
- `/jobs/new` selects dataset, optional eval dataset, base model path, output directory, and Apple Silicon preset.
- `/jobs/{id}` shows status, command, logs, checkpoints, artifacts, and next actions.
- `/jobs/{id}/eval` shows exact match, per-intent metrics, parse failures, and bad cases.
- `/jobs/{id}/export` merges LoRA and starts quantization after merge.
- `/predict` lets the user test an artifact against a single input.

## API

The API mirrors the UI:

- `POST /api/datasets`
- `GET /api/datasets/{dataset_id}`
- `POST /api/jobs`
- `GET /api/jobs/{job_id}`
- `GET /api/jobs/{job_id}/logs`
- `POST /api/jobs/{job_id}/eval`
- `POST /api/jobs/{job_id}/merge`
- `POST /api/jobs/{job_id}/quantize`
- `POST /api/predict-intent`

`POST /api/predict-intent` request:

```json
{
  "text": "帮我查一下今天上海天气",
  "model_artifact_id": "optional-export-or-quantized-artifact-id"
}
```

Response:

```json
{
  "text": "帮我查一下今天上海天气",
  "intent": "weather_query",
  "confidence": 0.91,
  "raw_response": "{\"intent\":\"weather_query\",\"confidence\":0.91}",
  "artifact_id": "merged-or-quantized-model-id"
}
```

The inference endpoint is a development endpoint, not the final production serving architecture. It validates strict JSON output and returns parse failures as structured API errors. `confidence` is model-reported and not treated as calibrated probability in the MVP metrics. Later, `chat-site` can call this endpoint directly or the platform can proxy to a dedicated serving process.

## SWIFT Command Policy

Command construction must be pure and tested. The service layer is the only layer allowed to execute commands.

The default training command is based on the `swift-m5-lab` pattern:

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
swift sft \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --dataset <normalized_train.jsonl> \
  --val_dataset <normalized_eval.jsonl> \
  --output_dir output/<job_id> \
  --num_train_epochs 3 \
  --max_length 512 \
  --learning_rate 1e-4 \
  --lora_rank 8 \
  --lora_alpha 32 \
  --per_device_train_batch_size 1 \
  --gradient_accumulation_steps 16 \
  --save_steps 100 \
  --logging_steps 10
```

The exact CLI flags should be verified during implementation against the installed `ms-swift` version. The design relies on documented SWIFT CLI behavior, not private Python internals.

## Error Handling

Invalid JSONL returns row-level validation errors and does not create a training job.

Missing `swift`, missing model path, missing writable artifact directory, or incompatible hardware fails before subprocess execution.

Subprocess failures preserve logs, command arguments, exit code, and status.

Malformed model JSON during eval or inference is counted as a parse failure. It does not crash the app.

Quantization compatibility failures must distinguish local runtime incompatibility from invalid user input.

## Testing

All implementation follows TDD.

Unit tests cover:

- dataset validation
- dataset normalization
- train/eval split determinism
- SWIFT command building
- job status transitions
- log parsing
- metric extraction
- malformed JSON handling
- inference response parsing

Integration tests cover:

- dataset upload routes using temp directories
- job creation with fake subprocess runners
- log retrieval
- eval report generation from fixed fixtures
- predict-intent route with fake inference output

No tests should require a real Qwen model or real SWIFT training by default. Real training remains a manual smoke test documented in the README.

## Future Integration With chat-site

The first integration point is HTTP:

`chat-site -> POST /api/predict-intent -> intent JSON`

`chat-site` can later add an intent analyzer client that calls the platform endpoint before selecting an agent, tool, or workflow. The platform remains independent and does not need to share code with the Next.js app.

The current `chat-site` already supports configurable OpenAI-compatible model endpoints. That is useful for future model-serving experiments, but the intent analyzer should start as a simple HTTP service call so it can return typed intent metadata instead of free-form chat text.

## Open Implementation Checks

- Verify the installed `ms-swift` CLI syntax in the new project environment.
- Confirm the best local Apple Silicon inference mode for `Qwen2.5-7B-Instruct`.
- Confirm which quantization method is runnable locally and which should be marked CUDA/server-oriented.
- Decide whether local job metadata should start as JSON files or SQLite during implementation. JSON files are preferred unless route tests show concurrency issues.
