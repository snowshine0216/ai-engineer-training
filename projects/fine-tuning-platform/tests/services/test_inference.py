from app.services.inference import parse_predict_intent_output


def test_parse_predict_intent_output_raises_on_malformed_response():
    import pytest

    with pytest.raises(ValueError):
        parse_predict_intent_output("not-json", text="查天气", artifact_id="artifact-1")


def test_parse_predict_intent_output_returns_intent_payload():
    result = parse_predict_intent_output('{"intent":"weather_query","confidence":0.91}', text="查天气", artifact_id="artifact-1")

    assert result == {
        "text": "查天气",
        "intent": "weather_query",
        "confidence": 0.91,
        "raw_response": '{"intent":"weather_query","confidence":0.91}',
        "artifact_id": "artifact-1",
    }
