from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_create_job_records_swift_command(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-1"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text('{"instruction":"i","input":"x","output":"y"}\n', encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text('{"instruction":"i","input":"x","output":"y"}\n', encoding="utf-8")

    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/jobs", json={"dataset_id": "dataset-1", "model_path": "models/Qwen2.5-7B-Instruct"})

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"]
    assert body["status"] == "created"
    assert body["command"][0:2] == ["swift", "sft"]


def test_get_job_logs_returns_empty_string_when_log_missing(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/api/jobs/job-missing/logs")

    assert response.status_code == 200
    assert response.json() == {"job_id": "job-missing", "logs": ""}
