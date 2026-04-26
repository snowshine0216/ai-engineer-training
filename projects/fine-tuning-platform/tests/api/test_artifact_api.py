from fastapi.testclient import TestClient

from app.main import create_app


def test_merge_route_returns_command(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/jobs/job-1/merge", json={"adapter_dir": "output/job-1/checkpoint-100"})

    assert response.status_code == 200
    assert response.json()["command"][0:2] == ["swift", "export"]
    assert response.json()["artifact_paths"]["merged_model_dir"].endswith("/merged_models/job-1")


def test_quantize_route_returns_post_merge_command(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/jobs/job-1/quantize", json={"merged_model_dir": "merged_models/job-1", "quant_bits": 4, "quant_method": "bnb"})

    assert response.status_code == 200
    assert "--quant_bits" in response.json()["command"]
    assert response.json()["artifact_paths"]["quantized_model_dir"].endswith("/quantized_models/job-1-bnb-int4")


def test_eval_route_returns_metrics(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post(
        "/api/jobs/job-1/eval",
        json={
            "labels": ["weather_query", "ticket_refund"],
            "responses": ['{"intent":"weather_query","confidence":0.9}', '{"intent":"weather_query","confidence":0.5}'],
        },
    )

    assert response.status_code == 200
    assert response.json()["report"]["correct"] == 1


def test_predict_intent_validates_json_with_fake_inference(tmp_path):
    client = TestClient(create_app(root=tmp_path, infer_raw=lambda text, artifact_id: '{"intent":"weather_query","confidence":0.91}'))

    response = client.post("/api/predict-intent", json={"text": "查天气", "model_artifact_id": "artifact-1"})

    assert response.status_code == 200
    assert response.json()["intent"] == "weather_query"
