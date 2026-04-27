from fastapi.testclient import TestClient

from app.main import create_app


def test_get_dataset_eval_returns_404_when_missing(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/datasets/dataset-aabbccddeeff/eval")
    assert response.status_code == 404


def test_get_dataset_eval_returns_rows_with_expected_intents(tmp_path):
    dataset_dir = tmp_path / "training_data" / "dataset-aabbccddeeff"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / "train.jsonl").write_text("{}\n", encoding="utf-8")
    (dataset_dir / "eval.jsonl").write_text(
        '{"instruction":"i","input":"查天气","output":"{\\"intent\\":\\"weather_query\\",\\"confidence\\":1.0}"}\n'
        '{"instruction":"i","input":"订机票","output":"{\\"intent\\":\\"flight\\",\\"confidence\\":1.0}"}\n',
        encoding="utf-8",
    )

    response = TestClient(create_app(root=tmp_path)).get("/api/datasets/dataset-aabbccddeeff/eval")

    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) == 2
    assert rows[0] == {"text": "查天气", "expected_intent": "weather_query"}
    assert rows[1] == {"text": "订机票", "expected_intent": "flight"}


def test_get_dataset_eval_rejects_invalid_id_format(tmp_path):
    response = TestClient(create_app(root=tmp_path)).get("/api/datasets/not-a-real/eval")
    assert response.status_code == 400
