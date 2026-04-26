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


def test_get_job_returns_404_when_not_found(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/api/jobs/job-aabbccddeeff")

    assert response.status_code == 404


def test_get_job_returns_record_when_found(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("{}\n", encoding="utf-8")

    client = TestClient(create_app(root=tmp_path))
    create_resp = client.post("/api/jobs", json={"dataset_id": "dataset-aabbccddeeff", "model_path": "models/Qwen2.5-7B-Instruct"})
    job_id = create_resp.json()["job_id"]

    response = client.get(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    assert response.json()["job_id"] == job_id
    assert response.json()["status"] == "created"


def test_list_jobs_returns_empty_when_no_jobs(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/api/jobs")

    assert response.status_code == 200
    assert response.json() == {"jobs": []}


def test_patch_job_status_transitions_correctly(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("{}\n", encoding="utf-8")

    client = TestClient(create_app(root=tmp_path))
    job_id = client.post("/api/jobs", json={"dataset_id": "dataset-aabbccddeeff", "model_path": "models/Qwen2.5-7B-Instruct"}).json()["job_id"]

    response = client.patch(f"/api/jobs/{job_id}/status", json={"status": "running"})

    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_patch_job_status_rejects_invalid_transition(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text("{}\n", encoding="utf-8")

    client = TestClient(create_app(root=tmp_path))
    job_id = client.post("/api/jobs", json={"dataset_id": "dataset-aabbccddeeff", "model_path": "models/Qwen2.5-7B-Instruct"}).json()["job_id"]

    response = client.patch(f"/api/jobs/{job_id}/status", json={"status": "quantized"})

    assert response.status_code == 400


def test_patch_job_status_returns_404_when_not_found(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.patch("/api/jobs/job-aabbccddeeff/status", json={"status": "running"})

    assert response.status_code == 404
