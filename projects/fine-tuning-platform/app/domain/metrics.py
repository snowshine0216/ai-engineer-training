from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any


@dataclass(frozen=True)
class ParsedIntent:
    intent: str | None
    confidence: float | None
    error: str | None


@dataclass(frozen=True)
class IntentStats:
    precision: float
    recall: float
    f1: float
    support: int


@dataclass(frozen=True)
class MetricsReport:
    total: int
    correct: int
    accuracy: float
    parse_failures: int
    per_intent: dict[str, IntentStats]
    bad_cases: list[dict[str, Any]]


def parse_intent_response(raw: str) -> ParsedIntent:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return ParsedIntent(intent=None, confidence=None, error="response is not valid JSON")
    if not isinstance(parsed, dict):
        return ParsedIntent(intent=None, confidence=None, error="response must be a JSON object")
    intent = parsed.get("intent")
    confidence = parsed.get("confidence")
    if not isinstance(intent, str) or not intent.strip():
        return ParsedIntent(intent=None, confidence=None, error="intent must be a non-empty string")
    if not isinstance(confidence, (int, float)):
        return ParsedIntent(intent=intent.strip(), confidence=None, error="confidence must be numeric")
    return ParsedIntent(intent=intent.strip(), confidence=float(confidence), error=None)


def _safe_divide(numerator: int, denominator: int) -> float:
    return 0.0 if denominator == 0 else numerator / denominator


def _f1(precision: float, recall: float) -> float:
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def compute_intent_metrics(labels: list[str], responses: list[str]) -> MetricsReport:
    if len(labels) != len(responses):
        raise ValueError("labels and responses must have the same length")

    parsed = [parse_intent_response(response) for response in responses]
    predictions = [item.intent for item in parsed]
    intents = sorted(set(labels) | {prediction for prediction in predictions if prediction is not None})
    correct = sum(1 for label, prediction in zip(labels, predictions, strict=True) if label == prediction)
    parse_failures = sum(1 for item in parsed if item.error is not None)

    per_intent = {
        intent: IntentStats(
            precision=_safe_divide(
                sum(1 for label, prediction in zip(labels, predictions, strict=True) if label == intent and prediction == intent),
                sum(1 for prediction in predictions if prediction == intent),
            ),
            recall=_safe_divide(
                sum(1 for label, prediction in zip(labels, predictions, strict=True) if label == intent and prediction == intent),
                sum(1 for label in labels if label == intent),
            ),
            f1=0.0,
            support=sum(1 for label in labels if label == intent),
        )
        for intent in intents
    }
    per_intent = {
        intent: IntentStats(stats.precision, stats.recall, _f1(stats.precision, stats.recall), stats.support)
        for intent, stats in per_intent.items()
    }
    bad_cases = [
        {"index": index, "label": label, "prediction": prediction, "raw_response": response}
        for index, (label, prediction, response) in enumerate(zip(labels, predictions, responses, strict=True))
        if label != prediction
    ]
    total = len(labels)
    return MetricsReport(
        total=total,
        correct=correct,
        accuracy=_safe_divide(correct, total),
        parse_failures=parse_failures,
        per_intent=per_intent,
        bad_cases=bad_cases,
    )
