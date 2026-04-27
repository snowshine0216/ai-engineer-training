# Fine-Tuning Platform

Standalone FastAPI MVP for ModelScope SWIFT LoRA fine-tuning workflows.

## Features (v0.2.0.0)

Single-page Two-Pane Workspace dashboard at `http://localhost:8000`:

- **Jobs panel** (left) — live job list with status pills, 5 s polling
- **Upload Dataset** — drag-and-drop JSONL upload with validation
- **New Job** — dataset + base-model dropdowns populated from the API
- **Predict** — chip picker to select models; Quick tab (single prompt + history) and Batch tab (multi-prompt matrix, per-model accuracy, JSON export)

Legacy URLs (`/datasets/new`, `/jobs/new`, `/predict`) redirect 307 → `/`.

## Setup

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000`.

## Dataset Format

Upload JSONL rows:

```json
{"text":"帮我查天气","intent":"weather_query"}
```

The app converts rows into SWIFT SFT instruction records and creates a deterministic train/eval split.

## Manual SWIFT Smoke Test

After uploading a dataset and creating a job, inspect the generated command in the API response or job metadata. Run it manually first on Apple Silicon:

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
swift sft --model_type qwen2 --model models/Qwen2.5-7B-Instruct --dataset training_data/<dataset-id>/train.jsonl --val_dataset training_data/<dataset-id>/eval.jsonl --output_dir output/<job-id>
```

## Tests

```bash
uv run pytest
```
