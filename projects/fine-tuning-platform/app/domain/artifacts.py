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
