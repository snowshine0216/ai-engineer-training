from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_css_is_served_with_design_tokens(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/static/workspace.css")

    assert response.status_code == 200
    assert "--primary" in response.text
    assert "--bg" in response.text
