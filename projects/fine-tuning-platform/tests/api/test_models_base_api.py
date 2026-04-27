from fastapi.testclient import TestClient

from app.main import create_app


def test_list_base_models_returns_empty_when_directory_missing(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/models/base")

    assert response.status_code == 200
    assert response.json() == {"models": []}


def test_list_base_models_returns_directories(tmp_path):
    (tmp_path / "models" / "Qwen2.5-7B-Instruct").mkdir(parents=True)

    response = TestClient(create_app(root=tmp_path)).get("/api/models/base")

    assert response.status_code == 200
    body = response.json()
    assert len(body["models"]) == 1
    assert body["models"][0]["name"] == "Qwen2.5-7B-Instruct"
    # server-side filesystem paths must not be exposed to clients
    assert "path" not in body["models"][0]
