from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandSpec:
    argv: list[str]
    env: dict[str, str]


@dataclass(frozen=True)
class AppleSiliconTrainingConfig:
    model_path: Path
    train_dataset: Path
    eval_dataset: Path
    output_dir: Path
    num_train_epochs: int = 3
    max_length: int = 512
    learning_rate: str = "1e-4"
    lora_rank: int = 8
    lora_alpha: int = 32
    per_device_train_batch_size: int = 1
    gradient_accumulation_steps: int = 16
    save_steps: int = 100
    logging_steps: int = 10


def _path(value: Path) -> str:
    return value.as_posix()


def build_train_command(config: AppleSiliconTrainingConfig) -> CommandSpec:
    return CommandSpec(
        argv=[
            "swift",
            "sft",
            "--model_type",
            "qwen2",
            "--model",
            _path(config.model_path),
            "--dataset",
            _path(config.train_dataset),
            "--val_dataset",
            _path(config.eval_dataset),
            "--output_dir",
            _path(config.output_dir),
            "--num_train_epochs",
            str(config.num_train_epochs),
            "--max_length",
            str(config.max_length),
            "--learning_rate",
            config.learning_rate,
            "--lora_rank",
            str(config.lora_rank),
            "--lora_alpha",
            str(config.lora_alpha),
            "--per_device_train_batch_size",
            str(config.per_device_train_batch_size),
            "--gradient_accumulation_steps",
            str(config.gradient_accumulation_steps),
            "--save_steps",
            str(config.save_steps),
            "--logging_steps",
            str(config.logging_steps),
        ],
        env={"PYTORCH_ENABLE_MPS_FALLBACK": "1"},
    )


def build_merge_command(adapter_dir: Path, output_dir: Path) -> CommandSpec:
    return CommandSpec(
        argv=["swift", "export", "--adapters", _path(adapter_dir), "--merge_lora", "true", "--output_dir", _path(output_dir)],
        env={"PYTORCH_ENABLE_MPS_FALLBACK": "1"},
    )


def build_quantize_command(merged_model_dir: Path, output_dir: Path, quant_bits: int, quant_method: str) -> CommandSpec:
    return CommandSpec(
        argv=[
            "swift",
            "export",
            "--model",
            _path(merged_model_dir),
            "--quant_bits",
            str(quant_bits),
            "--quant_method",
            quant_method,
            "--output_dir",
            _path(output_dir),
        ],
        env={"PYTORCH_ENABLE_MPS_FALLBACK": "1"},
    )


def build_infer_command(model_dir: Path, query: str) -> CommandSpec:
    return CommandSpec(
        argv=["swift", "infer", "--model_type", "qwen2", "--model", _path(model_dir), "--query", query],
        env={"PYTORCH_ENABLE_MPS_FALLBACK": "1"},
    )
