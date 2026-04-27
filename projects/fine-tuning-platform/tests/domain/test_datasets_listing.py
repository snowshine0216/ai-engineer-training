from datetime import datetime

from app.domain.datasets_listing import DatasetSummary, scan_datasets


def test_scan_datasets_returns_empty_when_directory_missing(tmp_path):
    assert scan_datasets(tmp_path / "training_data") == []


def test_scan_datasets_returns_empty_when_directory_empty(tmp_path):
    (tmp_path / "training_data").mkdir()
    assert scan_datasets(tmp_path / "training_data") == []


def test_scan_datasets_counts_rows_across_train_and_eval(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n{}\n{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("{}\n", encoding="utf-8")

    summaries = scan_datasets(tmp_path / "training_data")

    assert len(summaries) == 1
    assert summaries[0].dataset_id == "dataset-aabbccddeeff"
    assert summaries[0].row_count == 4
    datetime.fromisoformat(summaries[0].created_at.replace("Z", "+00:00"))


def test_scan_datasets_skips_blank_lines(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n\n{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("", encoding="utf-8")

    summaries = scan_datasets(tmp_path / "training_data")

    assert summaries[0].row_count == 2


def test_scan_datasets_orders_newest_first(tmp_path):
    import os, time
    older = tmp_path / "training_data" / "dataset-aaaaaaaaaaaa"
    newer = tmp_path / "training_data" / "dataset-bbbbbbbbbbbb"
    older.mkdir(parents=True)
    newer.mkdir(parents=True)
    for d in (older, newer):
        (d / "train.jsonl").write_text("{}\n", encoding="utf-8")
        (d / "eval.jsonl").write_text("{}\n", encoding="utf-8")
    os.utime(older, (time.time() - 100, time.time() - 100))

    summaries = scan_datasets(tmp_path / "training_data")

    assert [s.dataset_id for s in summaries] == ["dataset-bbbbbbbbbbbb", "dataset-aaaaaaaaaaaa"]


def test_scan_datasets_ignores_non_dataset_directories(tmp_path):
    (tmp_path / "training_data" / "dataset-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "training_data" / "dataset-aabbccddeeff" / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (tmp_path / "training_data" / "dataset-aabbccddeeff" / "eval.jsonl").write_text("{}\n", encoding="utf-8")
    (tmp_path / "training_data" / "junk").mkdir(parents=True)
    (tmp_path / "training_data" / "stray.txt").write_text("nope", encoding="utf-8")

    summaries = scan_datasets(tmp_path / "training_data")

    assert [s.dataset_id for s in summaries] == ["dataset-aabbccddeeff"]
