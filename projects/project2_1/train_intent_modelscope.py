"""
Intent classification fine-tuning via ModelScope.

Model source : ModelScope Hub (snapshot_download) — faster in China than HuggingFace
Device       : auto-detected
  - Apple Silicon MPS  → bf16, no quantization (51 GB unified memory)
  - CUDA (A10 / T4)    → 4-bit quantization via bitsandbytes
  - CPU fallback       → fp32

Run:
    python train_intent_modelscope.py
    # or on ModelScope Notebook: same command after uploading this file + data/
"""

import os
import json
import torch
import numpy as np
from datasets import load_dataset
from sklearn.metrics import accuracy_score
from modelscope import snapshot_download
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# --- config ---
MODEL_ID = "Qwen/Qwen3-8B"
OUTPUT_DIR = "./qwen3-intent-lora-ms"
MAX_LENGTH = 128
BATCH_SIZE = 4
EPOCHS = 15
LEARNING_RATE = 2e-5

# --- device detection ---
if torch.backends.mps.is_available():
    DEVICE = "mps"
    USE_4BIT = False
    COMPUTE_DTYPE = torch.bfloat16
elif torch.cuda.is_available():
    DEVICE = "cuda"
    USE_4BIT = True          # keeps Qwen3-8B within A10's 24 GB VRAM
    COMPUTE_DTYPE = torch.float16
else:
    DEVICE = "cpu"
    USE_4BIT = False
    COMPUTE_DTYPE = torch.float32

print(f"Device: {DEVICE} | 4-bit: {USE_4BIT} | dtype: {COMPUTE_DTYPE}")
os.makedirs(OUTPUT_DIR, exist_ok=True)
tokenizer = None


def select_data_file(data_dir: str = "data") -> str:
    augmented = os.path.join(data_dir, "intent_data_augmented.jsonl")
    original = os.path.join(data_dir, "intent_data.jsonl")
    if os.path.exists(augmented):
        print(f"Using augmented dataset: {augmented}")
        return augmented
    print(f"Augmented dataset not found — using original: {original}")
    print("Tip: run `python augment_data.py` first for better results.")
    return original


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    return {"accuracy": float(accuracy_score(labels, predictions))}


def load_intent_data():
    global tokenizer

    data_file = select_data_file()
    dataset = load_dataset("json", data_files=data_file, split="train")

    intents = sorted(set(dataset["intent"]))
    label2id = {intent: idx for idx, intent in enumerate(intents)}
    id2label = {idx: intent for intent, idx in label2id.items()}

    with open(os.path.join(OUTPUT_DIR, "label_mapping.json"), "w", encoding="utf-8") as f:
        json.dump({"label2id": label2id, "id2label": id2label}, f, ensure_ascii=False, indent=2)

    def preprocess_function(examples):
        tokenized = tokenizer(
            examples["text"],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False,
        )
        tokenized["labels"] = [label2id[intent] for intent in examples["intent"]]
        return tokenized

    dataset = dataset.map(
        preprocess_function,
        batched=True,
        remove_columns=dataset.column_names,
        load_from_cache_file=False,
    )
    dataset = dataset.train_test_split(test_size=0.2, seed=42)

    print(f"Dataset loaded:")
    print(f"  intent classes : {len(intents)}")
    print(f"  train samples  : {len(dataset['train'])}")
    print(f"  eval samples   : {len(dataset['test'])}")

    return dataset, len(intents), label2id, id2label


def load_model(model_path: str, num_labels: int, label2id: dict, id2label: dict):
    if USE_4BIT:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=COMPUTE_DTYPE,
            bnb_4bit_use_double_quant=True,
        )
        model = AutoModelForSequenceClassification.from_pretrained(
            model_path,
            num_labels=num_labels,
            label2id=label2id,
            id2label=id2label,
            trust_remote_code=True,
            quantization_config=bnb_config,
            device_map="auto",
        )
        model = prepare_model_for_kbit_training(model)
    else:
        model = AutoModelForSequenceClassification.from_pretrained(
            model_path,
            num_labels=num_labels,
            label2id=label2id,
            id2label=id2label,
            trust_remote_code=True,
            dtype=COMPUTE_DTYPE,
        ).to(DEVICE)

    return model


def main():
    global tokenizer

    try:
        # Resolve model path:
        #   1. ModelScope local cache (fast, no download needed)
        #   2. ModelScope download (on cloud platform — fast CDN in China)
        #   3. HuggingFace hub ID (local dev with HF cache)
        print("Resolving model path...")
        ms_cache = os.path.join(
            os.environ.get("MODELSCOPE_CACHE", os.path.expanduser("~/.cache/modelscope/hub")),
            MODEL_ID.replace("/", os.sep),
        )
        if os.path.isdir(ms_cache):
            model_path = ms_cache
            print(f"Model path (ModelScope cache): {model_path}")
        elif os.environ.get("MODELSCOPE_DOMAIN") or torch.cuda.is_available():
            # On ModelScope cloud: download via their CDN
            print("Downloading via ModelScope CDN...")
            model_path = snapshot_download(MODEL_ID)
            print(f"Model path (downloaded): {model_path}")
        else:
            # Local dev: use HuggingFace cached model
            model_path = MODEL_ID
            print(f"Using HuggingFace hub ID: {model_path}")

        print("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        print("Loading dataset...")
        dataset, num_labels, label2id, id2label = load_intent_data()

        print(f"Loading model ({DEVICE}, 4-bit={USE_4BIT})...")
        model = load_model(model_path, num_labels, label2id, id2label)
        model.config.pad_token_id = tokenizer.pad_token_id

        lora_config = LoraConfig(
            r=16,
            lora_alpha=16,                                          # ratio = 1.0
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
            lora_dropout=0.2,
            bias="none",
            task_type="SEQ_CLS",
        )
        model = get_peft_model(model, lora_config)
        model.print_trainable_parameters()

        training_args = TrainingArguments(
            output_dir=OUTPUT_DIR,
            learning_rate=LEARNING_RATE,
            per_device_train_batch_size=BATCH_SIZE,
            per_device_eval_batch_size=BATCH_SIZE,
            num_train_epochs=EPOCHS,
            weight_decay=0.05,
            warmup_steps=160,
            eval_strategy="epoch",
            save_strategy="epoch",
            logging_steps=10,
            bf16=(DEVICE in ("mps", "cpu") and COMPUTE_DTYPE == torch.bfloat16),
            fp16=(DEVICE == "cuda"),
            gradient_checkpointing=(DEVICE == "cuda"),   # only for CUDA; MPS has enough RAM
            report_to="none",
            load_best_model_at_end=True,
            metric_for_best_model="eval_accuracy",
            greater_is_better=True,
            save_total_limit=2,
        )

        data_collator = DataCollatorWithPadding(
            tokenizer,
            pad_to_multiple_of=8,
            return_tensors="pt",
        )

        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=dataset["train"],
            eval_dataset=dataset["test"],
            data_collator=data_collator,
            processing_class=tokenizer,
            compute_metrics=compute_metrics,
            callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
        )

        print("Training...")
        trainer.train()

        print("Saving model...")
        model.save_pretrained(OUTPUT_DIR)
        tokenizer.save_pretrained(OUTPUT_DIR)
        print(f"Saved to {OUTPUT_DIR}")
        print("Done!")

    except Exception as e:
        print(f"Training error: {e}")
        raise


if __name__ == "__main__":
    main()
