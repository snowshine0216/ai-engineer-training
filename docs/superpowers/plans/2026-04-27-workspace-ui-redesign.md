# Workspace UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four cramped Jinja pages of the fine-tuning platform with a single workspace dashboard that consolidates Jobs / Upload / New Job / Predict, supports dropdown selectors for dataset and artifact IDs, and renders multi-model side-by-side prediction comparisons.

**Architecture:** FastAPI + Jinja2 + Alpine.js (CDN, no build) + hand-rolled CSS with design tokens. Pure functions for filesystem scans (`scan_datasets`, `scan_artifacts`, `scan_base_models`) and result aggregation (`aggregate_compare_results`); I/O kept inside the FastAPI route handlers per the repo's CLAUDE.md FP guidance. Backend gains four endpoints (`GET /api/datasets`, `GET /api/artifacts`, `GET /api/models/base`, `POST /api/predict-intent/compare`) — no breaking changes to existing routes.

**Tech Stack:** Python 3.12, FastAPI, Jinja2, Pydantic, pytest, uv. Frontend: Jinja2 template + Alpine.js v3 via CDN + hand-rolled CSS file mounted via `StaticFiles`. No bundler, no Tailwind, no React.

**Spec:** [docs/superpowers/specs/2026-04-27-workspace-ui-redesign.md](../specs/2026-04-27-workspace-ui-redesign.md)

---

## File Structure

All paths are relative to the repo root (`/Users/snow/Documents/Repository/ai-engineer-training/projects/fine-tuning-platform/.claude/worktrees/zen-jang-0cc430/`). The fine-tuning platform itself lives in `projects/fine-tuning-platform/`.

**New files:**

- `projects/fine-tuning-platform/app/domain/artifacts.py` — `Artifact` dataclass + `scan_artifacts` pure fn.
- `projects/fine-tuning-platform/app/domain/datasets_listing.py` — `DatasetSummary` dataclass + `scan_datasets` pure fn.
- `projects/fine-tuning-platform/app/domain/base_models.py` — `BaseModelInfo` dataclass + `scan_base_models` pure fn.
- `projects/fine-tuning-platform/app/domain/compare_aggregation.py` — `CompareSummary` dataclass + `aggregate_compare_results` pure fn.
- `projects/fine-tuning-platform/app/static/workspace.css` — design tokens + component styles.
- `projects/fine-tuning-platform/app/static/workspace.js` — small Alpine.js initialization helpers (fetch wrappers, history persistence). The reactive logic lives inline in `workspace.html` via `x-data`.
- `projects/fine-tuning-platform/app/templates/workspace.html` — the single-page workspace template.
- Test files mirroring each new module under `projects/fine-tuning-platform/tests/`.

**Modified files:**

- `projects/fine-tuning-platform/app/main.py` — mount `/static`, add 4 new endpoints, redirect legacy routes to `/`, render `workspace.html` from `/`.
- `projects/fine-tuning-platform/app/templates/base.html` — point `<head>` at `/static/workspace.css`, drop the inline `<style>` and the legacy `<nav>`.
- `projects/fine-tuning-platform/tests/api/test_pages.py` — assert workspace renders + legacy routes 307-redirect.

**Deleted files:**

- `projects/fine-tuning-platform/app/templates/index.html`
- `projects/fine-tuning-platform/app/templates/dataset_new.html`
- `projects/fine-tuning-platform/app/templates/job_new.html`
- `projects/fine-tuning-platform/app/templates/predict.html`

**Test-runner convention:** all pytest commands assume you're in `projects/fine-tuning-platform/`. Either `cd projects/fine-tuning-platform` once at the start of a shell session, or prefix every command with `cd projects/fine-tuning-platform && ...`. Examples in this plan use the inline-prefix form so they work copy-pasted from any cwd.

---

## Phase 1: Backend foundations

### Task 1: `Artifact` dataclass + `scan_artifacts` pure function

Discovers on-disk model artifacts derived from prior jobs. Pure: takes `Path`s, returns immutable list. No I/O outside the function call itself (reads filesystem deterministically given a snapshot).

**Files:**
- Create: `projects/fine-tuning-platform/app/domain/artifacts.py`
- Test: `projects/fine-tuning-platform/tests/domain/test_artifacts.py`

- [ ] **Step 1.1: Write failing tests**

Create `projects/fine-tuning-platform/tests/domain/test_artifacts.py`:

```python
import json
from datetime import datetime, timezone

from app.domain.artifacts import Artifact, scan_artifacts


def _write_job(jobs_dir, job_id, status="succeeded", dataset_id="dataset-aabbccddeeff"):
    jobs_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "job_id": job_id,
        "status": status,
        "dataset_id": dataset_id,
        "command": ["swift", "sft"],
        "artifact_paths": {},
    }
    (jobs_dir / f"{job_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def test_scan_artifacts_returns_empty_when_no_jobs(tmp_path):
    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert result == []


def test_scan_artifacts_emits_adapter_when_output_dir_exists(tmp_path):
    _write_job(tmp_path / "jobs", "job-aabbccddeeff")
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert len(result) == 1
    artifact = result[0]
    assert artifact.kind == "adapter"
    assert artifact.job_id == "job-aabbccddeeff"
    assert artifact.artifact_id == "job-aabbccddeeff:adapter"
    assert artifact.path.endswith("output/job-aabbccddeeff")
    # ISO 8601 with Z or +00:00
    datetime.fromisoformat(artifact.created_at.replace("Z", "+00:00"))


def test_scan_artifacts_emits_merged_and_quantized_when_dirs_exist(tmp_path):
    _write_job(tmp_path / "jobs", "job-aabbccddeeff")
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "merged_models" / "job-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "quantized_models" / "job-aabbccddeeff-bnb-int4").mkdir(parents=True)

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    kinds = sorted(artifact.kind for artifact in result)
    assert kinds == ["adapter", "merged", "quantized"]


def test_scan_artifacts_skips_kinds_whose_dir_is_missing(tmp_path):
    _write_job(tmp_path / "jobs", "job-aabbccddeeff")
    (tmp_path / "merged_models" / "job-aabbccddeeff").mkdir(parents=True)

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert [artifact.kind for artifact in result] == ["merged"]


def test_scan_artifacts_handles_multiple_jobs_newest_first(tmp_path):
    _write_job(tmp_path / "jobs", "job-aaaaaaaaaaaa")
    _write_job(tmp_path / "jobs", "job-bbbbbbbbbbbb")
    older = tmp_path / "output" / "job-aaaaaaaaaaaa"
    older.mkdir(parents=True)
    newer = tmp_path / "output" / "job-bbbbbbbbbbbb"
    newer.mkdir(parents=True)
    # Force newer mtime on the second dir
    import os, time
    os.utime(older, (time.time() - 100, time.time() - 100))

    result = scan_artifacts(
        jobs_dir=tmp_path / "jobs",
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert [artifact.job_id for artifact in result] == ["job-bbbbbbbbbbbb", "job-aaaaaaaaaaaa"]


def test_scan_artifacts_ignores_non_json_files_in_jobs_dir(tmp_path):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir()
    (jobs_dir / "README.md").write_text("not a job", encoding="utf-8")

    result = scan_artifacts(
        jobs_dir=jobs_dir,
        output_root=tmp_path / "output",
        merged_root=tmp_path / "merged_models",
        quantized_root=tmp_path / "quantized_models",
    )

    assert result == []
```

- [ ] **Step 1.2: Run tests, confirm they fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_artifacts.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.domain.artifacts'` for every test.

- [ ] **Step 1.3: Implement `app/domain/artifacts.py`**

Create `projects/fine-tuning-platform/app/domain/artifacts.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class Artifact:
    artifact_id: str
    job_id: str
    kind: str  # "adapter" | "merged" | "quantized"
    path: str
    label: str
    created_at: str  # ISO 8601 with timezone


def _iso(mtime: float) -> str:
    return datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _short(job_id: str) -> str:
    return job_id[4:12] if job_id.startswith("job-") and len(job_id) >= 12 else job_id


def _adapter(job_id: str, output_root: Path) -> Artifact | None:
    directory = output_root / job_id
    if not directory.exists():
        return None
    return Artifact(
        artifact_id=f"{job_id}:adapter",
        job_id=job_id,
        kind="adapter",
        path=directory.as_posix(),
        label=f"Adapter · {_short(job_id)}",
        created_at=_iso(directory.stat().st_mtime),
    )


def _merged(job_id: str, merged_root: Path) -> Artifact | None:
    directory = merged_root / job_id
    if not directory.exists():
        return None
    return Artifact(
        artifact_id=f"{job_id}:merged",
        job_id=job_id,
        kind="merged",
        path=directory.as_posix(),
        label=f"Merged · {_short(job_id)}",
        created_at=_iso(directory.stat().st_mtime),
    )


def _quantized(job_id: str, quantized_root: Path) -> list[Artifact]:
    if not quantized_root.exists():
        return []
    return [
        Artifact(
            artifact_id=f"{job_id}:quantized:{directory.name[len(job_id) + 1 :]}",
            job_id=job_id,
            kind="quantized",
            path=directory.as_posix(),
            label=f"Quantized · {_short(job_id)} · {directory.name[len(job_id) + 1 :]}",
            created_at=_iso(directory.stat().st_mtime),
        )
        for directory in sorted(quantized_root.glob(f"{job_id}-*"))
        if directory.is_dir()
    ]


def scan_artifacts(jobs_dir: Path, output_root: Path, merged_root: Path, quantized_root: Path) -> list[Artifact]:
    if not jobs_dir.exists():
        return []
    job_ids = sorted(path.stem for path in jobs_dir.glob("job-*.json"))
    artifacts = [
        artifact
        for job_id in job_ids
        for artifact in [_adapter(job_id, output_root), _merged(job_id, merged_root), *_quantized(job_id, quantized_root)]
        if artifact is not None
    ]
    return sorted(artifacts, key=lambda artifact: artifact.created_at, reverse=True)
```

- [ ] **Step 1.4: Run tests, confirm they pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_artifacts.py -v
```

Expected: 6 passed.

- [ ] **Step 1.5: Commit**

```bash
git add projects/fine-tuning-platform/app/domain/artifacts.py projects/fine-tuning-platform/tests/domain/test_artifacts.py
git commit -m "feat(domain): add scan_artifacts pure function"
```

---

### Task 2: `GET /api/artifacts` endpoint

Wraps `scan_artifacts` behind a JSON endpoint. The handler does the I/O (resolving paths from the FastAPI app root); the pure function does the work.

**Files:**
- Modify: `projects/fine-tuning-platform/app/main.py`
- Test: `projects/fine-tuning-platform/tests/api/test_artifacts_list_api.py`

- [ ] **Step 2.1: Write failing tests**

Create `projects/fine-tuning-platform/tests/api/test_artifacts_list_api.py`:

```python
import json

from fastapi.testclient import TestClient

from app.main import create_app


def test_list_artifacts_returns_empty_when_no_jobs(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/artifacts")

    assert response.status_code == 200
    assert response.json() == {"artifacts": []}


def test_list_artifacts_returns_adapter_when_output_dir_exists(tmp_path):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True)
    (jobs_dir / "job-aabbccddeeff.json").write_text(
        json.dumps({"job_id": "job-aabbccddeeff", "status": "succeeded", "dataset_id": "dataset-aabbccddeeff", "command": [], "artifact_paths": {}}),
        encoding="utf-8",
    )
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)

    response = TestClient(create_app(root=tmp_path)).get("/api/artifacts")

    assert response.status_code == 200
    body = response.json()
    assert len(body["artifacts"]) == 1
    artifact = body["artifacts"][0]
    assert artifact["kind"] == "adapter"
    assert artifact["job_id"] == "job-aabbccddeeff"
    assert artifact["artifact_id"] == "job-aabbccddeeff:adapter"


