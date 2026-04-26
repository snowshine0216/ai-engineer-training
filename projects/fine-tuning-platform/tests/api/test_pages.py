from fastapi.testclient import TestClient

from app.main import create_app


def test_index_page_renders(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    assert "Fine-Tuning Platform" in response.text


def test_dataset_upload_page_renders(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/datasets/new")

    assert response.status_code == 200
    assert "training_dataset" in response.text


def test_predict_page_renders(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/predict")

    assert response.status_code == 200
    assert "model_artifact_id" in response.text


def test_job_new_page_renders(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/jobs/new")

    assert response.status_code == 200
