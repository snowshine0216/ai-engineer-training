from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_predict_batch_tab_includes_matrix(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-batch-prompts' in text
    assert 'data-batch-matrix' in text
    assert 'data-batch-load-eval' in text
