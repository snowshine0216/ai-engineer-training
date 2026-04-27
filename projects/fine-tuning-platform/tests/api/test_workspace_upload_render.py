from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_includes_upload_form(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="upload"' in text
    assert 'name="training_dataset"' in text
    assert 'accept=".jsonl"' in text
