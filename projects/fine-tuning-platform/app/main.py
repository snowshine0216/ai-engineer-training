from collections.abc import Callable
from dataclasses import asdict
import asyncio
import re
import time
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.domain.artifacts import scan_artifacts
from app.domain.base_models import scan_base_models
from app.domain.datasets import parse_jsonl
from app.domain.datasets_listing import scan_datasets
from app.domain.compare_aggregation import aggregate_compare_results
from app.domain.jobs import JobStatus, transition
from app.domain.metrics import compute_intent_metrics, parse_intent_response
from app.domain.swift_commands import (
    AppleSiliconTrainingConfig,
    build_merge_command,
    build_quantize_command,
    build_train_command,
)
from app.services.inference import parse_predict_intent_output
from app.services.job_repository import JobRecord, JsonJobRepository
from app.services.storage import AppPaths, save_dataset_artifacts


class CreateJobRequest(BaseModel):
    dataset_id: str
    model_path: str


class MergeRequest(BaseModel):
    adapter_dir: str


class QuantizeRequest(BaseModel):
    merged_model_dir: str
    quant_bits: int
    quant_method: str


class EvalRequest(BaseModel):
    labels: list[str]
    responses: list[str]


class UpdateStatusRequest(BaseModel):
    status: str


class ModelSpec(BaseModel):
    kind: str
    ref: str


class PredictIntentCompareRequest(BaseModel):
    text: str
    model_specs: list[ModelSpec]


class PredictIntentRequest(BaseModel):
    text: str
    model_artifact_id: str = "default"


