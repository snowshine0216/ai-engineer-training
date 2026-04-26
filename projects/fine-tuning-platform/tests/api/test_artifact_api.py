from fastapi.testclient import TestClient

from app.main import create_app


def test_merge_route_returns_command(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/jobs/job-aabbccddeeff/merge", json={"adapter_dir": "output/job-aabbccddeeff/checkpoint-100"})

    assert response.status_code == 200
    assert response.json()["command"][0:2] == ["swift", "export"]
    assert response.json()["artifact_paths"]["merged_model_dir"].endswith("/merged_models/job-aabbccddeeff")


def test_quantize_route_returns_post_merge_command(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/jobs/job-aabbccddeeff/quantize", json={"merged_model_dir": "merged_models/job-aabbccddeeff", "quant_bits": 4, "quant_method": "bnb"})

    assert response.status_code == 200
    assert "--quant_bits" in response.json()["command"]
    assert response.json()["artifact_paths"]["quantized_model_dir"].endswith("/quantized_models/job-aabbccddeeff-bnb-int4")


def test_eval_route_returns_metrics(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post(
        "/api/jobs/job-aabbccddeeff/eval",
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


def test_predict_intent_returns_501_when_infer_raw_not_configured(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post("/api/predict-intent", json={"text": "查天气", "model_artifact_id": "artifact-1"})

    assert response.status_code == 501


def test_predict_intent_returns_422_when_inference_output_is_malformed(tmp_path):
    client = TestClient(create_app(root=tmp_path, infer_raw=lambda text, artifact_id: "not-json-at-all"))

    response = client.post("/api/predict-intent", json={"text": "查天气", "model_artifact_id": "artifact-1"})

    assert response.status_code == 422
