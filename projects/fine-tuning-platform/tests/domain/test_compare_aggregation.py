from app.domain.compare_aggregation import CompareSummary, aggregate_compare_results


def _result(model_id: str, intent: str | None, latency_ms: int = 100, error: str | None = None) -> dict:
    payload = {"model_id": model_id, "kind": "artifact", "latency_ms": latency_ms}
    if intent is not None:
        payload["intent"] = intent
    if error is not None:
        payload["error"] = error
    return payload


def test_aggregate_returns_zero_agreement_for_empty_input():
    summary = aggregate_compare_results([])

    assert summary.agreement == 0.0
    assert summary.majority is None


def test_aggregate_returns_full_agreement_when_all_models_match():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", "weather_query"),
        _result("c", "weather_query"),
    ])

    assert summary.agreement == 1.0
    assert summary.majority == "weather_query"


def test_aggregate_computes_partial_agreement_and_majority():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", "weather_query"),
        _result("c", "other"),
    ])

    assert summary.agreement == 2 / 3
    assert summary.majority == "weather_query"


def test_aggregate_excludes_errored_results_from_agreement_math():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", None, error="boom"),
        _result("c", "weather_query"),
    ])

    assert summary.agreement == 1.0
    assert summary.majority == "weather_query"


def test_aggregate_returns_no_majority_on_tie():
    summary = aggregate_compare_results([
        _result("a", "weather_query"),
        _result("b", "other"),
    ])

    assert summary.majority is None
    assert summary.agreement == 0.5