def create_app(root: Path | None = None, infer_raw: Callable[[str, str], str] | None = None) -> FastAPI:
    app_root = root or Path(".")
    app = FastAPI(title="Fine-Tuning Platform", version="0.1.0")
    app.mount("/static", StaticFiles(directory=Path(__file__).parent / "static"), name="static")
    templates = Jinja2Templates(directory=Path(__file__).parent / "templates")

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

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "fine-tuning-platform"}

    @app.get("/api/artifacts")
    def list_artifacts() -> dict[str, object]:
        artifacts = scan_artifacts(
            jobs_dir=app_root / "jobs",
            output_root=app_root / "output",
            merged_root=app_root / "merged_models",
            quantized_root=app_root / "quantized_models",
        )
        return {"artifacts": [artifact.__dict__ for artifact in artifacts]}

    @app.get("/api/datasets")
    def list_datasets() -> dict[str, object]:
        summaries = scan_datasets(app_root / "training_data")
        return {"datasets": [summary.__dict__ for summary in summaries]}

    @app.get("/api/models/base")
    def list_base_models() -> dict[str, object]:
        models = scan_base_models(app_root / "models")
        return {"models": [model.__dict__ for model in models]}

    _DATASET_ID_RE = re.compile(r"^dataset-[a-f0-9]{12}$")
    _JOB_ID_RE = re.compile(r"^job-[a-f0-9]{12}$")
    _QUANT_BITS_ALLOWED = {4, 8}
    _QUANT_METHOD_ALLOWED = {"bnb", "awq", "gptq", "auto_round"}

    @app.post("/api/datasets", response_model=None)
    async def upload_dataset(training_dataset: UploadFile = File(...)) -> dict[str, object] | JSONResponse:
        try:
            raw = (await training_dataset.read()).decode("utf-8")
        except UnicodeDecodeError:
            return JSONResponse(status_code=400, content={"issues": [{"row_number": 0, "message": "file must be UTF-8 encoded"}]})
        parsed = parse_jsonl(raw)
        if parsed.issues:
            return JSONResponse(
                status_code=400,
                content={"issues": [{"row_number": issue.row_number, "message": issue.message} for issue in parsed.issues]},
            )
        dataset_id = f"dataset-{uuid4().hex[:12]}"
        artifact = await asyncio.to_thread(
            save_dataset_artifacts, AppPaths(app_root), dataset_id=dataset_id, raw=raw, rows=parsed.rows, eval_ratio=0.2, seed=42
        )
        return {
            "dataset_id": artifact.dataset_id,
            "row_count": len(parsed.rows),
            "raw_path": artifact.raw_path.as_posix(),
            "train_path": artifact.train_path.as_posix(),
            "eval_path": artifact.eval_path.as_posix(),
        }

    @app.post("/api/jobs")
    def create_job(request: CreateJobRequest) -> dict[str, object]:
        if not _DATASET_ID_RE.match(request.dataset_id):
            raise HTTPException(status_code=400, detail="invalid dataset_id format")
        job_id = f"job-{uuid4().hex[:12]}"
        dataset_dir = app_root / "training_data" / request.dataset_id
        command = build_train_command(
            AppleSiliconTrainingConfig(
                model_path=Path(request.model_path),
                train_dataset=dataset_dir / "train.jsonl",
                eval_dataset=dataset_dir / "eval.jsonl",
                output_dir=app_root / "output" / job_id,
            )
        )
        record = JobRecord(
            job_id=job_id,
            status=JobStatus.CREATED,
            dataset_id=request.dataset_id,
            command=command.argv,
            artifact_paths={"output_dir": (app_root / "output" / job_id).as_posix()},
        )
        JsonJobRepository(app_root / "jobs").save(record)
        return {"job_id": record.job_id, "status": record.status.value, "command": record.command, "artifact_paths": record.artifact_paths}

    @app.get("/api/jobs/{job_id}/logs")
    def get_job_logs(job_id: str) -> dict[str, str]:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(status_code=400, detail="invalid job_id format")
        log_path = app_root / "logs" / f"{job_id}.log"
        return {"job_id": job_id, "logs": log_path.read_text(encoding="utf-8") if log_path.exists() else ""}

    @app.post("/api/jobs/{job_id}/merge")
    def merge_job(job_id: str, request: MergeRequest) -> dict[str, object]:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(status_code=400, detail="invalid job_id format")
        merged_dir = app_root / "merged_models" / job_id
        command = build_merge_command(adapter_dir=Path(request.adapter_dir), output_dir=merged_dir)
        return {"job_id": job_id, "command": command.argv, "artifact_paths": {"merged_model_dir": merged_dir.as_posix()}}

    @app.post("/api/jobs/{job_id}/quantize")
    def quantize_job(job_id: str, request: QuantizeRequest) -> dict[str, object]:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(status_code=400, detail="invalid job_id format")
        if request.quant_bits not in _QUANT_BITS_ALLOWED:
            raise HTTPException(status_code=400, detail=f"quant_bits must be one of {sorted(_QUANT_BITS_ALLOWED)}")
        if request.quant_method not in _QUANT_METHOD_ALLOWED:
            raise HTTPException(status_code=400, detail=f"quant_method must be one of {sorted(_QUANT_METHOD_ALLOWED)}")
        quantized_dir = app_root / "quantized_models" / f"{job_id}-{request.quant_method}-int{request.quant_bits}"
        command = build_quantize_command(
            merged_model_dir=Path(request.merged_model_dir),
            output_dir=quantized_dir,
            quant_bits=request.quant_bits,
            quant_method=request.quant_method,
        )
        return {"job_id": job_id, "command": command.argv, "artifact_paths": {"quantized_model_dir": quantized_dir.as_posix()}}

    @app.get("/api/jobs")
    def list_jobs() -> dict[str, object]:
        repo = JsonJobRepository(app_root / "jobs")
        records = repo.list()
        return {"jobs": [{"job_id": r.job_id, "status": r.status.value, "dataset_id": r.dataset_id} for r in records]}

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str) -> dict[str, object]:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(status_code=400, detail="invalid job_id format")
        repo = JsonJobRepository(app_root / "jobs")
        try:
            record = repo.get(job_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"job {job_id!r} not found")
        return {"job_id": record.job_id, "status": record.status.value, "dataset_id": record.dataset_id, "command": record.command, "artifact_paths": record.artifact_paths}

    @app.patch("/api/jobs/{job_id}/status")
    def update_job_status(job_id: str, request: UpdateStatusRequest) -> dict[str, object]:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(status_code=400, detail="invalid job_id format")
        try:
            new_status = JobStatus(request.status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"unknown status: {request.status!r}")
        repo = JsonJobRepository(app_root / "jobs")
        try:
            record = repo.get(job_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"job {job_id!r} not found")
        try:
            validated = transition(record.status, new_status)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        updated = JobRecord(
            job_id=record.job_id,
            status=validated,
            dataset_id=record.dataset_id,
            command=record.command,
            artifact_paths=record.artifact_paths,
        )
        repo.save(updated)
        return {"job_id": updated.job_id, "status": updated.status.value}

    @app.post("/api/jobs/{job_id}/eval")
    def eval_job(job_id: str, request: EvalRequest) -> dict[str, object]:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(status_code=400, detail="invalid job_id format")
        try:
            report = compute_intent_metrics(labels=request.labels, responses=request.responses)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"job_id": job_id, "report": asdict(report)}

    @app.post("/api/predict-intent")
    def predict_intent(request: PredictIntentRequest) -> dict[str, object]:
        if infer_raw is None:
            raise HTTPException(status_code=501, detail="live SWIFT inference is not enabled in tests")
        raw_response = infer_raw(request.text, request.model_artifact_id)
        try:
            return parse_predict_intent_output(raw_response, text=request.text, artifact_id=request.model_artifact_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

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

    return app


app = create_app()
