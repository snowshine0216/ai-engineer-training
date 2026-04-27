import json

from fastapi.testclient import TestClient

from app.main import create_app


def test_list_artifacts_returns_empty_when_no_jobs(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/artifacts")

    assert response.status_code == 200
    assert response.json() == {"artifacts": []}


def test_list_artifacts_returns_adapter_when_output_dir_exists(tmp_path):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True)
    (jobs_dir / "job-aabbccddeeff.json").write_text(
        json.dumps({"job_id": "job-aabbccddeeff", "status": "succeeded", "dataset_id": "dataset-aabbccddeeff", "command": [], "artifact_paths": {}}),
        encoding="utf-8",
    )
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)

    response = TestClient(create_app(root=tmp_path)).get("/api/artifacts")

    assert response.status_code == 200
    body = response.json()
    assert len(body["artifacts"]) == 1
    artifact = body["artifacts"][0]
    assert artifact["kind"] == "adapter"
    assert artifact["job_id"] == "job-aabbccddeeff"
    assert artifact["artifact_id"] == "job-aabbccddeeff:adapter"


def test_list_artifacts_returns_multiple_kinds_for_one_job(tmp_path):
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir(parents=True)
    (jobs_dir / "job-aabbccddeeff.json").write_text(
        json.dumps({"job_id": "job-aabbccddeeff", "status": "merged", "dataset_id": "dataset-aabbccddeeff", "command": [], "artifact_paths": {}}),
        encoding="utf-8",
    )
    (tmp_path / "output" / "job-aabbccddeeff").mkdir(parents=True)
    (tmp_path / "merged_models" / "job-aabbccddeeff").mkdir(parents=True)

    response = TestClient(create_app(root=tmp_path)).get("/api/artifacts")

    kinds = sorted(artifact["kind"] for artifact in response.json()["artifacts"])
    assert kinds == ["adapter", "merged"]
