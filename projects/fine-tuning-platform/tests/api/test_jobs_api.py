from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_create_job_records_swift_command(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text('{"instruction":"i","input":"x","output":"y"}\n', encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text('{"instruction":"i","input":"x","output":"y"}\n', encoding="utf-8")

    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/jobs", json={"dataset_id": "dataset-aabbccddeeff", "model_path": "models/Qwen2.5-7B-Instruct"})

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"]
    assert body["status"] == "created"
    assert body["command"][0:2] == ["swift", "sft"]


def test_get_job_logs_returns_empty_string_when_log_missing(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/api/jobs/job-aabbccddeeff/logs")

    assert response.status_code == 200
    assert response.json() == {"job_id": "job-aabbccddeeff", "logs": ""}


def test_get_job_logs_returns_log_content_when_file_exists(tmp_path):
    log_dir = tmp_path / "logs"
    log_dir.mkdir(parents=True)
    (log_dir / "job-aabbccddeeff.log").write_text("training step 1 loss=0.5", encoding="utf-8")

    client = TestClient(create_app(root=tmp_path))

    response = client.get("/api/jobs/job-aabbccddeeff/logs")

    assert response.status_code == 200
    assert "training step 1" in response.json()["logs"]
