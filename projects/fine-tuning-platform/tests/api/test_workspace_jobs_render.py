from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_includes_jobs_table_skeleton(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="jobs"' in text
    assert 'data-jobs-table' in text
    # Alpine binding placeholders that the JS reads
    assert 'x-for="job in jobs"' in text
