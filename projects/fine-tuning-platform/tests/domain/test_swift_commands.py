from pathlib import Path

from app.domain.swift_commands import (
    AppleSiliconTrainingConfig,
    build_infer_command,
    build_merge_command,
    build_quantize_command,
    build_train_command,
)


def test_build_train_command_uses_apple_silicon_defaults():
    command = build_train_command(
        AppleSiliconTrainingConfig(
            model_path=Path("models/Qwen2.5-7B-Instruct"),
            train_dataset=Path("training_data/job/train.jsonl"),
            eval_dataset=Path("training_data/job/eval.jsonl"),
            output_dir=Path("output/job-1"),
        )
    )

    assert command.env == {"PYTORCH_ENABLE_MPS_FALLBACK": "1"}
    assert command.argv[:4] == ["swift", "sft", "--model_type", "qwen2"]
    assert "--dataset" in command.argv
    assert "training_data/job/train.jsonl" in command.argv
    assert "--val_dataset" in command.argv
    assert "training_data/job/eval.jsonl" in command.argv
    assert "--per_device_train_batch_size" in command.argv
    assert "1" in command.argv


def test_build_merge_command_merges_adapter_to_model_dir():
    command = build_merge_command(adapter_dir=Path("output/job/checkpoint-100"), output_dir=Path("merged_models/job"))

    assert command.argv == [
        "swift",
        "export",
        "--adapters",
        "output/job/checkpoint-100",
        "--merge_lora",
        "true",
        "--output_dir",
        "merged_models/job",
    ]


def test_build_quantize_command_runs_after_merge():
    command = build_quantize_command(merged_model_dir=Path("merged_models/job"), output_dir=Path("quantized_models/job"), quant_bits=4, quant_method="bnb")

    assert command.argv == [
        "swift",
        "export",
        "--model",
        "merged_models/job",
        "--quant_bits",
        "4",
        "--quant_method",
        "bnb",
        "--output_dir",
        "quantized_models/job",
    ]


def test_build_infer_command_points_to_artifact_and_query():
    command = build_infer_command(model_dir=Path("merged_models/job"), query="帮我查天气")

    assert command.argv == ["swift", "infer", "--model_type", "qwen2", "--model", "merged_models/job", "--query", "帮我查天气"]
