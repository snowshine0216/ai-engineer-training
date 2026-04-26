from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.domain.datasets import parse_jsonl
from app.domain.jobs import JobStatus
from app.domain.metrics import compute_intent_metrics
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


class PredictIntentRequest(BaseModel):
    text: str
    model_artifact_id: str = "default"


def create_app(root: Path | None = None, infer_raw: Callable[[str, str], str] | None = None) -> FastAPI:
    app_root = root or Path(".")
    app = FastAPI(title="Fine-Tuning Platform", version="0.1.0")
    templates = Jinja2Templates(directory=Path(__file__).parent / "templates")

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

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "fine-tuning-platform"}

    @app.post("/api/datasets", response_model=None)
    async def upload_dataset(training_dataset: UploadFile = File(...)) -> dict[str, object] | JSONResponse:
        raw = (await training_dataset.read()).decode("utf-8")
        parsed = parse_jsonl(raw)
        if parsed.issues:
            return JSONResponse(
                status_code=400,
                content={"issues": [{"row_number": issue.row_number, "message": issue.message} for issue in parsed.issues]},
            )
        dataset_id = f"dataset-{uuid4().hex[:12]}"
        artifact = save_dataset_artifacts(AppPaths(app_root), dataset_id=dataset_id, raw=raw, rows=parsed.rows, eval_ratio=0.2, seed=42)
        return {
            "dataset_id": artifact.dataset_id,
            "row_count": len(parsed.rows),
            "raw_path": artifact.raw_path.as_posix(),
            "train_path": artifact.train_path.as_posix(),
            "eval_path": artifact.eval_path.as_posix(),
        }

    @app.post("/api/jobs")
    def create_job(request: CreateJobRequest) -> dict[str, object]:
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
        log_path = app_root / "logs" / f"{job_id}.log"
        return {"job_id": job_id, "logs": log_path.read_text(encoding="utf-8") if log_path.exists() else ""}

    @app.post("/api/jobs/{job_id}/merge")
    def merge_job(job_id: str, request: MergeRequest) -> dict[str, object]:
        merged_dir = app_root / "merged_models" / job_id
        command = build_merge_command(adapter_dir=Path(request.adapter_dir), output_dir=merged_dir)
        return {"job_id": job_id, "command": command.argv, "artifact_paths": {"merged_model_dir": merged_dir.as_posix()}}

    @app.post("/api/jobs/{job_id}/quantize")
    def quantize_job(job_id: str, request: QuantizeRequest) -> dict[str, object]:
        quantized_dir = app_root / "quantized_models" / f"{job_id}-{request.quant_method}-int{request.quant_bits}"
        command = build_quantize_command(
            merged_model_dir=Path(request.merged_model_dir),
            output_dir=quantized_dir,
            quant_bits=request.quant_bits,
            quant_method=request.quant_method,
        )
        return {"job_id": job_id, "command": command.argv, "artifact_paths": {"quantized_model_dir": quantized_dir.as_posix()}}

    @app.post("/api/jobs/{job_id}/eval")
    def eval_job(job_id: str, request: EvalRequest) -> dict[str, object]:
        report = compute_intent_metrics(labels=request.labels, responses=request.responses)
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

    return app


app = create_app()
