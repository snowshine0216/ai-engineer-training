# Handoff Document
*Last updated: 2026-04-26 17:19 CST (GMT+8)*

## Goal

Build a standalone fine-tuning platform for ModelScope SWIFT LoRA workflows. The first use case is training a generative user-intent analysis model based on `Qwen2.5-7B-Instruct`, then exposing a FastAPI inference endpoint that `chat-site` can call later.

## Current Progress

- Brainstorming and design are complete for the MVP.
- Final architecture decision: create a standalone Python FastAPI app at `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/fine-tuning-platform`.
- The platform should use ModelScope SWIFT through CLI subprocesses, not private SWIFT Python internals.
- The default runtime profile is Apple Silicon local development: MPS/CPU-friendly settings, small batch size, gradient accumulation, conservative max length.
- The model approach is generative SFT, not sequence classification. Training rows should teach Qwen to return strict intent JSON such as `{"intent":"weather_query","confidence":1.0}`.
- Eval behavior is decided:
  - `training_dataset.jsonl` is required.
  - `eval_dataset.jsonl` is optional.
  - If no eval dataset is provided, the platform creates a deterministic 80/20 train/eval split with a fixed seed.
- Pipeline is decided:
  `upload dataset -> validate/normalize -> train LoRA -> eval adapter -> merge LoRA -> eval merged model -> quantize merged model -> smoke/eval quantized model when locally runnable -> expose inference endpoint`.
- Quantization after merge is first-class in the design, with a caveat that Apple Silicon local quantization and CUDA/server deployment are not equivalent.
- Inference endpoint is in scope:
  `POST /api/predict-intent` accepts text and an optional artifact ID, returns parsed intent JSON, raw model response, confidence, and artifact ID.
- Design spec was written, self-reviewed, and committed:
  - Commit: `ad294e0 docs: design fine-tuning platform MVP`
  - File: `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/docs/superpowers/specs/2026-04-26-fine-tuning-platform-design.md`
- Implementation plan was written and self-reviewed:
  - File: `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/docs/superpowers/plans/2026-04-26-fine-tuning-platform.md`
  - It is ignored by `.gitignore` because of `**/plans`, so it is saved locally but not tracked or committed.
- Visual companion was used for an architecture diagram and then stopped. Its generated files remain untracked under `.superpowers/`.

## What Worked

- Reading the course notes and existing lab before designing clarified the core flow: LoRA training, merge, quantize, deploy behind a FastAPI-style wrapper.
- Reading `/Users/snow/Documents/Repository/ai-engineer-training/swift-m5-lab/README.md` confirmed that Python + `uv` + SWIFT CLI is the practical base.
- Checking prior projects helped avoid a wrong architecture:
  - `project2_1` uses a PEFT sequence-classification approach, which was intentionally rejected for this MVP.
  - `project2_2` has SWIFT-style LoRA and FastAPI prior art worth borrowing from.
- Checking current SWIFT/Qwen docs confirmed that SWIFT supports LoRA, QLoRA, export/merge, quantization, evaluation, deployment, and OpenAI-compatible serving paths.
- The final plan includes TDD steps and keeps pure logic separate from file/subprocess/model effects, matching `AGENTS.md` functional-programming instructions.

## What Didn't Work

- The first attempt to read `swift-m5-lab/README.md` used a bad working directory/path context and failed; re-running with the correct path worked.
- A full Next.js UI was considered but rejected for the MVP. SWIFT is Python-native, so FastAPI with simple server-rendered pages is easier and less coupled.
- Importing SWIFT internals directly was rejected because the CLI is the more stable contract.
- A thin wrapper around `swift web-ui` was rejected because it would not produce a clean custom platform or stable future `chat-site` integration contract.
- The implementation plan is under an ignored path. If future agents need it tracked, they must either force-add it or move it to a non-ignored path.

## Next Steps

1. Ask the user to choose execution mode if not already chosen:
   - Subagent-driven execution using `superpowers:subagent-driven-development` is recommended.
   - Inline execution using `superpowers:executing-plans` is the alternative.
2. If executing inline or via subagents, start with Task 1 in:
   `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/docs/superpowers/plans/2026-04-26-fine-tuning-platform.md`
3. Implement the plan task-by-task with TDD:
   - scaffold FastAPI project and health route
   - add dataset validation/normalization
   - add metrics and JSON parsing
   - add SWIFT command builders
   - add job status transitions
   - add local storage and job repository
   - add subprocess runner
   - add dataset/job/artifact/inference APIs
   - add simple server-rendered pages
   - add README and final verification
4. Before implementation, decide whether to force-track the plan despite `.gitignore`:
   `git add -f docs/superpowers/plans/2026-04-26-fine-tuning-platform.md`
   Only do this if the user wants the plan committed.
5. Final verification after implementation should include:
   `uv run pytest -v`
   and a Python import smoke check from `projects/fine-tuning-platform`.

## Key Files & Locations

- Root worktree:
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training`
- Current workspace folder:
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects`
- Planned app location:
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/fine-tuning-platform`
- Design spec:
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/docs/superpowers/specs/2026-04-26-fine-tuning-platform-design.md`
- Implementation plan:
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/docs/superpowers/plans/2026-04-26-fine-tuning-platform.md`
- Course note read:
  `/Users/snow/Documents/Repository/snow-knowledge-database/courses/ai-engineering-training-camp/module-2-fine-tuning/020-model-evaluation-and-deployment.md`
- SWIFT lab read:
  `/Users/snow/Documents/Repository/ai-engineer-training/swift-m5-lab/README.md`
- Future integration target:
  `/Users/snow/Documents/Repository/ai-engineer-training/projects/chat-site`
- Useful prior art:
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/project2_1`
  `/Users/snow/.codex/worktrees/4f34/ai-engineer-training/projects/project2_2`

## Context & Notes

- User explicitly chose:
  - MVP scope, not full platform.
  - Standalone project under `projects/fine-tuning-platform`.
  - FastAPI UI/backend, not Next.js UI for the MVP.
  - Generative SFT intent model, not sequence classification.
  - Apple Silicon local training profile.
- The root `AGENTS.md` instructions emphasize functional programming, immutability, pure functions, explicit data flow, small modules, and TDD.
- The implementation plan obeys TDD and gives exact red/green/commit steps.
- Current git state before this handoff edit had untracked `.superpowers/` and `projects/AGENTS.md`. Do not delete or revert them unless the user asks.
- The design spec commit exists, but this handoff update itself is not committed unless a future user asks for it.
