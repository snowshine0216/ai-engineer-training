from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_includes_predict_expanded_tabs(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="predict-expanded"' in text
    assert 'data-tab="quick"' in text
    assert 'data-tab="batch"' in text
    assert 'data-history-panel' in text
