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
