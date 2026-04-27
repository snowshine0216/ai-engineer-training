from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_new_job_form_uses_dropdowns(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="new-job"' in text
    assert 'x-model="datasetId"' in text
    assert 'x-model="modelPath"' in text
    assert 'x-for="dataset in datasets"' in text
    assert 'x-for="model in baseModels"' in text
