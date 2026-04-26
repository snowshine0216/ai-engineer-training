from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from app.domain.datasets import parse_jsonl
from app.services.storage import AppPaths, save_dataset_artifacts


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

    return app


app = create_app()
