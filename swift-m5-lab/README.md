# swift-m5-lab

Lab environment for fine-tuning experiments using [ms-swift](https://github.com/modelscope/swift) (ModelScope SWIFT).

## Environment Setup

This project uses [uv](https://github.com/astral-sh/uv) for environment management.

### Prerequisites

- Python 3.12
- [uv](https://docs.astral.sh/uv/getting-started/installation/) installed

### Install and activate

```bash
# Install all dependencies and create .venv automatically
uv sync

# Activate
source .venv/bin/activate
```

> **Note:** `uv sync` reads `pyproject.toml` and pins exact versions to `uv.lock`. The pip index is set to Tsinghua mirror (`https://pypi.tuna.tsinghua.edu.cn/simple`) in `pyproject.toml`.

### Key packages

| Package | Version |
|---------|---------|
| ms-swift | 4.1.2 |
| modelscope | 1.34.0 |
| torch | 2.11.0 |
| transformers | 5.5.4 |

## Fine-Tuning

### 1. Prepare the dataset

Dataset lives at `datasets/my_identity.jsonl`. Each line is a JSON object with `instruction` and `output` fields:

```json
{"instruction": "你是谁？", "output": "我是 Jarvis，由你的 M5 Pro 算力中心驱动的智能管家。"}
```

### 2. Run LoRA fine-tuning (SFT)

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1 # turn on the mps mode for mac
swift sft \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --dataset datasets/my_identity.jsonl \
  --output_dir output \
  --num_train_epochs 3 \
  --max_length 512 \
  --learning_rate 1e-4 \
  --lora_rank 8 \
  --lora_alpha 32 \
  --per_device_train_batch_size 1 \
  --gradient_accumulation_steps 16 \
  --save_steps 100 \
  --logging_steps 10
```

> **Tip (Apple Silicon):** Add `--device mps` to use the M-series GPU, or omit to fall back to CPU.

#### 参数说明

| 参数 | 说明 |
|------|------|
| `--lora_rank` | LoRA 低秩矩阵的秩。值越小，可训练参数越少、速度越快；值越大，表达能力越强但显存占用增加。常用 4/8/16/32。 |
| `--lora_alpha` | LoRA 的缩放系数，实际缩放比例为 `alpha / rank`。通常设为 rank 的 2 倍（如 rank=8 → alpha=16 或 32）。值越大，adapter 的影响权重越高。 |
| `--per_device_train_batch_size` | 每块 GPU/MPS 设备每次前向传播处理的样本数。受显存限制，在 Mac 上通常只能设 1。 |
| `--gradient_accumulation_steps` | 梯度累积步数。每 N 步才真正更新一次权重，等效 batch size = `batch_size × N`。用来在小显存下模拟大 batch（这里等效 batch=16）。 |
| `--save_steps` | 每训练多少步保存一次 checkpoint 到 `output/`。设 100 表示每 100 步存一个断点，方便中断后恢复。 |
| `--logging_steps` | 每多少步打印一次训练日志（loss、learning rate 等）。设 10 表示每 10 步输出一行进度。 |

> **设计逻辑：** 显存不够 → `per_device_train_batch_size=1`，用 `gradient_accumulation_steps=16` 补回等效 batch；LoRA 只训练少量参数（rank=8）来降低显存占用并防止灾难性遗忘。

Training checkpoints are saved under `output/`.

### 3. Merge LoRA weights into the base model

After training, merge the adapter into a single model for inference:

```bash
swift export \
  --adapters output/<run-dir>/checkpoint-<step> \
  --merge_lora true \
  --output_dir output/merged
```

---

## Inference / Checking Model Output

### Adapter 模式（无需 merge，直接加载 LoRA adapter）

训练完成后可以跳过 merge 步骤，直接用 adapter 进行推理：

```bash
# 训练完成后，adapter 在子目录中，例如：
# output/v0-20260426-xxxxxx/checkpoint-96/

# 交互式对话
swift infer \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --adapters output/<run-dir>/checkpoint-<step>

# 单条推理
swift infer \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --adapters output/<run-dir>/checkpoint-<step> \
  --query "你是谁？"

# Gradio Web UI（在浏览器中选择模型）
swift web-ui
```

> **注意：** `--adapters` 需要指向包含 `adapter_config.json` 的子目录（如 `checkpoint-96`），而不是训练运行的根目录。

> **Adapter 模式 vs Merge 模式**
> | | Adapter 模式 | Merge 模式 |
> |---|---|---|
> | 速度 | 略慢（动态加载） | 更快（权重已融合） |
> | 磁盘占用 | 小（只存 adapter） | 大（完整模型副本） |
> | 适合场景 | 实验、快速验证 | 生产部署 |

---

### Interactive CLI chat（Merge 模式）

```bash
swift infer \
  --model_type qwen2 \
  --model output/merged
```

This launches an interactive prompt — type a question and press Enter to see the model's response.

### Single-shot inference

```bash
swift infer \
  --model_type qwen2 \
  --model output/merged \
  --query "你是谁？"
```

### Compare base vs fine-tuned

```bash
# Base model
swift infer \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --query "你是谁？"

# Fine-tuned model
swift infer \
  --model_type qwen2 \
  --model output/merged \
  --query "你是谁？"
```

### Gradio web UI

```bash
swift web-ui
# 可选：指定端口
swift web-ui --server_port 7860
```

Opens a browser chat interface at `http://localhost:7860`. Select the model and checkpoint **inside the UI** — `swift web-ui` does not accept model args on the command line.

---

## Evaluation

### Option 2: Split train/eval during `swift sft`

Pass `--val_dataset` at training time — swift will evaluate on the eval set after each epoch, giving you loss/accuracy curves to monitor overfitting:

```bash
swift sft \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --dataset datasets/train.jsonl \
  --val_dataset datasets/eval.jsonl \
  --output_dir output \
  --num_train_epochs 3 \
  --max_length 512 \
  --learning_rate 1e-4 \
  --lora_rank 8 \
  --lora_alpha 32 \
  --per_device_train_batch_size 1 \
  --gradient_accumulation_steps 16 \
  --save_steps 100 \
  --logging_steps 10
```

Your `eval.jsonl` uses the same format as the training data:

```json
{"instruction": "对以下用户输入进行意图分类：'帮我查天气'", "output": "意图：weather_query"}
```

### Option 3: Custom eval script (precision / recall / F1)

After inference, run a script to compute exact-match classification metrics. First, generate predictions with `swift infer`:

```bash
swift infer \
  --model_type qwen2 \
  --model models/Qwen2.5-7B-Instruct \
  --adapters output/<run-dir>/checkpoint-<step> \
  --val_dataset datasets/eval.jsonl \
  --result_path output/eval_results.jsonl
```

Then compute metrics:

```python
import json
from sklearn.metrics import classification_report

preds, labels = [], []
with open("output/eval_results.jsonl") as f:
    for line in f:
        row = json.loads(line)
        preds.append(row["response"])   # model output
        labels.append(row["output"])    # ground truth

print(classification_report(labels, preds))
```

Install `scikit-learn` if needed:

```bash
uv add scikit-learn
```

> **Recommended flow:** Use Option 2 during training to monitor overfitting, then Option 3 post-training for the final accuracy report.

---

## Directory Structure

```
swift-m5-lab/
├── .venv/          # uv-managed virtual environment
├── datasets/
│   └── my_identity.jsonl   # identity fine-tuning dataset
├── models/
│   └── Qwen2.5-7B-Instruct/  # base model weights
├── output/         # training checkpoints & merged model
└── pyproject.toml  # uv project definition
```
