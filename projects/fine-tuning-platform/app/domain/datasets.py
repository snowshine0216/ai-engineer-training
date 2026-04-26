from __future__ import annotations

from dataclasses import dataclass
import json
from random import Random
from typing import Any


INTENT_INSTRUCTION = "Analyze the user intent and respond with strict JSON."


@dataclass(frozen=True)
class DatasetRow:
    text: str
    intent: str


@dataclass(frozen=True)
class ValidationIssue:
    row_number: int
    message: str


@dataclass(frozen=True)
class ParseResult:
    rows: list[DatasetRow]
    issues: list[ValidationIssue]


@dataclass(frozen=True)
class SplitResult:
    train: list[DatasetRow]
    eval: list[DatasetRow]


def _as_non_empty_string(row: dict[str, Any], key: str) -> str | None:
    value = row.get(key)
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _parse_source_row(row: dict[str, Any], row_number: int) -> tuple[DatasetRow | None, list[ValidationIssue]]:
    text = _as_non_empty_string(row, "text")
    intent = _as_non_empty_string(row, "intent")
    issues = [
        issue
        for issue in [
            None if text else ValidationIssue(row_number, "text must be a non-empty string"),
            None if intent else ValidationIssue(row_number, "intent must be a non-empty string"),
        ]
        if issue is not None
    ]
    return (DatasetRow(text=text, intent=intent), []) if text and intent else (None, issues)


def _parse_swift_row(row: dict[str, Any], row_number: int) -> tuple[DatasetRow | None, list[ValidationIssue]]:
    text = _as_non_empty_string(row, "input") or _as_non_empty_string(row, "instruction")
    raw_output = _as_non_empty_string(row, "output")
    if not raw_output:
        return None, [ValidationIssue(row_number, "output must be a non-empty string")]
    try:
        output = json.loads(raw_output)
    except json.JSONDecodeError:
        return None, [ValidationIssue(row_number, "output must be strict JSON")]
    intent = output.get("intent") if isinstance(output, dict) else None
    issues = [
        issue
        for issue in [
            None if text else ValidationIssue(row_number, "input or instruction must be a non-empty string"),
            None if isinstance(intent, str) and intent.strip() else ValidationIssue(row_number, "output.intent must be a non-empty string"),
        ]
        if issue is not None
    ]
    return (DatasetRow(text=text, intent=intent.strip()), []) if text and isinstance(intent, str) and intent.strip() else (None, issues)


def parse_jsonl(raw: str) -> ParseResult:
    rows: list[DatasetRow] = []
    issues: list[ValidationIssue] = []

    for index, line in enumerate(raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            issues.append(ValidationIssue(index, "row is not valid JSON"))
            continue
        if not isinstance(parsed, dict):
            issues.append(ValidationIssue(index, "row must be a JSON object"))
            continue
        row, row_issues = _parse_source_row(parsed, index) if "text" in parsed or "intent" in parsed else _parse_swift_row(parsed, index)
        if row:
            rows.append(row)
        issues.extend(row_issues)

    return ParseResult(rows=[] if issues else rows, issues=issues)


def to_swift_rows(rows: list[DatasetRow]) -> list[dict[str, str]]:
    return [
        {
            "instruction": INTENT_INSTRUCTION,
            "input": row.text,
            "output": json.dumps({"intent": row.intent, "confidence": 1.0}, ensure_ascii=False, separators=(",", ":")),
        }
        for row in rows
    ]


def split_train_eval(rows: list[DatasetRow], eval_ratio: float = 0.2, seed: int = 42) -> SplitResult:
    if not 0 < eval_ratio < 1:
        raise ValueError("eval_ratio must be between 0 and 1")
    indexed_rows = list(enumerate(rows))
    rng = Random(seed)
    shuffled = sorted(indexed_rows, key=lambda _: rng.random())
    eval_count = max(1, int(round(len(rows) * eval_ratio))) if len(rows) > 1 else 0
    eval_indexes = {index for index, _ in shuffled[:eval_count]}
    train = [row for index, row in indexed_rows if index not in eval_indexes]
    eval_rows = [row for index, row in indexed_rows if index in eval_indexes]
    return SplitResult(train=train, eval=eval_rows)