def test_list_artifacts_returns_multiple_kinds_for_one_job(tmp_path):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True)
    (jobs_dir / "job-aabbccddeeff.json").write_text(
        json.dumps({"job_id": "job-aabbccddeeff", "status": "merged", "dataset_id": "dataset-aabbccddeeff", "command": [], "artifact_paths": {}}),
        encoding="utf-8",
    )
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "merged_models" / "job-aabbccddeeff").mkdir(parents=True)

    response = TestClient(create_app(root=tmp_path)).get("/api/artifacts")

    kinds = sorted(artifact["kind"] for artifact in response.json()["artifacts"])
    assert kinds == ["adapter", "merged"]
```

- [ ] **Step 2.2: Run tests, confirm they fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_artifacts_list_api.py -v
```

Expected: 404 Not Found on `/api/artifacts` for all three tests.

- [ ] **Step 2.3: Add the endpoint to `app/main.py`**

Add this import near the existing `from app.domain.*` block in `projects/fine-tuning-platform/app/main.py`:

```python
from app.domain.artifacts import scan_artifacts
```

Add this route handler inside `create_app` (next to the other `@app.get` routes):

```python
    @app.get("/api/artifacts")
    def list_artifacts() -> dict[str, object]:
        artifacts = scan_artifacts(
            jobs_dir=app_root / "jobs",
            output_root=app_root / "output",
            merged_root=app_root / "merged_models",
            quantized_root=app_root / "quantized_models",
        )
        return {"artifacts": [artifact.__dict__ for artifact in artifacts]}
```

- [ ] **Step 2.4: Run tests, confirm they pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_artifacts_list_api.py -v
```

Expected: 3 passed.

- [ ] **Step 2.5: Commit**

```bash
git add projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/tests/api/test_artifacts_list_api.py
git commit -m "feat(api): add GET /api/artifacts endpoint"
```

---

### Task 3: `DatasetSummary` + `scan_datasets` + `GET /api/datasets`

Lists uploaded datasets discovered by scanning `training_data/`. `row_count` is computed by line-counting `train.jsonl` + `eval.jsonl` (no sidecar required — keeps the upload flow untouched).

**Files:**
- Create: `projects/fine-tuning-platform/app/domain/datasets_listing.py`
- Test: `projects/fine-tuning-platform/tests/domain/test_datasets_listing.py`
- Modify: `projects/fine-tuning-platform/app/main.py`
- Test: `projects/fine-tuning-platform/tests/api/test_datasets_list_api.py`

- [ ] **Step 3.1: Write failing pure-function tests**

Create `projects/fine-tuning-platform/tests/domain/test_datasets_listing.py`:

```python
from datetime import datetime

from app.domain.datasets_listing import DatasetSummary, scan_datasets


def test_scan_datasets_returns_empty_when_directory_missing(tmp_path):
    assert scan_datasets(tmp_path / "training_data") == []


def test_scan_datasets_returns_empty_when_directory_empty(tmp_path):
    (tmp_path / "training_data").mkdir()
    assert scan_datasets(tmp_path / "training_data") == []


def test_scan_datasets_counts_rows_across_train_and_eval(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n{}\n{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("{}\n", encoding="utf-8")

    summaries = scan_datasets(tmp_path / "training_data")

    assert len(summaries) == 1
    assert summaries[0].dataset_id == "dataset-aabbccddeeff"
    assert summaries[0].row_count == 4
    datetime.fromisoformat(summaries[0].created_at.replace("Z", "+00:00"))


def test_scan_datasets_skips_blank_lines(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n\n{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("", encoding="utf-8")

    summaries = scan_datasets(tmp_path / "training_data")

    assert summaries[0].row_count == 2


def test_scan_datasets_orders_newest_first(tmp_path):
    import os, time
    older = tmp_path / "training_data" / "dataset-aaaaaaaaaaaa"
    newer = tmp_path / "training_data" / "dataset-bbbbbbbbbbbb"
    older.mkdir(parents=True)
    newer.mkdir(parents=True)
    for d in (older, newer):
        (d / "train.jsonl").write_text("{}\n", encoding="utf-8")
        (d / "eval.jsonl").write_text("{}\n", encoding="utf-8")
    os.utime(older, (time.time() - 100, time.time() - 100))

    summaries = scan_datasets(tmp_path / "training_data")

    assert [s.dataset_id for s in summaries] == ["dataset-bbbbbbbbbbbb", "dataset-aaaaaaaaaaaa"]


def test_scan_datasets_ignores_non_dataset_directories(tmp_path):
    (tmp_path / "training_data" / "dataset-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "training_data" / "dataset-aabbccddeeff" / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (tmp_path / "training_data" / "dataset-aabbccddeeff" / "eval.jsonl").write_text("{}\n", encoding="utf-8")
    (tmp_path / "training_data" / "junk").mkdir(parents=True)
    (tmp_path / "training_data" / "stray.txt").write_text("nope", encoding="utf-8")

    summaries = scan_datasets(tmp_path / "training_data")

    assert [s.dataset_id for s in summaries] == ["dataset-aabbccddeeff"]
```

- [ ] **Step 3.2: Run tests, confirm they fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_datasets_listing.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.domain.datasets_listing'` for every test.

- [ ] **Step 3.3: Implement `app/domain/datasets_listing.py`**

Create `projects/fine-tuning-platform/app/domain/datasets_listing.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class DatasetSummary:
    dataset_id: str
    row_count: int
    created_at: str
    train_path: str
    eval_path: str


def _iso(mtime: float) -> str:
    return datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _count_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open(encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def _summarize(directory: Path) -> DatasetSummary | None:
    train_path = directory / "train.jsonl"
    eval_path = directory / "eval.jsonl"
    if not (train_path.exists() and eval_path.exists()):
        return None
    return DatasetSummary(
        dataset_id=directory.name,
        row_count=_count_rows(train_path) + _count_rows(eval_path),
        created_at=_iso(directory.stat().st_mtime),
        train_path=train_path.as_posix(),
        eval_path=eval_path.as_posix(),
    )


def scan_datasets(training_data_dir: Path) -> list[DatasetSummary]:
    if not training_data_dir.exists():
        return []
    candidates = [path for path in training_data_dir.glob("dataset-*") if path.is_dir()]
    summaries = [summary for summary in (_summarize(path) for path in candidates) if summary is not None]
    return sorted(summaries, key=lambda s: s.created_at, reverse=True)
```

- [ ] **Step 3.4: Run pure-function tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_datasets_listing.py -v
```

Expected: 6 passed.

- [ ] **Step 3.5: Write failing API tests**

Create `projects/fine-tuning-platform/tests/api/test_datasets_list_api.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_list_datasets_returns_empty_when_no_uploads(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/datasets")

    assert response.status_code == 200
    assert response.json() == {"datasets": []}


def test_list_datasets_returns_summary_after_upload(tmp_path):
    client = TestClient(create_app(root=tmp_path))
    upload = client.post(
        "/api/datasets",
        files={"training_dataset": ("intent.jsonl", b'{"text":"hi","intent":"greeting"}\n{"text":"bye","intent":"farewell"}\n', "application/jsonl")},
    )
    assert upload.status_code == 200

    response = client.get("/api/datasets")

    assert response.status_code == 200
    body = response.json()
    assert len(body["datasets"]) == 1
    assert body["datasets"][0]["dataset_id"].startswith("dataset-")
    assert body["datasets"][0]["row_count"] >= 1
    assert body["datasets"][0]["train_path"].endswith("/train.jsonl")
    assert body["datasets"][0]["eval_path"].endswith("/eval.jsonl")
```

- [ ] **Step 3.6: Run API tests, confirm they fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_datasets_list_api.py -v
```

Expected: 404 Not Found on `/api/datasets` for both tests.

- [ ] **Step 3.7: Add the endpoint to `app/main.py`**

Add to imports:

```python
from app.domain.datasets_listing import scan_datasets
```

Add inside `create_app`:

```python
    @app.get("/api/datasets")
    def list_datasets() -> dict[str, object]:
        summaries = scan_datasets(app_root / "training_data")
        return {"datasets": [summary.__dict__ for summary in summaries]}
```

- [ ] **Step 3.8: Run all dataset tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_datasets_list_api.py tests/domain/test_datasets_listing.py -v
```

Expected: 8 passed.

- [ ] **Step 3.9: Commit**

```bash
git add projects/fine-tuning-platform/app/domain/datasets_listing.py projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/tests/domain/test_datasets_listing.py projects/fine-tuning-platform/tests/api/test_datasets_list_api.py
git commit -m "feat(api): add GET /api/datasets endpoint with row counting"
```

---

### Task 4: `BaseModelInfo` + `scan_base_models` + `GET /api/models/base`

**Files:**
- Create: `projects/fine-tuning-platform/app/domain/base_models.py`
- Test: `projects/fine-tuning-platform/tests/domain/test_base_models.py`
- Modify: `projects/fine-tuning-platform/app/main.py`
- Test: `projects/fine-tuning-platform/tests/api/test_models_base_api.py`

- [ ] **Step 4.1: Write failing pure-function tests**

Create `projects/fine-tuning-platform/tests/domain/test_base_models.py`:

```python
from app.domain.base_models import BaseModelInfo, scan_base_models


def test_scan_base_models_returns_empty_when_directory_missing(tmp_path):
    assert scan_base_models(tmp_path / "models") == []


def test_scan_base_models_returns_empty_when_directory_empty(tmp_path):
    (tmp_path / "models").mkdir()
    assert scan_base_models(tmp_path / "models") == []


def test_scan_base_models_lists_each_subdirectory(tmp_path):
    (tmp_path / "models" / "Qwen2.5-7B-Instruct").mkdir(parents=True)
    (tmp_path / "models" / "Qwen2.5-1.5B-Instruct").mkdir(parents=True)

    models = scan_base_models(tmp_path / "models")

    names = sorted(model.name for model in models)
    assert names == ["Qwen2.5-1.5B-Instruct", "Qwen2.5-7B-Instruct"]
    for model in models:
        assert model.path.endswith(model.name)


def test_scan_base_models_skips_files_at_root(tmp_path):
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "README.md").write_text("docs", encoding="utf-8")
    (tmp_path / "models" / "Qwen2.5-7B-Instruct").mkdir()

    models = scan_base_models(tmp_path / "models")

    assert [model.name for model in models] == ["Qwen2.5-7B-Instruct"]
```

- [ ] **Step 4.2: Run pure-function tests, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_base_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.domain.base_models'`.

- [ ] **Step 4.3: Implement `app/domain/base_models.py`**

Create `projects/fine-tuning-platform/app/domain/base_models.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BaseModelInfo:
    name: str
    path: str


def scan_base_models(models_dir: Path) -> list[BaseModelInfo]:
    if not models_dir.exists():
        return []
    return sorted(
        (BaseModelInfo(name=path.name, path=path.as_posix()) for path in models_dir.iterdir() if path.is_dir()),
        key=lambda model: model.name,
    )
```

- [ ] **Step 4.4: Run pure-function tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_base_models.py -v
```

Expected: 4 passed.

- [ ] **Step 4.5: Write failing API tests**

Create `projects/fine-tuning-platform/tests/api/test_models_base_api.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_list_base_models_returns_empty_when_directory_missing(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/models/base")

    assert response.status_code == 200
    assert response.json() == {"models": []}


def test_list_base_models_returns_directories(tmp_path):
    (tmp_path / "models" / "Qwen2.5-7B-Instruct").mkdir(parents=True)

    response = TestClient(create_app(root=tmp_path)).get("/api/models/base")

    assert response.status_code == 200
    body = response.json()
    assert len(body["models"]) == 1
    assert body["models"][0]["name"] == "Qwen2.5-7B-Instruct"
    assert body["models"][0]["path"].endswith("models/Qwen2.5-7B-Instruct")
```

- [ ] **Step 4.6: Run API tests, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_models_base_api.py -v
```

Expected: 404 Not Found.

- [ ] **Step 4.7: Add the endpoint to `app/main.py`**

Add import:

```python
from app.domain.base_models import scan_base_models
```

Add route inside `create_app`:

```python
    @app.get("/api/models/base")
    def list_base_models() -> dict[str, object]:
        models = scan_base_models(app_root / "models")
        return {"models": [model.__dict__ for model in models]}
```

- [ ] **Step 4.8: Run base-model tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_models_base_api.py tests/domain/test_base_models.py -v
```

Expected: 6 passed.

- [ ] **Step 4.9: Commit**

```bash
git add projects/fine-tuning-platform/app/domain/base_models.py projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/tests/domain/test_base_models.py projects/fine-tuning-platform/tests/api/test_models_base_api.py
git commit -m "feat(api): add GET /api/models/base endpoint"
```

---

### Task 5: `aggregate_compare_results` pure function

Computes the agreement %, majority intent, and per-model latency stats for a multi-model compare run. Used by the new compare endpoint in Task 6.

**Files:**
- Create: `projects/fine-tuning-platform/app/domain/compare_aggregation.py`
- Test: `projects/fine-tuning-platform/tests/domain/test_compare_aggregation.py`

- [ ] **Step 5.1: Write failing tests**

Create `projects/fine-tuning-platform/tests/domain/test_compare_aggregation.py`:

```python
from app.domain.compare_aggregation import CompareSummary, aggregate_compare_results


def _result(model_id: str, intent: str | None, latency_ms: int = 100, error: str | None = None) -> dict:
    payload = {"model_id": model_id, "kind": "artifact", "latency_ms": latency_ms}
    if intent is not None:
        payload["intent"] = intent
    if error is not None:
        payload["error"] = error
    return payload


def test_aggregate_returns_zero_agreement_for_empty_input():
    summary = aggregate_compare_results([])

    assert summary.agreement == 0.0
    assert summary.majority is None


def test_aggregate_returns_full_agreement_when_all_models_match():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", "weather_query"),
        _result("c", "weather_query"),
    ])

    assert summary.agreement == 1.0
    assert summary.majority == "weather_query"


def test_aggregate_computes_partial_agreement_and_majority():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", "weather_query"),
        _result("c", "other"),
    ])

    assert summary.agreement == 2 / 3
    assert summary.majority == "weather_query"


def test_aggregate_excludes_errored_results_from_agreement_math():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", None, error="boom"),
        _result("c", "weather_query"),
    ])

    assert summary.agreement == 1.0
    assert summary.majority == "weather_query"


