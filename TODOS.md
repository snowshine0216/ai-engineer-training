# TODOS

## openai-litellm-chat

### Add backup provider path for interview demos

**What:** Add a secondary direct OpenAI-compatible endpoint or fallback demo path if the primary MiniMax integration is unavailable.

**Why:** The reviewed plan currently depends on one provider during a live interview demo, which creates a single-point failure risk.

**Context:** `/plan-eng-review` flagged provider availability as a real demo risk. This was intentionally deferred so the current build can stay focused on the main streaming retry/timeline path instead of expanding the matrix immediately.

**Effort:** M
**Priority:** P2
**Depends on:** Stable primary direct-endpoint demo

### Add model selector and broader provider-mode support

**What:** Add a model selector and broader provider-mode support after the first interview demo is stable.

**Why:** It expands the app from one sharp resilience demo into a more general experimentation surface.

**Context:** The review explicitly cut this from v1 because the first release needs one clean story. The user later chose to pull live timeline streaming into scope, so multi-model expansion remains future work.

**Effort:** M
**Priority:** P3
**Depends on:** Stable single-provider streaming demo

### Add a subproject DESIGN.md after the UI stabilizes

**What:** Create `projects/openai-litellm-chat/DESIGN.md` that captures the visual system, hierarchy rules, motion rules, and responsive behavior approved in plan review.

**Why:** The current design review moved those decisions into the plan, but implementation work will be easier to keep consistent if the subproject has one reusable design source of truth.

**Context:** `/plan-design-review` rewrote the plan with concrete UI rules because this subproject does not yet have its own `DESIGN.md`. This should happen after the first UI implementation pass and refreshed mockups, not before.

**Effort:** S
**Priority:** P2
**Depends on:** First implementation pass plus refreshed mockups

## Completed

### fine-tuning-platform: FastAPI MVP with SWIFT LoRA

**What:** Standalone FastAPI platform for ModelScope SWIFT LoRA fine-tuning of `Qwen2.5-7B-Instruct` intent analysis. Domain layer, service layer, REST API, Jinja2 UI, and 56 tests.

**Completed:** v0.1.0.0 (2026-04-26)

## fine-tuning-platform

### Verify ms-swift CLI flags against installed version

**What:** Run `swift sft --help` in the platform's uv env and cross-check the generated command flags against the actual installed `ms-swift` version.

**Why:** The design relies on documented SWIFT CLI behavior. The exact flag names (`--model_type`, `--val_dataset`, `--per_device_train_batch_size`) should be verified against the local install before the first real training run.

**Effort:** S
**Priority:** P1
**Depends on:** `ms-swift` installed in local env

### Confirm which quantization method runs on Apple Silicon

**What:** Test `bnb` vs `gptq` vs `awq` on Apple Silicon to determine which is locally runnable. Update `_QUANT_BITS_ALLOWED` and add a method allowlist if needed.

**Why:** The current code accepts any `quant_method` string. Some methods require CUDA and will fail locally. The API should return a clear error for incompatible methods rather than passing them to SWIFT.

**Effort:** S
**Priority:** P2

### Add upload size limit to dataset endpoint

**What:** Cap `POST /api/datasets` at 50 MB. Return HTTP 413 if exceeded.

**Why:** The current endpoint reads the full upload into memory with no size guard. Adversarial review flagged this as a potential memory DoS vector.

**Effort:** S
**Priority:** P3
