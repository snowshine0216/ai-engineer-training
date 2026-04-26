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
