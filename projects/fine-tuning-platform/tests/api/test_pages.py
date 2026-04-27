from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_renders_at_root(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    assert "Fine-Tuning Platform" in response.text
    assert 'data-section="jobs"' in response.text
    assert 'data-section="upload"' in response.text
    assert 'data-section="new-job"' in response.text
    assert 'data-section="predict"' in response.text


def test_workspace_loads_design_tokens_css(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    assert "/static/workspace.css" in response.text


def test_legacy_dataset_route_redirects_to_workspace(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/datasets/new", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"


def test_legacy_jobs_new_route_redirects_to_workspace(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/jobs/new", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"


def test_legacy_predict_route_redirects_to_workspace(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.get("/predict", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"
