import json

from app.domain.datasets import (
    INTENT_INSTRUCTION,
    parse_jsonl,
    split_train_eval,
    to_swift_rows,
)


def test_parse_intent_jsonl_accepts_text_intent_rows():
    raw = '{"text":"帮我查天气","intent":"weather_query"}\n{"text":"我要退票","intent":"ticket_refund"}\n'

    result = parse_jsonl(raw)

    assert result.issues == []
    assert [row.text for row in result.rows] == ["帮我查天气", "我要退票"]
    assert [row.intent for row in result.rows] == ["weather_query", "ticket_refund"]


def test_parse_jsonl_reports_row_level_errors():
    raw = '{"text":"","intent":"weather_query"}\nnot-json\n{"text":"hi"}\n'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert [(issue.row_number, issue.message) for issue in result.issues] == [
        (1, "text must be a non-empty string"),
        (2, "row is not valid JSON"),
        (3, "intent must be a non-empty string"),
    ]


def test_parse_jsonl_accepts_swift_ready_rows():
    raw = '{"instruction":"Analyze","input":"查天气","output":"{\\"intent\\":\\"weather_query\\",\\"confidence\\":1.0}"}\n'

    result = parse_jsonl(raw)

    assert result.issues == []
    assert result.rows[0].text == "查天气"
    assert result.rows[0].intent == "weather_query"


def test_to_swift_rows_outputs_strict_json_target():
    result = parse_jsonl('{"text":"帮我查天气","intent":"weather_query"}\n')

    swift_rows = to_swift_rows(result.rows)

    assert swift_rows == [
        {
            "instruction": INTENT_INSTRUCTION,
            "input": "帮我查天气",
            "output": json.dumps({"intent": "weather_query", "confidence": 1.0}, ensure_ascii=False, separators=(",", ":")),
        }
    ]


def test_split_train_eval_is_deterministic_and_non_mutating():
    rows = parse_jsonl("\n".join([f'{{"text":"text-{i}","intent":"intent-{i % 2}"}}' for i in range(10)])).rows

    first = split_train_eval(rows, eval_ratio=0.2, seed=42)
    second = split_train_eval(rows, eval_ratio=0.2, seed=42)

    assert first == second
    assert len(first.train) == 8
    assert len(first.eval) == 2
    assert [row.text for row in rows] == [f"text-{i}" for i in range(10)]


# --- Gap tests: datasets.py ---

def test_as_non_empty_string_returns_none_for_non_string_value():
    raw = '{"text":123,"intent":"weather_query"}'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert any("text must be a non-empty string" in issue.message for issue in result.issues)


def test_parse_source_row_reports_both_fields_missing():
    raw = '{"text":"","intent":""}'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert len(result.issues) == 2
    messages = [issue.message for issue in result.issues]
    assert "text must be a non-empty string" in messages
    assert "intent must be a non-empty string" in messages


def test_parse_swift_row_reports_missing_output_key():
    raw = '{"instruction":"Analyze","input":"查天气"}'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert any("output" in issue.message for issue in result.issues)


def test_parse_swift_row_reports_invalid_json_output():
    raw = '{"instruction":"Analyze","input":"查天气","output":"not-json"}'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert any("JSON" in issue.message for issue in result.issues)


def test_parse_swift_row_reports_non_dict_json_output():
    raw = '{"instruction":"Analyze","input":"查天气","output":"[1,2,3]"}'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert result.issues


def test_parse_swift_row_reports_missing_input_and_instruction():
    raw = '{"output":"{\\"intent\\":\\"weather_query\\",\\"confidence\\":1.0}"}'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert any("input or instruction" in issue.message for issue in result.issues)


def test_parse_swift_row_reports_empty_intent_in_output():
    import json as _json
    output = _json.dumps({"intent": "", "confidence": 1.0})
    raw = _json.dumps({"instruction": "Analyze", "input": "查天气", "output": output})

    result = parse_jsonl(raw)

    assert result.rows == []
    assert any("intent" in issue.message for issue in result.issues)


def test_parse_jsonl_skips_blank_lines():
    raw = '{"text":"查天气","intent":"weather_query"}\n\n{"text":"退票","intent":"ticket_refund"}'

    result = parse_jsonl(raw)

    assert result.issues == []
    assert len(result.rows) == 2


def test_parse_jsonl_reports_non_dict_row():
    raw = '["not","a","dict"]'

    result = parse_jsonl(raw)

    assert result.rows == []
    assert any("object" in issue.message for issue in result.issues)


def test_split_train_eval_raises_for_invalid_ratio():
    import pytest
    rows = parse_jsonl('{"text":"查天气","intent":"weather_query"}').rows

    with pytest.raises(ValueError):
        split_train_eval(rows, eval_ratio=0.0)

    with pytest.raises(ValueError):
        split_train_eval(rows, eval_ratio=1.0)


def test_split_train_eval_single_row_has_empty_eval():
    rows = parse_jsonl('{"text":"查天气","intent":"weather_query"}').rows

    result = split_train_eval(rows, eval_ratio=0.2)

    assert len(result.train) == 1
    assert len(result.eval) == 0
