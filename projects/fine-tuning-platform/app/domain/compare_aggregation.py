from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CompareSummary:
    agreement: float
    majority: str | None


def aggregate_compare_results(results: list[dict[str, Any]]) -> CompareSummary:
    intents = [result["intent"] for result in results if result.get("error") is None and result.get("intent")]
    if not intents:
        return CompareSummary(agreement=0.0, majority=None)
    counts = Counter(intents)
    top_count = max(counts.values())
    leaders = [intent for intent, count in counts.items() if count == top_count]
    majority = leaders[0] if len(leaders) == 1 else None
    agreement = top_count / len(intents)
    return CompareSummary(agreement=agreement, majority=majority)
