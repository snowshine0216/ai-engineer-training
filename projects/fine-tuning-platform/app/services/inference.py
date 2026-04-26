from app.domain.metrics import parse_intent_response


def parse_predict_intent_output(raw_response: str, text: str, artifact_id: str) -> dict[str, object]:
    parsed = parse_intent_response(raw_response)
    if parsed.error:
        raise ValueError(parsed.error)
    return {
        "text": text,
        "intent": parsed.intent,
        "confidence": parsed.confidence,
        "raw_response": raw_response,
        "artifact_id": artifact_id,
    }
