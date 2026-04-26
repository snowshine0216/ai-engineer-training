from fastapi.testclient import TestClient

from app.main import create_app


def test_upload_dataset_returns_artifact_paths(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post(
        "/api/datasets",
        files={"training_dataset": ("intent.jsonl", b'{"text":"hi","intent":"greeting"}\n', "application/jsonl")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["dataset_id"]
    assert body["row_count"] == 1
    assert body["train_path"].endswith("/train.jsonl")
    assert body["eval_path"].endswith("/eval.jsonl")


def test_upload_dataset_reports_validation_errors(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post(
        "/api/datasets",
        files={"training_dataset": ("bad.jsonl", b'not-json\n', "application/jsonl")},
    )

    assert response.status_code == 400
    assert response.json()["issues"] == [{"row_number": 1, "message": "row is not valid JSON"}]
