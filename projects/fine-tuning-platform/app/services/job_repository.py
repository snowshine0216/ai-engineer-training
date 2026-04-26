from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path

from app.domain.jobs import JobStatus


@dataclass(frozen=True)
class JobRecord:
    job_id: str
    status: JobStatus
    dataset_id: str
    command: list[str]
    artifact_paths: dict[str, str]


class JsonJobRepository:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, job_id: str) -> Path:
        return self.root / f"{job_id}.json"

    def save(self, record: JobRecord) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        payload = {**asdict(record), "status": record.status.value}
        self._path(record.job_id).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def get(self, job_id: str) -> JobRecord:
        payload = json.loads(self._path(job_id).read_text(encoding="utf-8"))
        return JobRecord(status=JobStatus(payload["status"]), job_id=payload["job_id"], dataset_id=payload["dataset_id"], command=payload["command"], artifact_paths=payload["artifact_paths"])

    def list(self) -> list[JobRecord]:
        return [self.get(path.stem) for path in sorted(self.root.glob("*.json"))]
