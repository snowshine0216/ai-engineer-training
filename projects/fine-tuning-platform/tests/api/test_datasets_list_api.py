from fastapi.testclient import TestClient

from app.main import create_app


def test_list_datasets_returns_empty_when_no_uploads(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/datasets")

    assert response.status_code == 200
    assert response.json() == {"datasets": []}


def test_list_datasets_returns_summary_after_upload(tmp_path):
    client = TestClient(create_app(root=tmp_path))
    upload = client.post(
        "/api/datasets",
        files={"training_dataset": ("intent.jsonl", b'{"text":"hi","intent":"greeting"}\n{"text":"bye","intent":"farewell"}\n', "application/jsonl")},
    )
    assert upload.status_code == 200

    response = client.get("/api/datasets")

    assert response.status_code == 200
    body = response.json()
    assert len(body["datasets"]) == 1
    assert body["datasets"][0]["dataset_id"].startswith("dataset-")
    assert body["datasets"][0]["row_count"] >= 1
    assert "created_at" in body["datasets"][0]
    # server-side filesystem paths must not be exposed to clients
    assert "train_path" not in body["datasets"][0]
    assert "eval_path" not in body["datasets"][0]
