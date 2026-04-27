from fastapi.testclient import TestClient

from app.main import create_app


def _ok_response(intent: str, confidence: float = 0.9) -> str:
    return f'{{"intent":"{intent}","confidence":{confidence}}}'


def test_compare_returns_501_when_inference_not_configured(tmp_path):
    client = TestClient(create_app(root=tmp_path))

    response = client.post(
        "/api/predict-intent/compare",
        json={"text": "查天气", "model_specs": [{"kind": "base", "ref": "models/Qwen2.5-7B-Instruct"}]},
    )

    assert response.status_code == 501


def test_compare_runs_all_models_and_returns_results(tmp_path):
    def fake(text, ref):
        return _ok_response("weather_query") if ref.endswith("Qwen2.5-7B-Instruct") else _ok_response("other")

    client = TestClient(create_app(root=tmp_path, infer_raw=fake))

    response = client.post(
        "/api/predict-intent/compare",
        json={
            "text": "查天气",
            "model_specs": [
                {"kind": "base", "ref": "models/Qwen2.5-7B-Instruct"},
                {"kind": "artifact", "ref": "job-aabbccddeeff:adapter"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "查天气"
    assert len(body["results"]) == 2
    assert body["results"][0]["model_id"] == "models/Qwen2.5-7B-Instruct"
    assert body["results"][0]["intent"] == "weather_query"
    assert body["results"][1]["intent"] == "other"
    assert body["summary"]["agreement"] == 0.5
    assert body["summary"]["majority"] is None


def test_compare_captures_per_model_errors_without_failing_request(tmp_path):
    def fake(text, ref):
        if "broken" in ref:
            raise RuntimeError("inference unavailable")
        return _ok_response("weather_query")

    client = TestClient(create_app(root=tmp_path, infer_raw=fake))

    response = client.post(
        "/api/predict-intent/compare",
        json={
            "text": "查天气",
            "model_specs": [
                {"kind": "base", "ref": "models/Qwen2.5-7B-Instruct"},
                {"kind": "artifact", "ref": "broken-artifact"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    results = {result["model_id"]: result for result in body["results"]}
    assert results["models/Qwen2.5-7B-Instruct"]["intent"] == "weather_query"
    assert results["broken-artifact"]["error"] == "inference unavailable"
    assert "intent" not in results["broken-artifact"]
    assert body["summary"]["agreement"] == 1.0
    assert body["summary"]["majority"] == "weather_query"


def test_compare_returns_400_when_model_specs_empty(tmp_path):
    client = TestClient(create_app(root=tmp_path, infer_raw=lambda text, ref: _ok_response("x")))

    response = client.post("/api/predict-intent/compare", json={"text": "查天气", "model_specs": []})

    assert response.status_code == 400


def test_compare_rejects_path_traversal_in_ref(tmp_path):
    client = TestClient(create_app(root=tmp_path, infer_raw=lambda text, ref: _ok_response("x")))

    response = client.post(
        "/api/predict-intent/compare",
        json={"text": "test", "model_specs": [{"kind": "base", "ref": "../../etc/passwd"}]},
    )

    assert response.status_code == 422
