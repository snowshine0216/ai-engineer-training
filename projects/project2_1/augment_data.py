import json
import random
from pathlib import Path

random.seed(42)

DATA_DIR = Path(__file__).parent / "data"
INPUT_FILE = DATA_DIR / "intent_data.jsonl"
OUTPUT_FILE = DATA_DIR / "intent_data_augmented.jsonl"

# Polite Chinese prefixes common in aviation customer service dialogs
PREFIXES = [
    "你好，",
    "您好，",
    "请问，",
    "请帮我，",
    "我想",
    "我要",
    "帮我",
    "麻烦您，",
    "想请问，",
    "劳烦帮我，",
    "请问一下，",
    "能帮我",
]

# Polite endings that turn a statement into a question/request
SUFFIXES = [
    "，应该怎么做？",
    "，怎么处理？",
    "，能帮我吗？",
    "，谢谢。",
    "，请问怎么操作？",
]

TRAILING_PUNCTS = set("？！。?!")


def augment_sample(text: str, intent: str) -> list[dict]:
    results = [{"text": text, "intent": intent}]

    # Add 3 random prefix variants
    chosen_prefixes = random.sample(PREFIXES, min(3, len(PREFIXES)))
    for prefix in chosen_prefixes:
        stem = prefix.rstrip("，")
        if not text.startswith(stem):
            results.append({"text": prefix + text, "intent": intent})

    # Add 1 suffix variant if text doesn't already end with punctuation
    if text[-1] not in TRAILING_PUNCTS:
        suffix = random.choice(SUFFIXES)
        results.append({"text": text + suffix, "intent": intent})

    return results


def load_samples(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").strip().splitlines()]


def main() -> None:
    samples = load_samples(INPUT_FILE)
    print(f"Loaded {len(samples)} samples from {INPUT_FILE.name}")

    augmented: list[dict] = []
    for sample in samples:
        augmented.extend(augment_sample(sample["text"], sample["intent"]))

    random.shuffle(augmented)

    OUTPUT_FILE.write_text(
        "\n".join(json.dumps(s, ensure_ascii=False) for s in augmented),
        encoding="utf-8",
    )
    print(f"Generated {len(augmented)} augmented samples → {OUTPUT_FILE.name}")

    # Quick per-class stats
    from collections import Counter
    counts = Counter(s["intent"] for s in augmented)
    min_count = min(counts.values())
    max_count = max(counts.values())
    print(f"Per-class range: {min_count}–{max_count} samples")


if __name__ == "__main__":
    main()
