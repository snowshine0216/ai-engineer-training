from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from app.domain.datasets import DatasetRow, split_train_eval, to_swift_rows


@dataclass(frozen=True)
class AppPaths:
    root: Path

    @property
    def training_data(self) -> Path:
        return self.root / "training_data"


@dataclass(frozen=True)
class DatasetArtifact:
    dataset_id: str
    raw_path: Path
    train_path: Path
    eval_path: Path


def _write_jsonl(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows)
    path.write_text(content + ("\n" if content else ""), encoding="utf-8")


def save_dataset_artifacts(paths: AppPaths, dataset_id: str, raw: str, rows: list[DatasetRow], eval_ratio: float, seed: int) -> DatasetArtifact:
    dataset_dir = paths.training_data / dataset_id
    dataset_dir.mkdir(parents=True, exist_ok=True)
    split = split_train_eval(rows, eval_ratio=eval_ratio, seed=seed)
    raw_path = dataset_dir / "raw.jsonl"
    train_path = dataset_dir / "train.jsonl"
    eval_path = dataset_dir / "eval.jsonl"
    raw_path.write_text(raw, encoding="utf-8")
    _write_jsonl(train_path, to_swift_rows(split.train))
    _write_jsonl(eval_path, to_swift_rows(split.eval))
    return DatasetArtifact(dataset_id=dataset_id, raw_path=raw_path, train_path=train_path, eval_path=eval_path)
