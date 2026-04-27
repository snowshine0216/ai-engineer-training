from fastapi.testclient import TestClient

from app.main import create_app


def test_workspace_predict_card_has_chip_picker_and_run(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/")

    assert response.status_code == 200
    text = response.text
    assert 'data-section="predict"' in text
    assert 'x-data="predict()"' in text
    assert 'data-predict-prompt' in text
    assert 'data-predict-chip-picker' in text