def test_aggregate_returns_no_majority_on_tie():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", "other"),
    ])

    assert summary.majority is None
    assert summary.agreement == 0.5
```

- [ ] **Step 5.2: Run tests, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_compare_aggregation.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.domain.compare_aggregation'`.

- [ ] **Step 5.3: Implement `app/domain/compare_aggregation.py`**

Create `projects/fine-tuning-platform/app/domain/compare_aggregation.py`:

```python
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CompareSummary:
    agreement: float
    majority: str | None


def aggregate_compare_results(results: list[dict[str, Any]]) -> CompareSummary:
    intents = [result["intent"] for result in results if result.get("error") is None and result.get("intent")]
    if not intents:
        return CompareSummary(agreement=0.0, majority=None)
    counts = Counter(intents)
    top_count = max(counts.values())
    leaders = [intent for intent, count in counts.items() if count == top_count]
    majority = leaders[0] if len(leaders) == 1 else None
    agreement = top_count / len(intents)
    return CompareSummary(agreement=agreement, majority=majority)
```

- [ ] **Step 5.4: Run tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/domain/test_compare_aggregation.py -v
```

Expected: 5 passed.

- [ ] **Step 5.5: Commit**

```bash
git add projects/fine-tuning-platform/app/domain/compare_aggregation.py projects/fine-tuning-platform/tests/domain/test_compare_aggregation.py
git commit -m "feat(domain): add aggregate_compare_results pure function"
```

---

### Task 6: `POST /api/predict-intent/compare` endpoint

Fans out a single prompt to N models in parallel via `asyncio.to_thread`. Returns per-model results plus an aggregate summary. Per-model errors are captured as `{error: ...}` so a single failure doesn't fail the whole request.

**Files:**
- Modify: `projects/fine-tuning-platform/app/main.py`
- Test: `projects/fine-tuning-platform/tests/api/test_predict_compare_api.py`

- [ ] **Step 6.1: Write failing tests**

Create `projects/fine-tuning-platform/tests/api/test_predict_compare_api.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def _ok_response(intent: str, confidence: float = 0.9) -> str:
    return f'{{"intent":"{intent}","confidence":{confidence}}}'


