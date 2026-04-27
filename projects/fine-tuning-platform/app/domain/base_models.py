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
