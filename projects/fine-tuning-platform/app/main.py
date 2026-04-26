from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.domain.datasets import parse_jsonl
from app.domain.jobs import JobStatus
from app.domain.swift_commands import AppleSiliconTrainingConfig, build_train_command
from app.services.job_repository import JobRecord, JsonJobRepository
from app.services.storage import AppPaths, save_dataset_artifacts


class CreateJobRequest(BaseModel):
    dataset_id: str
    model_path: str


def create_app(root: Path | None = None) -> FastAPI:
    app_root = root or Path(".")
    app = FastAPI(title="Fine-Tuning Platform", version="0.1.0")

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

    return app


app = create_app()