def test_compare_returns_501_when_inference_not_configured(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post(
        "/api/predict-intent/compare",
        json={"text": "查天气", "model_specs": [{"kind": "base", "ref": "models/Qwen2.5-7B-Instruct"}]},
    )

    assert response.status_code == 501


def test_compare_runs_all_models_and_returns_results(tmp_path):
    def fake(text, ref):
        return _ok_response("weather_query") if ref.endswith("Qwen2.5-7B-Instruct") else _ok_response("other")

    client = TestClient(create_app(root=tmp_path, infer_raw=fake))

    response = client.post(
        "/api/predict-intent/compare",
        json={
            "text": "查天气",
            "model_specs": [
                {"kind": "base", "ref": "models/Qwen2.5-7B-Instruct"},
                {"kind": "artifact", "ref": "job-aabbccddeeff:adapter"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "查天气"
    assert len(body["results"]) == 2
    assert body["results"][0]["model_id"] == "models/Qwen2.5-7B-Instruct"
    assert body["results"][0]["intent"] == "weather_query"
    assert body["results"][1]["intent"] == "other"
    assert body["summary"]["agreement"] == 0.5
    assert body["summary"]["majority"] is None


def test_compare_captures_per_model_errors_without_failing_request(tmp_path):
    def fake(text, ref):
        if "broken" in ref:
            raise RuntimeError("inference unavailable")
        return _ok_response("weather_query")

    client = TestClient(create_app(root=tmp_path, infer_raw=fake))

    response = client.post(
        "/api/predict-intent/compare",
        json={
            "text": "查天气",
            "model_specs": [
                {"kind": "base", "ref": "models/Qwen2.5-7B-Instruct"},
                {"kind": "artifact", "ref": "broken-artifact"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    results = {result["model_id"]: result for result in body["results"]}
    assert results["models/Qwen2.5-7B-Instruct"]["intent"] == "weather_query"
    assert results["broken-artifact"]["error"] == "inference unavailable"
    assert "intent" not in results["broken-artifact"]
    assert body["summary"]["agreement"] == 1.0
    assert body["summary"]["majority"] == "weather_query"


def test_compare_returns_400_when_model_specs_empty(tmp_path):
    client = TestClient(create_app(root=tmp_path, infer_raw=lambda text, ref: _ok_response("x")))

    response = client.post("/api/predict-intent/compare", json={"text": "查天气", "model_specs": []})

    assert response.status_code == 400
```

- [ ] **Step 6.2: Run tests, confirm they fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_predict_compare_api.py -v
```

Expected: 404 Not Found.

- [ ] **Step 6.3: Add the compare endpoint to `app/main.py`**

Add imports near the top of the file:

```python
import asyncio
import time

from app.domain.compare_aggregation import aggregate_compare_results
from app.domain.metrics import parse_intent_response
```

Add a Pydantic request model alongside the existing ones:

```python
class ModelSpec(BaseModel):
    kind: str
    ref: str


class PredictIntentCompareRequest(BaseModel):
    text: str
    model_specs: list[ModelSpec]
```

Add the route inside `create_app`:

```python
    @app.post("/api/predict-intent/compare")
    async def predict_intent_compare(request: PredictIntentCompareRequest) -> dict[str, object]:
        if infer_raw is None:
            raise HTTPException(status_code=501, detail="live SWIFT inference is not enabled in tests")
        if not request.model_specs:
            raise HTTPException(status_code=400, detail="model_specs must not be empty")

        async def run_one(spec: ModelSpec) -> dict[str, object]:
            started = time.monotonic()
            try:
                raw = await asyncio.to_thread(infer_raw, request.text, spec.ref)
            except Exception as exc:
                return {
                    "model_id": spec.ref,
                    "kind": spec.kind,
                    "latency_ms": int((time.monotonic() - started) * 1000),
                    "error": str(exc),
                }
            elapsed_ms = int((time.monotonic() - started) * 1000)
            parsed = parse_intent_response(raw)
            if parsed.error:
                return {
                    "model_id": spec.ref,
                    "kind": spec.kind,
                    "latency_ms": elapsed_ms,
                    "error": parsed.error,
                    "raw": raw,
                }
            return {
                "model_id": spec.ref,
                "kind": spec.kind,
                "intent": parsed.intent,
                "confidence": parsed.confidence,
                "latency_ms": elapsed_ms,
                "raw": raw,
            }

        results = list(await asyncio.gather(*(run_one(spec) for spec in request.model_specs)))
        summary = aggregate_compare_results(results)
        return {"text": request.text, "results": results, "summary": summary.__dict__}
```

- [ ] **Step 6.4: Run tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_predict_compare_api.py -v
```

Expected: 4 passed.

- [ ] **Step 6.5: Commit**

```bash
git add projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/tests/api/test_predict_compare_api.py
git commit -m "feat(api): add POST /api/predict-intent/compare with parallel fan-out"
```

---

### Task 7: Static dir mount + design tokens CSS

Mount `app/static` so the workspace template can load CSS and JS. Add the design-tokens stylesheet (no component styles yet — those come in later tasks). Verify the asset is served.

**Files:**
- Modify: `projects/fine-tuning-platform/app/main.py`
- Create: `projects/fine-tuning-platform/app/static/workspace.css`
- Test: `projects/fine-tuning-platform/tests/api/test_static_assets.py`

- [ ] **Step 7.1: Write failing static-asset test**

Create `projects/fine-tuning-platform/tests/api/test_static_assets.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_css_is_served_with_design_tokens(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/static/workspace.css")

    assert response.status_code == 200
    assert "--primary" in response.text
    assert "--bg" in response.text
```

- [ ] **Step 7.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_static_assets.py -v
```

Expected: 404 Not Found.

- [ ] **Step 7.3: Mount static directory in `app/main.py`**

Add to imports:

```python
from fastapi.staticfiles import StaticFiles
```

Add immediately after `app = FastAPI(...)` inside `create_app`:

```python
    app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
```

- [ ] **Step 7.4: Create `app/static/workspace.css` with design tokens**

Create `projects/fine-tuning-platform/app/static/workspace.css`:

```css
:root {
  --bg: #f5f7fb;
  --surface: #ffffff;
  --border: #e2e8f0;
  --border-soft: #f1f5f9;
  --text: #0f172a;
  --text-muted: #64748b;
  --primary: #6366f1;
  --primary-grad: linear-gradient(135deg, #6366f1, #8b5cf6);
  --green: #16a34a; --green-bg: #dcfce7; --green-fg: #166534;
  --indigo-bg: #e0e7ff; --indigo-fg: #3730a3;
  --red-bg: #fee2e2; --red-fg: #991b1b;
  --slate-bg: #f1f5f9; --slate-fg: #475569;
  --r-sm: 6px; --r-md: 8px; --r-lg: 10px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px;
  --shadow-1: 0 1px 3px rgba(15, 23, 42, .05);
  --shadow-2: 0 4px 12px rgba(15, 23, 42, .08);
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", monospace;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
}

button { font: inherit; cursor: pointer; }
input, select, textarea { font: inherit; }
code, kbd, pre, .mono { font-family: var(--font-mono); }

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar__brand { display: flex; align-items: center; gap: var(--space-2); font-weight: 600; }
.topbar__logo { width: 18px; height: 18px; background: var(--primary-grad); border-radius: var(--r-sm); }

.workspace {
  flex: 1;
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--space-3);
  padding: var(--space-3);
}

.workspace--predict-expanded { grid-template-columns: 280px 1fr; }

.panel {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}

.panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-soft);
  font-weight: 600;
}

.panel__body { padding: var(--space-3) var(--space-4); }

.right-rail { display: flex; flex-direction: column; gap: var(--space-3); }

.pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}
.pill--running { background: var(--green-bg); color: var(--green-fg); }
.pill--done { background: var(--indigo-bg); color: var(--indigo-fg); }
.pill--failed { background: var(--red-bg); color: var(--red-fg); }
.pill--created, .pill--evaluating, .pill--evaluated, .pill--merging, .pill--merged, .pill--quantizing, .pill--quantized {
  background: var(--slate-bg); color: var(--slate-fg);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 8px 14px;
  border: 0;
  border-radius: var(--r-md);
  font-weight: 500;
  background: var(--primary-grad);
  color: white;
}
.btn--ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
.btn--small { padding: 4px 10px; font-size: 12px; }

@media (max-width: 1024px) {
  .workspace, .workspace--predict-expanded { grid-template-columns: 1fr; }
}
```

- [ ] **Step 7.5: Run static-asset test, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_static_assets.py -v
```

Expected: 1 passed.

- [ ] **Step 7.6: Commit**

```bash
git add projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/tests/api/test_static_assets.py
git commit -m "feat(ui): mount static dir, add workspace.css design tokens"
```

---

## Phase 2: Frontend skeleton

### Task 8: Workspace template scaffold + legacy redirects + page tests

Replace the four old templates with one `workspace.html`. Make the legacy URLs 307-redirect to `/`. Update `tests/api/test_pages.py` so it asserts the redirects + workspace renders. The scaffold contains markers for each section so later tasks can fill them in without altering the surrounding shell.

**Files:**
- Create: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/templates/base.html`
- Delete: `projects/fine-tuning-platform/app/templates/index.html`
- Delete: `projects/fine-tuning-platform/app/templates/dataset_new.html`
- Delete: `projects/fine-tuning-platform/app/templates/job_new.html`
- Delete: `projects/fine-tuning-platform/app/templates/predict.html`
- Modify: `projects/fine-tuning-platform/app/main.py`
- Modify: `projects/fine-tuning-platform/tests/api/test_pages.py`

- [ ] **Step 8.1: Update `tests/api/test_pages.py` with the new expectations (failing first)**

Replace the contents of `projects/fine-tuning-platform/tests/api/test_pages.py` with:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_renders_at_root(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    assert "Fine-Tuning Platform" in response.text
    assert 'data-section="jobs"' in response.text
    assert 'data-section="upload"' in response.text
    assert 'data-section="new-job"' in response.text
    assert 'data-section="predict"' in response.text


def test_workspace_loads_design_tokens_css(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    assert "/static/workspace.css" in response.text


def test_legacy_dataset_route_redirects_to_workspace(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/datasets/new", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"


def test_legacy_jobs_new_route_redirects_to_workspace(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/jobs/new", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"


def test_legacy_predict_route_redirects_to_workspace(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/predict", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"
```

- [ ] **Step 8.2: Run page tests, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_pages.py -v
```

Expected: 5 failures (workspace markers missing, legacy routes still render templates).

- [ ] **Step 8.3: Replace `base.html`**

Overwrite `projects/fine-tuning-platform/app/templates/base.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Fine-Tuning Platform</title>
    <link rel="stylesheet" href="/static/workspace.css">
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js"></script>
  </head>
  <body>
    {% block content %}{% endblock %}
  </body>
</html>
```

- [ ] **Step 8.4: Create `workspace.html` scaffold**

Create `projects/fine-tuning-platform/app/templates/workspace.html`:

```html
{% extends "base.html" %}
{% block content %}
<div class="app" x-data="workspace()" x-init="bootstrap()">
  <header class="topbar">
    <div class="topbar__brand">
      <span class="topbar__logo" aria-hidden="true"></span>
      <span>Fine-Tuning Platform</span>
    </div>
    <div class="topbar__status">
      <span class="pill pill--running" x-show="runningCount() > 0" x-text="runningCount() + ' running'"></span>
    </div>
  </header>

  <main class="workspace" :class="{ 'workspace--predict-expanded': predictExpanded }">
    <!-- Jobs panel (left) -->
    <section class="panel" data-section="jobs">
      <header class="panel__header">
        <span>Jobs</span>
        <span class="topbar__status" x-text="jobs.length + ' total'"></span>
      </header>
      <div class="panel__body">
        <p class="topbar__status">Jobs panel — populated in Task 9.</p>
      </div>
    </section>

    <!-- Right rail -->
    <aside class="right-rail" x-show="!predictExpanded">
      <section class="panel" data-section="upload">
        <header class="panel__header"><span>Upload Dataset</span></header>
        <div class="panel__body">
          <p class="topbar__status">Upload — populated in Task 10.</p>
        </div>
      </section>

      <section class="panel" data-section="new-job">
        <header class="panel__header"><span>New Job</span></header>
        <div class="panel__body">
          <p class="topbar__status">New Job — populated in Task 11.</p>
        </div>
      </section>

      <section class="panel" data-section="predict">
        <header class="panel__header">
          <span>Predict</span>
          <button class="btn btn--ghost btn--small" @click="predictExpanded = true">Expand</button>
        </header>
        <div class="panel__body">
          <p class="topbar__status">Predict (compact) — populated in Task 12.</p>
        </div>
      </section>
    </aside>

    <!-- Predict expanded view (replaces right rail when active) -->
    <section class="panel" data-section="predict-expanded" x-show="predictExpanded">
      <header class="panel__header">
        <span>Predict — comparison</span>
        <button class="btn btn--ghost btn--small" @click="predictExpanded = false">Collapse</button>
      </header>
      <div class="panel__body">
        <p class="topbar__status">Predict expanded — populated in Tasks 13–14.</p>
      </div>
    </section>
  </main>

  <script src="/static/workspace.js"></script>
</div>
{% endblock %}
```

- [ ] **Step 8.5: Create the initial `workspace.js`**

Create `projects/fine-tuning-platform/app/static/workspace.js`:

```javascript
function workspace() {
  return {
    jobs: [],
    datasets: [],
    artifacts: [],
    baseModels: [],
    predictExpanded: false,

    async bootstrap() {
      await Promise.all([this.refreshJobs(), this.refreshDatasets(), this.refreshArtifacts(), this.refreshBaseModels()]);
    },
    async refreshJobs() {
      const response = await fetch('/api/jobs');
      const body = await response.json();
      this.jobs = body.jobs ?? [];
    },
    async refreshDatasets() {
      const response = await fetch('/api/datasets');
      const body = await response.json();
      this.datasets = body.datasets ?? [];
    },
    async refreshArtifacts() {
      const response = await fetch('/api/artifacts');
      const body = await response.json();
      this.artifacts = body.artifacts ?? [];
    },
    async refreshBaseModels() {
      const response = await fetch('/api/models/base');
      const body = await response.json();
      this.baseModels = body.models ?? [];
    },
    runningCount() {
      return this.jobs.filter(job => job.status === 'running').length;
    },
  };
}
```

- [ ] **Step 8.6: Update `app/main.py` — workspace at `/`, legacy redirects, drop old template handlers**

Replace these route handlers in `projects/fine-tuning-platform/app/main.py`:

```python
    @app.get("/")
    def index(request: Request):
        return templates.TemplateResponse(request=request, name="index.html")

    @app.get("/datasets/new")
    def dataset_new(request: Request):
        return templates.TemplateResponse(request=request, name="dataset_new.html")

    @app.get("/jobs/new")
    def job_new(request: Request):
        return templates.TemplateResponse(request=request, name="job_new.html")

    @app.get("/predict")
    def predict_page(request: Request):
        return templates.TemplateResponse(request=request, name="predict.html")
```

with:

```python
    @app.get("/")
    def index(request: Request):
        return templates.TemplateResponse(request=request, name="workspace.html")

    @app.get("/datasets/new")
    def legacy_dataset_new() -> RedirectResponse:
        return RedirectResponse(url="/", status_code=307)

    @app.get("/jobs/new")
    def legacy_job_new() -> RedirectResponse:
        return RedirectResponse(url="/", status_code=307)

    @app.get("/predict")
    def legacy_predict() -> RedirectResponse:
        return RedirectResponse(url="/", status_code=307)
```

Add to imports near the existing FastAPI imports:

```python
from fastapi.responses import JSONResponse, RedirectResponse
```

(The existing `JSONResponse` import stays — just add `RedirectResponse` to the same line.)

- [ ] **Step 8.7: Delete the four obsolete templates**

```bash
rm projects/fine-tuning-platform/app/templates/index.html
rm projects/fine-tuning-platform/app/templates/dataset_new.html
rm projects/fine-tuning-platform/app/templates/job_new.html
rm projects/fine-tuning-platform/app/templates/predict.html
```

- [ ] **Step 8.8: Run page tests, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_pages.py -v
```

Expected: 5 passed.

- [ ] **Step 8.9: Run the full suite to catch regressions**

```bash
cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green. Existing dataset / jobs / artifact / inference tests still pass.

- [ ] **Step 8.10: Commit**

```bash
git add projects/fine-tuning-platform/app/templates/ projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/tests/api/test_pages.py
git commit -m "feat(ui): single-page workspace scaffold + legacy route redirects"
```

---

## Phase 3: Workspace components

### Task 9: Jobs panel — table, status pills, polling

Render the Jobs list in a real table with status pills. Poll `/api/jobs` every 5 s; pause when the tab is hidden. Each row exposes a "▶ Predict with this" affordance that pre-selects the job's adapter artifact in the Predict picker (wired via an event the Predict tasks will subscribe to).

**Files:**
- Modify: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/static/workspace.css`
- Modify: `projects/fine-tuning-platform/app/static/workspace.js`
- Test: `projects/fine-tuning-platform/tests/api/test_workspace_jobs_render.py`

- [ ] **Step 9.1: Write failing rendering test**

Create `projects/fine-tuning-platform/tests/api/test_workspace_jobs_render.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_includes_jobs_table_skeleton(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="jobs"' in text
    assert 'data-jobs-table' in text
    # Alpine binding placeholders that the JS reads
    assert 'x-for="job in jobs"' in text
```

- [ ] **Step 9.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_jobs_render.py -v
```

Expected: assertion failure on `data-jobs-table`.

- [ ] **Step 9.3: Replace the Jobs panel body in `workspace.html`**

In `projects/fine-tuning-platform/app/templates/workspace.html`, replace this block:

```html
    <section class="panel" data-section="jobs">
      <header class="panel__header">
        <span>Jobs</span>
        <span class="topbar__status" x-text="jobs.length + ' total'"></span>
      </header>
      <div class="panel__body">
        <p class="topbar__status">Jobs panel — populated in Task 9.</p>
      </div>
    </section>
```

with:

```html
    <section class="panel" data-section="jobs">
      <header class="panel__header">
        <span>Jobs</span>
        <span class="topbar__status" x-text="jobs.length + ' total'"></span>
      </header>
      <div class="panel__body">
        <table class="jobs-table" data-jobs-table>
          <thead>
            <tr><th>Job</th><th>Dataset</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            <template x-for="job in jobs" :key="job.job_id">
              <tr>
                <td class="mono" x-text="job.job_id"></td>
                <td class="mono" x-text="job.dataset_id"></td>
                <td><span class="pill" :class="'pill--' + job.status" x-text="job.status"></span></td>
                <td>
                  <button class="btn btn--ghost btn--small" @click="openPredictForJob(job)">▶ Predict</button>
                </td>
              </tr>
            </template>
            <template x-if="jobs.length === 0">
              <tr><td colspan="4" class="topbar__status">No jobs yet — create one from the right rail.</td></tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
```

- [ ] **Step 9.4: Append jobs-table styles to `workspace.css`**

Append to `projects/fine-tuning-platform/app/static/workspace.css`:

```css
.jobs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.jobs-table th,
.jobs-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  vertical-align: middle;
}
.jobs-table th {
  font-weight: 500;
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.jobs-table tbody tr:last-child td { border-bottom: 0; }
.jobs-table .mono { font-size: 12px; }
```

- [ ] **Step 9.5: Add polling and event hook to `workspace.js`**

Replace the contents of `projects/fine-tuning-platform/app/static/workspace.js` with:

```javascript
function workspace() {
  return {
    jobs: [],
    datasets: [],
    artifacts: [],
    baseModels: [],
    predictExpanded: false,
    _pollHandle: null,

    async bootstrap() {
      await Promise.all([this.refreshJobs(), this.refreshDatasets(), this.refreshArtifacts(), this.refreshBaseModels()]);
      this._startPolling();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this._stopPolling();
        } else {
          this.refreshJobs();
          this._startPolling();
        }
      });
    },
    _startPolling() {
      if (this._pollHandle !== null) return;
      this._pollHandle = window.setInterval(() => this.refreshJobs(), 5000);
    },
    _stopPolling() {
      if (this._pollHandle === null) return;
      window.clearInterval(this._pollHandle);
      this._pollHandle = null;
    },

    async refreshJobs() {
      const response = await fetch('/api/jobs');
      const body = await response.json();
      this.jobs = body.jobs ?? [];
    },
    async refreshDatasets() {
      const response = await fetch('/api/datasets');
      const body = await response.json();
      this.datasets = body.datasets ?? [];
    },
    async refreshArtifacts() {
      const response = await fetch('/api/artifacts');
      const body = await response.json();
      this.artifacts = body.artifacts ?? [];
    },
    async refreshBaseModels() {
      const response = await fetch('/api/models/base');
      const body = await response.json();
      this.baseModels = body.models ?? [];
    },
    runningCount() {
      return this.jobs.filter(job => job.status === 'running').length;
    },
    openPredictForJob(job) {
      this.predictExpanded = true;
      document.dispatchEvent(new CustomEvent('predict:select-job', { detail: { jobId: job.job_id } }));
    },
  };
}
```

- [ ] **Step 9.6: Run rendering test + full suite, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_jobs_render.py -v && cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green.

- [ ] **Step 9.7: Manual visual check**

In a separate shell, run the dev server:

```bash
cd projects/fine-tuning-platform && uv run uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000`. Confirm: topbar visible, Jobs panel renders an empty table with the "No jobs yet" message, no console errors. Stop the server (`Ctrl+C`).

- [ ] **Step 9.8: Commit**

```bash
git add projects/fine-tuning-platform/app/templates/workspace.html projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/tests/api/test_workspace_jobs_render.py
git commit -m "feat(ui): jobs panel with status pills and 5s polling"
```

---

### Task 10: Upload Dataset card

A drop-zone-style card that submits to `POST /api/datasets`. On success, refreshes the dataset list (so the New Job dropdown picks it up) and shows the new dataset_id inline. On validation errors, lists the row-level issues from the API response.

**Files:**
- Modify: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/static/workspace.css`
- Modify: `projects/fine-tuning-platform/app/static/workspace.js`
- Test: `projects/fine-tuning-platform/tests/api/test_workspace_upload_render.py`

- [ ] **Step 10.1: Write failing rendering test**

Create `projects/fine-tuning-platform/tests/api/test_workspace_upload_render.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_includes_upload_form(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="upload"' in text
    assert 'name="training_dataset"' in text
    assert 'accept=".jsonl"' in text
```

- [ ] **Step 10.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_upload_render.py -v
```

Expected: assertion failure on `name="training_dataset"`.

- [ ] **Step 10.3: Replace the Upload card body in `workspace.html`**

Replace this block:

```html
      <section class="panel" data-section="upload">
        <header class="panel__header"><span>Upload Dataset</span></header>
        <div class="panel__body">
          <p class="topbar__status">Upload — populated in Task 10.</p>
        </div>
      </section>
```

with:

```html
      <section class="panel" data-section="upload" x-data="upload()">
        <header class="panel__header"><span>Upload Dataset</span></header>
        <div class="panel__body">
          <form @submit.prevent="submit($event)">
            <label class="dropzone">
              <input type="file" name="training_dataset" accept=".jsonl" @change="file = $event.target.files[0]" required>
              <span x-text="file ? file.name : 'Drop .jsonl or click to choose'"></span>
            </label>
            <button class="btn" type="submit" :disabled="busy" x-text="busy ? 'Uploading…' : 'Upload'"></button>
          </form>
          <p class="upload-result" x-show="lastUpload" x-text="lastUpload"></p>
          <ul class="upload-issues" x-show="issues.length">
            <template x-for="issue in issues" :key="issue.row_number">
              <li><span class="mono" x-text="'row ' + issue.row_number"></span>: <span x-text="issue.message"></span></li>
            </template>
          </ul>
        </div>
      </section>
```

- [ ] **Step 10.4: Append upload styles to `workspace.css`**

Append to `projects/fine-tuning-platform/app/static/workspace.css`:

```css
.dropzone {
  display: block;
  border: 1.5px dashed var(--border);
  border-radius: var(--r-md);
  padding: var(--space-4);
  text-align: center;
  color: var(--text-muted);
  background: var(--bg);
  cursor: pointer;
  margin-bottom: var(--space-3);
}
.dropzone input[type="file"] { display: none; }
.upload-result {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--green-bg);
  color: var(--green-fg);
  border-radius: var(--r-sm);
  font-size: 12px;
}
.upload-issues {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--red-bg);
  color: var(--red-fg);
  border-radius: var(--r-sm);
  list-style: none;
  font-size: 12px;
}
.upload-issues li { padding: 2px 0; }
```

- [ ] **Step 10.5: Add `upload()` Alpine component to `workspace.js`**

Append to `projects/fine-tuning-platform/app/static/workspace.js`:

```javascript
function upload() {
  return {
    file: null,
    busy: false,
    lastUpload: '',
    issues: [],
    async submit(event) {
      if (!this.file) return;
      this.busy = true;
      this.issues = [];
      this.lastUpload = '';
      const formData = new FormData();
      formData.append('training_dataset', this.file);
      try {
        const response = await fetch('/api/datasets', { method: 'POST', body: formData });
        const body = await response.json();
        if (response.ok) {
          this.lastUpload = `Uploaded ${body.dataset_id} (${body.row_count} rows)`;
          this.file = null;
          event.target.reset();
          document.dispatchEvent(new CustomEvent('datasets:changed'));
        } else {
          this.issues = body.issues ?? [{ row_number: 0, message: 'Upload failed' }];
        }
      } catch (err) {
        this.issues = [{ row_number: 0, message: String(err) }];
      } finally {
        this.busy = false;
      }
    },
  };
}
```

Also wire the `datasets:changed` listener inside the workspace component's `bootstrap()`. Replace the existing `bootstrap()` method with:

```javascript
    async bootstrap() {
      await Promise.all([this.refreshJobs(), this.refreshDatasets(), this.refreshArtifacts(), this.refreshBaseModels()]);
      this._startPolling();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this._stopPolling();
        } else {
          this.refreshJobs();
          this._startPolling();
        }
      });
      document.addEventListener('datasets:changed', () => this.refreshDatasets());
      document.addEventListener('artifacts:changed', () => this.refreshArtifacts());
    },
```

- [ ] **Step 10.6: Run rendering test + full suite, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_upload_render.py -v && cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green.

- [ ] **Step 10.7: Manual smoke test**

Start the dev server, open the page, drop a small JSONL file (e.g., `{"text":"hi","intent":"greeting"}\n`). Confirm: success banner shows, no console errors, drop zone resets. Stop the server.

- [ ] **Step 10.8: Commit**

```bash
git add projects/fine-tuning-platform/app/templates/workspace.html projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/tests/api/test_workspace_upload_render.py
git commit -m "feat(ui): upload dataset card with drop-zone and issue display"
```

---

### Task 11: New Job card with dropdowns

Two `<select>` elements: dataset (from `/api/datasets`) and base model (from `/api/models/base`). Submit posts to `POST /api/jobs`. On success, refreshes the jobs list and shows the new job_id.

**Files:**
- Modify: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/static/workspace.css`
- Modify: `projects/fine-tuning-platform/app/static/workspace.js`
- Test: `projects/fine-tuning-platform/tests/api/test_workspace_new_job_render.py`

- [ ] **Step 11.1: Write failing rendering test**

Create `projects/fine-tuning-platform/tests/api/test_workspace_new_job_render.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_new_job_form_uses_dropdowns(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="new-job"' in text
    assert 'x-model="datasetId"' in text
    assert 'x-model="modelPath"' in text
    assert 'x-for="dataset in datasets"' in text
    assert 'x-for="model in baseModels"' in text
```

- [ ] **Step 11.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_new_job_render.py -v
```

Expected: assertion failure on `x-model="datasetId"`.

- [ ] **Step 11.3: Replace the New Job card body in `workspace.html`**

Replace:

```html
      <section class="panel" data-section="new-job">
        <header class="panel__header"><span>New Job</span></header>
        <div class="panel__body">
          <p class="topbar__status">New Job — populated in Task 11.</p>
        </div>
      </section>
```

with:

```html
      <section class="panel" data-section="new-job" x-data="newJob()">
        <header class="panel__header"><span>New Job</span></header>
        <div class="panel__body">
          <form @submit.prevent="submit()">
            <label class="field">
              <span>Dataset</span>
              <select x-model="datasetId" required>
                <option value="" disabled>Select a dataset…</option>
                <template x-for="dataset in datasets" :key="dataset.dataset_id">
                  <option :value="dataset.dataset_id" x-text="dataset.dataset_id + ' — ' + dataset.row_count + ' rows'"></option>
                </template>
              </select>
            </label>
            <label class="field">
              <span>Base model</span>
              <select x-model="modelPath" required>
                <option value="" disabled>Select a base model…</option>
                <template x-for="model in baseModels" :key="model.path">
                  <option :value="model.path" x-text="model.name"></option>
                </template>
              </select>
            </label>
            <button class="btn" type="submit" :disabled="busy" x-text="busy ? 'Creating…' : '▶ Train'"></button>
          </form>
          <p class="upload-result" x-show="lastJob" x-text="lastJob"></p>
          <p class="upload-issues" x-show="error" x-text="error"></p>
        </div>
      </section>
```

Note the form references `datasets` and `baseModels` from the parent `workspace()` scope — Alpine `x-data` nesting provides access to outer scope.

- [ ] **Step 11.4: Append form-field styles to `workspace.css`**

Append:

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: var(--space-3);
}
.field > span {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
.field select,
.field input[type="text"],
.field textarea {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
}
.field textarea { resize: vertical; min-height: 80px; }
```

- [ ] **Step 11.5: Add `newJob()` Alpine component to `workspace.js`**

Append:

```javascript
function newJob() {
  return {
    datasetId: '',
    modelPath: '',
    busy: false,
    lastJob: '',
    error: '',
    async submit() {
      if (!this.datasetId || !this.modelPath) return;
      this.busy = true;
      this.error = '';
      this.lastJob = '';
      try {
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: this.datasetId, model_path: this.modelPath }),
        });
        const body = await response.json();
        if (response.ok) {
          this.lastJob = `Created ${body.job_id} (${body.status})`;
          document.dispatchEvent(new CustomEvent('jobs:changed'));
        } else {
          this.error = body.detail ?? 'Failed to create job';
        }
      } catch (err) {
        this.error = String(err);
      } finally {
        this.busy = false;
      }
    },
  };
}
```

Add a `jobs:changed` listener to the workspace `bootstrap()` (alongside the existing listeners):

```javascript
      document.addEventListener('jobs:changed', () => this.refreshJobs());
```

- [ ] **Step 11.6: Run rendering test + full suite, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_new_job_render.py -v && cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green.

- [ ] **Step 11.7: Manual smoke test**

Start the dev server. Upload a dataset (from Task 10), then in the New Job card the dataset should appear in the dropdown. Submitting creates a job — confirm the Jobs table shows the new row within 5 s. Stop the server.

- [ ] **Step 11.8: Commit**

```bash
git add projects/fine-tuning-platform/app/templates/workspace.html projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/tests/api/test_workspace_new_job_render.py
git commit -m "feat(ui): new job card with dataset and base-model dropdowns"
```

---

### Task 12: Predict — compact card and expand toggle

The compact view in the right rail: prompt input + chip multi-select pulling from `/api/artifacts` and `/api/models/base` + Run button + 3-card result row. The "Expand" button (already wired in scaffold) shows the full Quick/Batch view in Tasks 13–14.

**Files:**
- Modify: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/static/workspace.css`
- Modify: `projects/fine-tuning-platform/app/static/workspace.js`
- Test: `projects/fine-tuning-platform/tests/api/test_workspace_predict_render.py`

- [ ] **Step 12.1: Write failing rendering test**

Create `projects/fine-tuning-platform/tests/api/test_workspace_predict_render.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_predict_card_has_chip_picker_and_run(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="predict"' in text
    assert 'x-data="predict()"' in text
    assert 'data-predict-prompt' in text
    assert 'data-predict-chip-picker' in text
```

- [ ] **Step 12.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_predict_render.py -v
```

Expected: assertion failure on `x-data="predict()"`.

- [ ] **Step 12.3: Replace the Predict compact card in `workspace.html`**

Replace:

```html
      <section class="panel" data-section="predict">
        <header class="panel__header">
          <span>Predict</span>
          <button class="btn btn--ghost btn--small" @click="predictExpanded = true">Expand</button>
        </header>
        <div class="panel__body">
          <p class="topbar__status">Predict (compact) — populated in Task 12.</p>
        </div>
      </section>
```

with:

```html
      <section class="panel" data-section="predict" x-data="predict()" x-init="bind()">
        <header class="panel__header">
          <span>Predict</span>
          <button class="btn btn--ghost btn--small" @click="predictExpanded = true">Expand</button>
        </header>
        <div class="panel__body">
          <form @submit.prevent="run()">
            <textarea class="field-input" data-predict-prompt x-model="prompt" rows="2" placeholder="Enter a prompt…"></textarea>
            <div class="chip-picker" data-predict-chip-picker>
              <template x-for="chip in selectedChips()" :key="chip.id">
                <span class="chip" :class="'chip--' + chip.kind" @click="toggleModel(chip.id)">
                  <span x-text="chip.label"></span>
                  <span aria-hidden="true">×</span>
                </span>
              </template>
              <select class="chip-add" @change="toggleModel($event.target.value); $event.target.value=''">
                <option value="" disabled selected>+ Add model</option>
                <template x-for="option in availableOptions()" :key="option.id">
                  <option :value="option.id" x-text="option.label"></option>
                </template>
              </select>
            </div>
            <button class="btn" type="submit" :disabled="busy || !canRun()" x-text="busy ? 'Running…' : '▶ Run'"></button>
          </form>
          <div class="predict-results" x-show="results.length">
            <template x-for="result in results.slice(0, 3)" :key="result.model_id">
              <div class="result-card" :class="{'result-card--minority': isMinority(result)}">
                <div class="result-card__head" x-text="shortLabel(result.model_id)"></div>
                <div class="result-card__intent" x-text="result.intent ?? '—'"></div>
                <div class="result-card__meta" x-text="(result.latency_ms ?? '—') + ' ms'"></div>
                <p class="result-card__error" x-show="result.error" x-text="result.error"></p>
              </div>
            </template>
          </div>
        </div>
      </section>
```

- [ ] **Step 12.4: Append predict styles to `workspace.css`**

Append:

```css
.field-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  margin-bottom: var(--space-2);
  resize: vertical;
}
.chip-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: var(--space-3);
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}
.chip--base { background: #dbeafe; color: #1e40af; }
.chip--adapter, .chip--merged, .chip--quantized { background: var(--green-bg); color: var(--green-fg); }
.chip-add {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  padding: 2px 6px;
  font-size: 11px;
}
.predict-results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.result-card {
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
  padding: var(--space-2) var(--space-3);
}
.result-card--minority { border-color: #fca5a5; background: #fef2f2; }
.result-card__head { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
.result-card__intent { font-weight: 600; }
.result-card__meta { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.result-card__error { color: var(--red-fg); font-size: 11px; margin: 4px 0 0; }
```

- [ ] **Step 12.5: Add `predict()` Alpine component to `workspace.js`**

Append to `projects/fine-tuning-platform/app/static/workspace.js`:

```javascript
function predict() {
  return {
    prompt: '',
    selected: [],
    results: [],
    busy: false,

    bind() {
      document.addEventListener('predict:select-job', (event) => {
        const candidate = (this._allOptions() ?? []).find(option => option.kind === 'adapter' && option.id.startsWith(event.detail.jobId + ':'));
        if (candidate && !this.selected.includes(candidate.id)) {
          this.selected = [...this.selected, candidate.id];
        }
      });
    },

    _allOptions() {
      const base = (this.$root.__x?.$data?.baseModels ?? []).map(model => ({ id: model.path, label: model.name, kind: 'base' }));
      const arts = (this.$root.__x?.$data?.artifacts ?? []).map(artifact => ({ id: artifact.artifact_id, label: artifact.label, kind: artifact.kind }));
      return [...base, ...arts];
    },
    selectedChips() {
      const lookup = new Map(this._allOptions().map(option => [option.id, option]));
      return this.selected.map(id => lookup.get(id)).filter(Boolean);
    },
    availableOptions() {
      const taken = new Set(this.selected);
      return this._allOptions().filter(option => !taken.has(option.id));
    },
    toggleModel(id) {
      if (!id) return;
      this.selected = this.selected.includes(id) ? this.selected.filter(value => value !== id) : [...this.selected, id];
    },
    canRun() { return this.prompt.trim().length > 0 && this.selected.length > 0; },

    async run() {
      if (!this.canRun()) return;
      this.busy = true;
      try {
        const lookup = new Map(this._allOptions().map(option => [option.id, option]));
        const specs = this.selected.map(id => {
          const option = lookup.get(id);
          return { kind: option?.kind === 'base' ? 'base' : 'artifact', ref: id };
        });
        const response = await fetch('/api/predict-intent/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: this.prompt, model_specs: specs }),
        });
        const body = await response.json();
        this.results = body.results ?? [];
        this._summary = body.summary ?? { agreement: 0, majority: null };
      } finally {
        this.busy = false;
      }
    },
    isMinority(result) {
      return this._summary?.majority && result.intent && result.intent !== this._summary.majority;
    },
    shortLabel(modelId) {
      if (modelId.includes(':')) return modelId.split(':')[0].slice(4, 12) + ' · ' + modelId.split(':')[1];
      return modelId.split('/').slice(-1)[0];
    },
  };
}
```

Note: `this.$root.__x` is Alpine's internal — for clean access, the workspace component already exposes `baseModels` / `artifacts` on `document.body`'s root scope. If `this.$root.__x` does not work in your Alpine version, replace `_allOptions()` with `Alpine.$data(this.$root)` access — both are equivalent in Alpine v3.

- [ ] **Step 12.6: Run rendering test + full suite, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_predict_render.py -v && cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green.

- [ ] **Step 12.7: Manual smoke test**

Start the dev server. The app's compact Predict card requires `infer_raw` to be wired; for visual smoke testing, verify only that the chip picker, prompt textarea, and Run button render correctly and that pressing Run with no models selected leaves the button disabled. Live inference requires running SWIFT — out of scope for this smoke test.

- [ ] **Step 12.8: Commit**

```bash
git add projects/fine-tuning-platform/app/templates/workspace.html projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/tests/api/test_workspace_predict_render.py
git commit -m "feat(ui): predict compact card with chip picker and result row"
```

---

### Task 13: Predict expanded view — Quick tab

The full-screen Quick view: same picker but with raw-output toggle, history panel (localStorage, capped at 50 entries), and per-result minority highlighting. History clicks repopulate the prompt.

**Files:**
- Modify: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/static/workspace.css`
- Modify: `projects/fine-tuning-platform/app/static/workspace.js`
- Test: `projects/fine-tuning-platform/tests/api/test_workspace_predict_expanded_render.py`

- [ ] **Step 13.1: Write failing rendering test**

Create `projects/fine-tuning-platform/tests/api/test_workspace_predict_expanded_render.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_includes_predict_expanded_tabs(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="predict-expanded"' in text
    assert 'data-tab="quick"' in text
    assert 'data-tab="batch"' in text
    assert 'data-history-panel' in text
```

- [ ] **Step 13.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_predict_expanded_render.py -v
```

Expected: assertion failure on `data-tab="quick"`.

- [ ] **Step 13.3: Replace the Predict expanded section in `workspace.html`**

Replace:

```html
    <section class="panel" data-section="predict-expanded" x-show="predictExpanded">
      <header class="panel__header">
        <span>Predict — comparison</span>
        <button class="btn btn--ghost btn--small" @click="predictExpanded = false">Collapse</button>
      </header>
      <div class="panel__body">
        <p class="topbar__status">Predict expanded — populated in Tasks 13–14.</p>
      </div>
    </section>
```

with:

```html
    <section class="panel" data-section="predict-expanded" x-show="predictExpanded" x-data="predictExpanded()" x-init="bind()">
      <header class="panel__header">
        <span>Predict — comparison</span>
        <div>
          <button class="btn btn--ghost btn--small" :class="{'is-active': tab === 'quick'}" data-tab="quick" @click="tab='quick'">Quick</button>
          <button class="btn btn--ghost btn--small" :class="{'is-active': tab === 'batch'}" data-tab="batch" @click="tab='batch'">Batch</button>
          <button class="btn btn--ghost btn--small" @click="predictExpanded = false">Collapse</button>
        </div>
      </header>
      <div class="panel__body predict-expanded">
        <div class="predict-expanded__main" x-show="tab === 'quick'">
          <textarea class="field-input" x-model="prompt" rows="3" placeholder="Prompt — Cmd/Ctrl+Enter to run" @keydown.cmd.enter="run()" @keydown.ctrl.enter="run()"></textarea>
          <div class="chip-picker">
            <template x-for="chip in selectedChips()" :key="chip.id">
              <span class="chip" :class="'chip--' + chip.kind" @click="toggleModel(chip.id)">
                <span x-text="chip.label"></span>
                <span aria-hidden="true">×</span>
              </span>
            </template>
            <select class="chip-add" @change="toggleModel($event.target.value); $event.target.value=''">
              <option value="" disabled selected>+ Add model</option>
              <template x-for="option in availableOptions()" :key="option.id">
                <option :value="option.id" x-text="option.label"></option>
              </template>
            </select>
          </div>
          <button class="btn" :disabled="busy || !canRun()" @click="run()" x-text="busy ? 'Running…' : '▶ Run'"></button>
          <p class="predict-summary" x-show="results.length" x-text="summaryText()"></p>
          <div class="predict-results">
            <template x-for="result in results" :key="result.model_id">
              <div class="result-card" :class="{'result-card--minority': isMinority(result)}">
                <div class="result-card__head" x-text="shortLabel(result.model_id)"></div>
                <div class="result-card__intent" x-text="result.intent ?? '—'"></div>
                <div class="result-card__meta" x-text="(result.latency_ms ?? '—') + ' ms'"></div>
                <details x-show="result.raw"><summary>raw</summary><pre x-text="result.raw"></pre></details>
                <p class="result-card__error" x-show="result.error" x-text="result.error"></p>
              </div>
            </template>
          </div>
        </div>
        <aside class="predict-expanded__history" x-show="tab === 'quick'" data-history-panel>
          <h3 class="history-title">History</h3>
          <ul class="history-list">
            <template x-for="entry in history" :key="entry.id">
              <li @click="prompt = entry.prompt">
                <span class="mono history-list__prompt" x-text="entry.prompt"></span>
                <span class="history-list__meta" x-text="entry.summary"></span>
              </li>
            </template>
            <template x-if="history.length === 0">
              <li class="history-list__empty">No prior runs.</li>
            </template>
          </ul>
        </aside>
        <div class="predict-expanded__main" x-show="tab === 'batch'">
          <p class="topbar__status">Batch view — populated in Task 14.</p>
        </div>
      </div>
    </section>
```

- [ ] **Step 13.4: Append expanded-view styles to `workspace.css`**

Append:

```css
.predict-expanded {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: var(--space-4);
}
.predict-expanded__main { min-width: 0; }
.predict-expanded__history {
  border-left: 1px solid var(--border-soft);
  padding-left: var(--space-3);
}
.history-title { font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin: 0 0 var(--space-2); letter-spacing: 0.04em; }
.history-list { list-style: none; padding: 0; margin: 0; max-height: 60vh; overflow-y: auto; }
.history-list li {
  padding: var(--space-2);
  border-radius: var(--r-sm);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.history-list li:hover { background: var(--slate-bg); }
.history-list__prompt { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-list__meta { font-size: 11px; color: var(--text-muted); }
.history-list__empty { color: var(--text-muted); cursor: default; }
.history-list__empty:hover { background: transparent; }
.predict-summary {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  background: var(--slate-bg);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--slate-fg);
}
.btn--ghost.is-active { background: var(--slate-bg); }
@media (max-width: 1024px) {
  .predict-expanded { grid-template-columns: 1fr; }
  .predict-expanded__history { border-left: 0; padding-left: 0; border-top: 1px solid var(--border-soft); padding-top: var(--space-3); }
}
```

- [ ] **Step 13.5: Add `predictExpanded()` Alpine component to `workspace.js`**

Append:

```javascript
const HISTORY_KEY = 'workspace.predict.history.v1';
const HISTORY_CAP = 50;

function predictExpanded() {
  return {
    tab: 'quick',
    prompt: '',
    selected: [],
    results: [],
    busy: false,
    history: [],
    _summary: { agreement: 0, majority: null },

    bind() {
      this.history = this._loadHistory();
      document.addEventListener('predict:select-job', (event) => {
        const candidate = (this._allOptions() ?? []).find(option => option.kind === 'adapter' && option.id.startsWith(event.detail.jobId + ':'));
        if (candidate && !this.selected.includes(candidate.id)) {
          this.selected = [...this.selected, candidate.id];
        }
      });
    },

    _allOptions() {
      const root = Alpine.$data(this.$root);
      const base = (root?.baseModels ?? []).map(model => ({ id: model.path, label: model.name, kind: 'base' }));
      const arts = (root?.artifacts ?? []).map(artifact => ({ id: artifact.artifact_id, label: artifact.label, kind: artifact.kind }));
      return [...base, ...arts];
    },
    selectedChips() {
      const lookup = new Map(this._allOptions().map(option => [option.id, option]));
      return this.selected.map(id => lookup.get(id)).filter(Boolean);
    },
    availableOptions() {
      const taken = new Set(this.selected);
      return this._allOptions().filter(option => !taken.has(option.id));
    },
    toggleModel(id) {
      if (!id) return;
      this.selected = this.selected.includes(id) ? this.selected.filter(value => value !== id) : [...this.selected, id];
    },
    canRun() { return this.prompt.trim().length > 0 && this.selected.length > 0; },

    async run() {
      if (!this.canRun()) return;
      this.busy = true;
      try {
        const lookup = new Map(this._allOptions().map(option => [option.id, option]));
        const specs = this.selected.map(id => {
          const option = lookup.get(id);
          return { kind: option?.kind === 'base' ? 'base' : 'artifact', ref: id };
        });
        const response = await fetch('/api/predict-intent/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: this.prompt, model_specs: specs }),
        });
        const body = await response.json();
        this.results = body.results ?? [];
        this._summary = body.summary ?? { agreement: 0, majority: null };
        this._pushHistory(this.prompt, this._summary);
      } finally {
        this.busy = false;
      }
    },
    isMinority(result) {
      return this._summary?.majority && result.intent && result.intent !== this._summary.majority;
    },
    summaryText() {
      const pct = Math.round((this._summary?.agreement ?? 0) * 100);
      const majority = this._summary?.majority ?? '—';
      return `Agreement ${pct}% · majority ${majority}`;
    },
    shortLabel(modelId) {
      if (modelId.includes(':')) return modelId.split(':')[0].slice(4, 12) + ' · ' + modelId.split(':')[1];
      return modelId.split('/').slice(-1)[0];
    },

    _loadHistory() {
      try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
    },
    _pushHistory(prompt, summary) {
      const entry = {
        id: Date.now() + ':' + Math.random().toString(36).slice(2, 8),
        prompt,
        summary: `${Math.round((summary.agreement ?? 0) * 100)}% · ${summary.majority ?? '—'}`,
      };
      this.history = [entry, ...this.history.filter(prior => prior.prompt !== prompt)].slice(0, HISTORY_CAP);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history)); } catch {}
    },
  };
}
```

- [ ] **Step 13.6: Run rendering test + full suite, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_predict_expanded_render.py -v && cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green.

- [ ] **Step 13.7: Manual smoke test**

Start the dev server. Click "Expand" on the Predict card. Confirm: tabs visible, history panel shows "No prior runs" initially, prompt textarea + chip picker render. Stop the server.

- [ ] **Step 13.8: Commit**

```bash
git add projects/fine-tuning-platform/app/templates/workspace.html projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/tests/api/test_workspace_predict_expanded_render.py
git commit -m "feat(ui): predict expanded quick view with history panel"
```

---

### Task 14: Predict expanded view — Batch tab

Multi-prompt matrix. Prompts come from a textarea (one per line) OR from a selected dataset's `eval.jsonl` (loaded from disk via a small helper endpoint that already exists indirectly — `train_path` and `eval_path` are returned by `/api/datasets`, but we need a way to read `eval.jsonl`'s contents). Add a `GET /api/datasets/{dataset_id}/eval` helper.

**Files:**
- Modify: `projects/fine-tuning-platform/app/main.py` (add `/api/datasets/{dataset_id}/eval`)
- Modify: `projects/fine-tuning-platform/app/templates/workspace.html`
- Modify: `projects/fine-tuning-platform/app/static/workspace.css`
- Modify: `projects/fine-tuning-platform/app/static/workspace.js`
- Test: `projects/fine-tuning-platform/tests/api/test_dataset_eval_api.py`
- Test: `projects/fine-tuning-platform/tests/api/test_workspace_predict_batch_render.py`

- [ ] **Step 14.1: Write failing tests for the eval-rows endpoint**

Create `projects/fine-tuning-platform/tests/api/test_dataset_eval_api.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_get_dataset_eval_returns_404_when_missing(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/datasets/dataset-aabbccddeeff/eval")
    assert response.status_code == 404


def test_get_dataset_eval_returns_rows_with_expected_intents(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text(
        '{"instruction":"i","input":"查天气","output":"{\\"intent\\":\\"weather_query\\",\\"confidence\\":1.0}"}\n'
        '{"instruction":"i","input":"订机票","output":"{\\"intent\\":\\"flight\\",\\"confidence\\":1.0}"}\n',
        encoding="utf-8",
    )

    response = TestClient(create_app(root=tmp_path)).get("/api/datasets/dataset-aabbccddeeff/eval")

    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) == 2
    assert rows[0] == {"text": "查天气", "expected_intent": "weather_query"}
    assert rows[1] == {"text": "订机票", "expected_intent": "flight"}


def test_get_dataset_eval_rejects_invalid_id_format(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/datasets/not-a-real/eval")
    assert response.status_code == 400
```

- [ ] **Step 14.2: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_dataset_eval_api.py -v
```

Expected: 404 (route absent).

- [ ] **Step 14.3: Add `GET /api/datasets/{dataset_id}/eval` handler in `app/main.py`**

Add this route inside `create_app`:

```python
    @app.get("/api/datasets/{dataset_id}/eval")
    def get_dataset_eval(dataset_id: str) -> dict[str, object]:
        if not _DATASET_ID_RE.match(dataset_id):
            raise HTTPException(status_code=400, detail="invalid dataset_id format")
        eval_path = app_root / "training_data" / dataset_id / "eval.jsonl"
        if not eval_path.exists():
            raise HTTPException(status_code=404, detail=f"dataset {dataset_id!r} eval split not found")
        rows: list[dict[str, str]] = []
        with eval_path.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                payload = json.loads(line)
                text = payload.get("input") or payload.get("instruction") or ""
                output_raw = payload.get("output", "")
                expected_intent = ""
                if isinstance(output_raw, str) and output_raw.startswith("{"):
                    try:
                        parsed = json.loads(output_raw)
                        expected_intent = parsed.get("intent", "") if isinstance(parsed, dict) else ""
                    except json.JSONDecodeError:
                        expected_intent = ""
                rows.append({"text": text, "expected_intent": expected_intent})
        return {"dataset_id": dataset_id, "rows": rows}
```

Add `import json` near the existing imports if not already present (it is — verify).

- [ ] **Step 14.4: Run dataset-eval test, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_dataset_eval_api.py -v
```

Expected: 3 passed.

- [ ] **Step 14.5: Write failing batch-render test**

Create `projects/fine-tuning-platform/tests/api/test_workspace_predict_batch_render.py`:

```python
from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_predict_batch_tab_includes_matrix(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-batch-prompts' in text
    assert 'data-batch-matrix' in text
    assert 'data-batch-load-eval' in text
```

- [ ] **Step 14.6: Run test, confirm fail**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_predict_batch_render.py -v
```

Expected: assertion failure on `data-batch-matrix`.

- [ ] **Step 14.7: Replace the Batch placeholder in `workspace.html`**

Replace:

```html
        <div class="predict-expanded__main" x-show="tab === 'batch'">
          <p class="topbar__status">Batch view — populated in Task 14.</p>
        </div>
```

with:

```html
        <div class="predict-expanded__main" x-show="tab === 'batch'">
          <div class="batch-controls">
            <textarea class="field-input" data-batch-prompts x-model="batchPromptsRaw" rows="4" placeholder="One prompt per line — or load from a dataset"></textarea>
            <div class="batch-actions">
              <select x-model="batchDatasetId" class="batch-dataset-select">
                <option value="">Or load eval set…</option>
                <template x-for="dataset in datasets" :key="dataset.dataset_id">
                  <option :value="dataset.dataset_id" x-text="dataset.dataset_id + ' — ' + dataset.row_count + ' rows'"></option>
                </template>
              </select>
              <button class="btn btn--ghost btn--small" data-batch-load-eval @click="loadEvalSet()">Load</button>
            </div>
            <div class="chip-picker">
              <template x-for="chip in selectedChips()" :key="chip.id">
                <span class="chip" :class="'chip--' + chip.kind" @click="toggleModel(chip.id)">
                  <span x-text="chip.label"></span>
                  <span aria-hidden="true">×</span>
                </span>
              </template>
              <select class="chip-add" @change="toggleModel($event.target.value); $event.target.value=''">
                <option value="" disabled selected>+ Add model</option>
                <template x-for="option in availableOptions()" :key="option.id">
                  <option :value="option.id" x-text="option.label"></option>
                </template>
              </select>
            </div>
            <button class="btn" :disabled="batchBusy || !canRunBatch()" @click="runBatch()" x-text="batchBusy ? 'Running ' + batchProgress + '/' + batchTotal : '▶ Run batch'"></button>
            <button class="btn btn--ghost btn--small" :disabled="!batchRows.length" @click="exportJson()">Export JSON</button>
          </div>
          <table class="batch-matrix" data-batch-matrix x-show="batchRows.length">
            <thead>
              <tr>
                <th>Prompt</th>
                <th x-show="anyExpected()">Expected</th>
                <template x-for="chip in selectedChips()" :key="chip.id">
                  <th x-text="chip.label"></th>
                </template>
              </tr>
            </thead>
            <tbody>
              <template x-for="row in batchRows" :key="row.id">
                <tr :class="{'batch-matrix__row--mixed': rowHasDisagreement(row)}">
                  <td class="mono" x-text="row.text"></td>
                  <td x-show="anyExpected()" x-text="row.expected_intent ?? ''"></td>
                  <template x-for="chip in selectedChips()" :key="chip.id">
                    <td :class="cellClass(row, chip.id)">
                      <span x-text="cellIntent(row, chip.id)"></span>
                      <small class="batch-matrix__lat" x-text="cellLatency(row, chip.id)"></small>
                    </td>
                  </template>
                </tr>
              </template>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" class="batch-matrix__foot">Aggregate agreement</td>
                <template x-for="chip in selectedChips()" :key="chip.id">
                  <td x-text="modelAccuracy(chip.id)"></td>
                </template>
              </tr>
            </tfoot>
          </table>
        </div>
```

- [ ] **Step 14.8: Append batch styles to `workspace.css`**

Append:

```css
.batch-controls { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-3); }
.batch-actions { display: flex; gap: var(--space-2); align-items: center; }
.batch-dataset-select { flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); color: var(--text); }
.batch-matrix { width: 100%; border-collapse: collapse; font-size: 12px; }
.batch-matrix th, .batch-matrix td {
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--border-soft);
  vertical-align: top;
}
.batch-matrix th { background: var(--bg); font-weight: 500; color: var(--text-muted); }
.batch-matrix__row--mixed td { background: #fffbeb; }
.batch-matrix__match { color: var(--green-fg); }
.batch-matrix__miss { color: var(--red-fg); }
.batch-matrix__lat { display: block; font-size: 10px; color: var(--text-muted); }
.batch-matrix__foot { color: var(--text-muted); font-weight: 500; }
```

- [ ] **Step 14.9: Add batch state + helpers to `predictExpanded()` in `workspace.js`**

Inside the `predictExpanded()` return object (alongside the existing properties), add these state fields and methods:

Find this section in `predictExpanded()`:

```javascript
    history: [],
    _summary: { agreement: 0, majority: null },
```

Insert immediately after:

```javascript
    batchPromptsRaw: '',
    batchDatasetId: '',
    batchRows: [],
    batchBusy: false,
    batchProgress: 0,
    batchTotal: 0,
```

And append these methods inside the same return object (before the closing `};`):

```javascript
    canRunBatch() { return this._batchPrompts().length > 0 && this.selected.length > 0; },
    _batchPrompts() {
      return this.batchPromptsRaw.split('\n').map(line => line.trim()).filter(Boolean);
    },
    async loadEvalSet() {
      if (!this.batchDatasetId) return;
      const response = await fetch(`/api/datasets/${this.batchDatasetId}/eval`);
      if (!response.ok) return;
      const body = await response.json();
      this.batchRows = (body.rows ?? []).map((row, index) => ({
        id: 'eval:' + index,
        text: row.text,
        expected_intent: row.expected_intent || null,
        cells: {},
      }));
      this.batchPromptsRaw = (body.rows ?? []).map(row => row.text).join('\n');
    },
    async runBatch() {
      if (!this.canRunBatch()) return;
      const prompts = this._batchPrompts();
      const lookup = new Map(this._allOptions().map(option => [option.id, option]));
      const specs = this.selected.map(id => {
        const option = lookup.get(id);
        return { kind: option?.kind === 'base' ? 'base' : 'artifact', ref: id };
      });
      this.batchBusy = true;
      this.batchProgress = 0;
      this.batchTotal = prompts.length;
      const rows = prompts.map((text, index) => {
        const existing = this.batchRows.find(row => row.text === text);
        return {
          id: existing?.id ?? 'p:' + index,
          text,
          expected_intent: existing?.expected_intent ?? null,
          cells: {},
        };
      });
      try {
        for (const row of rows) {
          const response = await fetch('/api/predict-intent/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: row.text, model_specs: specs }),
          });
          const body = await response.json();
          row.cells = Object.fromEntries((body.results ?? []).map(result => [result.model_id, result]));
          this.batchProgress += 1;
          this.batchRows = [...rows];
        }
      } finally {
        this.batchBusy = false;
      }
    },
    anyExpected() { return this.batchRows.some(row => row.expected_intent); },
    rowHasDisagreement(row) {
      const intents = Object.values(row.cells).map(cell => cell.intent).filter(Boolean);
      return intents.length > 1 && new Set(intents).size > 1;
    },
    cellIntent(row, chipId) { return row.cells[chipId]?.intent ?? row.cells[chipId]?.error ?? '—'; },
    cellLatency(row, chipId) { return row.cells[chipId]?.latency_ms ? row.cells[chipId].latency_ms + ' ms' : ''; },
    cellClass(row, chipId) {
      const cell = row.cells[chipId];
      if (!cell || !row.expected_intent || !cell.intent) return '';
      return cell.intent === row.expected_intent ? 'batch-matrix__match' : 'batch-matrix__miss';
    },
    modelAccuracy(chipId) {
      const evaluable = this.batchRows.filter(row => row.expected_intent);
      if (evaluable.length === 0) return '';
      const hits = evaluable.filter(row => row.cells[chipId]?.intent === row.expected_intent).length;
      return Math.round((hits / evaluable.length) * 100) + '%';
    },
    exportJson() {
      const blob = new Blob([JSON.stringify(this.batchRows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'predict-compare-batch.json';
      link.click();
      URL.revokeObjectURL(url);
    },
```

- [ ] **Step 14.10: Run batch-render test + full suite, confirm pass**

```bash
cd projects/fine-tuning-platform && uv run pytest tests/api/test_workspace_predict_batch_render.py tests/api/test_dataset_eval_api.py -v && cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: all green.

- [ ] **Step 14.11: Manual smoke test**

Start the dev server. Open Predict expanded → Batch tab. Confirm: textarea, dataset dropdown, model picker, Run/Export buttons render. Type two prompts on separate lines, select one base model (so the picker isn't empty). The Run button stays disabled until you can actually compare (which requires `infer_raw` configured — out of scope for visual smoke). Stop the server.

- [ ] **Step 14.12: Commit**

```bash
git add projects/fine-tuning-platform/app/main.py projects/fine-tuning-platform/app/templates/workspace.html projects/fine-tuning-platform/app/static/workspace.css projects/fine-tuning-platform/app/static/workspace.js projects/fine-tuning-platform/tests/api/test_dataset_eval_api.py projects/fine-tuning-platform/tests/api/test_workspace_predict_batch_render.py
git commit -m "feat(ui): predict batch matrix with eval-set loading and accuracy"
```

---

### Task 15: Final polish — full test pass + docs touch-up

**Files:**
- Modify: `projects/fine-tuning-platform/CHANGELOG.md` (if it exists at project root) or `CHANGELOG.md` (worktree root)
- Optional: `projects/fine-tuning-platform/README.md`

- [ ] **Step 15.1: Run the entire test suite**

```bash
cd projects/fine-tuning-platform && uv run pytest -v
```

Expected: every test passes.

- [ ] **Step 15.2: Run the dev server and walk through the golden path**

```bash
cd projects/fine-tuning-platform && uv run uvicorn app.main:app --reload --port 8000
```

Walk through:
1. Open `http://localhost:8000`. Confirm topbar, jobs panel, three right-rail cards visible.
2. Upload a small JSONL file. Confirm success message + the dataset appears in the New Job dropdown.
3. Create a new job (you can keep the model_path as the default if `models/Qwen2.5-7B-Instruct` exists, or pick whatever is listed). Confirm the job appears in the Jobs table within 5 s.
4. Click "▶ Predict" on the job row. Confirm the Predict expanded view opens with that job's adapter chip pre-selected (the chip will only appear if the job's `output/<job_id>` directory exists; for jobs that haven't been started, this is expected to be empty).
5. Click "Collapse". Confirm return to compact layout.
6. Click "Expand" → "Batch". Confirm dataset dropdown is populated, eval-load works.
7. Resize the window narrower than 1024 px. Confirm the layout stacks to a single column.
8. Stop the server.

- [ ] **Step 15.3: Update the project CHANGELOG**

Read `projects/fine-tuning-platform/README.md` and `CHANGELOG.md` (worktree root). Add an entry to whichever changelog already documents this project — keep the format consistent with prior entries.

Example entry to append to `CHANGELOG.md` at the worktree root (use this format if the file uses dated headings; otherwise mirror whatever style is already there):

```markdown
## 2026-04-27 — Workspace UI redesign

- Replaced four bare templates with a single Two-Pane Workspace dashboard.
- Added `/api/datasets`, `/api/artifacts`, `/api/models/base`, `/api/predict-intent/compare`, `/api/datasets/{id}/eval`.
- Multi-model side-by-side prediction comparison with Quick + Batch tabs.
- Live job-status polling at 5 s, paused on hidden tab.
```

- [ ] **Step 15.4: Commit polish**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for workspace UI redesign"
```

(If the file you modified is `projects/fine-tuning-platform/README.md`, adjust the staged path accordingly.)

---

## Spec coverage cross-check

| Spec section | Implemented in |
|---|---|
| `GET /api/datasets` | Task 3 |
| `GET /api/artifacts` | Tasks 1–2 |
| `GET /api/models/base` | Task 4 |
| `POST /api/predict-intent/compare` | Tasks 5–6 |
| Legacy routes redirect | Task 8 |
| Static dir + CSS tokens | Task 7 |
| Two-Pane Workspace layout | Task 8 (scaffold), Tasks 9–14 (components) |
| Modern Workspace visual style | Task 7 (tokens), refined incrementally Tasks 9–14 |
| Dataset selector dropdown | Task 11 |
| Base-model selector | Task 11 |
| Artifact chip multi-picker | Tasks 12–14 |
| Predict Quick tab + history | Task 13 |
| Predict Batch tab + matrix + export | Task 14 |
| Live jobs polling (5 s, pause on hidden tab) | Task 9 |
| Test coverage (pure fns + API) | Tasks 1, 3, 4, 5, 6, 8, 9–14 |
| Click-to-expand job-row drawer (artifact paths, command, log tail) | **Deferred** — call it out as a follow-up task; the existing `GET /api/jobs/{id}` and `GET /api/jobs/{id}/logs` endpoints already supply the data, so this is a UI-only extension to Task 9 |
| Out-of-scope items | Not implemented (auth, deletion, log streaming as live SSE, metrics charts) |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-workspace-ui-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
