from app.domain.metrics import compute_intent_metrics, parse_intent_response


def test_parse_intent_response_accepts_strict_json():
    parsed = parse_intent_response('{"intent":"weather_query","confidence":0.82}')

    assert parsed.intent == "weather_query"
    assert parsed.confidence == 0.82
    assert parsed.error is None


def test_parse_intent_response_reports_malformed_json():
    parsed = parse_intent_response("intent: weather_query")

    assert parsed.intent is None
    assert parsed.confidence is None
    assert parsed.error == "response is not valid JSON"


def test_compute_intent_metrics_tracks_accuracy_f1_parse_failures_and_bad_cases():
    report = compute_intent_metrics(
        labels=["weather_query", "ticket_refund", "weather_query"],
        responses=[
            '{"intent":"weather_query","confidence":0.9}',
            '{"intent":"weather_query","confidence":0.6}',
            "not-json",
        ],
    )

    assert report.total == 3
    assert report.correct == 1
    assert report.parse_failures == 1
    assert report.accuracy == 1 / 3
    assert report.per_intent["weather_query"].precision == 0.5
    assert report.per_intent["weather_query"].recall == 0.5
    assert report.bad_cases == [
        {"index": 1, "label": "ticket_refund", "prediction": "weather_query", "raw_response": '{"intent":"weather_query","confidence":0.6}'},
        {"index": 2, "label": "weather_query", "prediction": None, "raw_response": "not-json"},
    ]
