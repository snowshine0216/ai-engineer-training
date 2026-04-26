from app.services.storage import AppPaths, save_dataset_artifacts
from app.domain.datasets import parse_jsonl


def test_save_dataset_artifacts_writes_empty_jsonl_when_rows_is_empty(tmp_path):
    paths = AppPaths(tmp_path)
    rows = []

    artifact = save_dataset_artifacts(paths, dataset_id="empty-ds", raw="", rows=rows, eval_ratio=0.2, seed=42)

    # raw file is written even for empty input; train/eval files exist
    assert artifact.raw_path.exists()
    assert artifact.train_path.exists()
    assert artifact.eval_path.exists()


def test_save_dataset_artifacts_writes_raw_normalized_train_and_eval(tmp_path):
    paths = AppPaths(root=tmp_path)
    rows = parse_jsonl('{"text":"查天气","intent":"weather_query"}\n{"text":"退票","intent":"ticket_refund"}\n').rows

    artifact = save_dataset_artifacts(paths, "dataset-1", raw='{"text":"查天气","intent":"weather_query"}\n', rows=rows, eval_ratio=0.5, seed=1)

    assert artifact.dataset_id == "dataset-1"
    assert artifact.raw_path.exists()
    assert artifact.train_path.exists()
    assert artifact.eval_path.exists()
    assert artifact.train_path.read_text(encoding="utf-8").strip()
    assert artifact.eval_path.read_text(encoding="utf-8").strip()
