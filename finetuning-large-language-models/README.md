# Fine-tuning large language models

Python tooling for Lamini, Hugging Face Transformers, and dataset workflows. Requires **Python 3.14+**.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) installed (`curl -LsSf https://astral.sh/uv/install.sh | sh` or your package manager).
- Python 3.14 (uv can install it: `uv python install 3.14`).

## Install with uv

From this directory (`finetuning-large-language-models`):

### Production (runtime dependencies only)

Creates a virtual environment (if needed), then installs the project in editable mode with **default** dependencies from `pyproject.toml` (no `dev` extra).

```bash
uv venv --python 3.14
uv sync
```

If you already use a `.venv` and prefer the lower-level installer:

```bash
uv pip install -e .
```

### Development (includes Jupyter)

Same as production, but also installs optional **`dev`** extras (`jupyter`, `ipykernel`).

```bash
uv venv --python 3.14
uv sync --extra dev
```

Or with `uv pip`:

```bash
uv pip install -e ".[dev]"
```

### Run commands inside the environment

Use `uv run` so you do not have to activate the venv manually:

```bash
uv run python your_script.py
uv run jupyter lab
```

## Lamini API

`from llama import BasicModelRunner` comes from the **`lamini`** package. Configure your API key as described in the [Lamini documentation](https://lamini-ai.github.io/) (for example `~/.lamini/configure.yaml` or environment variables).

## Project layout

- `pyproject.toml` — dependencies and optional `dev` group.
- `finetuning_large_language_models/` — minimal package marker for editable installs.
- Add your own `config.py`, `utilities.py`, and notebooks next to this README; keep the working directory at the project root so `import config` and `from utilities import *` resolve when you run notebooks or scripts.
