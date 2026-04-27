# Handoff Document
*Last updated: 2026-04-27 (post-ship) CST (GMT+8)*

## Goal

Redesign the fine-tuning platform UI from four bare Jinja pages into a single workspace dashboard. Three concrete user asks: (1) consolidate the four nav pages onto one page, (2) replace free-text dataset/artifact ID inputs with dropdown selectors, (3) support multi-model side-by-side prediction comparison (including the base model). The platform itself (SWIFT LoRA + FastAPI MVP) was shipped earlier — see commit `9223a75 feat: fine-tuning platform MVP`. This session is a UI/UX iteration on top of that.

## Current Status

**SHIPPED — PR #8 open on GitHub (`claude/zen-jang-0cc430` → `main`).** The Two-Pane Workspace UI redesign is fully implemented and reviewed. 112 tests passing. The next action is landing the PR.

This session completed brainstorming → design → implementation plan → full TDD implementation → pre-landing review → adversarial security review → PR creation.

- **Brainstorm** (visual companion in browser, three picks):
  - Layout: **B. Two-Pane Workspace** — Jobs primary on the left, action cards stacked on the right rail.
  - Predict view: **C. Hybrid Quick / Batch tabs** — Card Row for ad-hoc single-prompt compare; Comparison Matrix for batch.
  - Visual style: **B. Modern Workspace** — soft slate background, rounded corners, indigo→violet accent, status pills.

- **Design spec** written, self-reviewed, and committed:
  - Path: `docs/superpowers/specs/2026-04-27-workspace-ui-redesign.md`
  - Commit: `8ff3a9f docs: workspace UI redesign spec`
  - Defines 4 new endpoints (`/api/datasets`, `/api/artifacts`, `/api/models/base`, `POST /api/predict-intent/compare`) plus a `/api/datasets/{id}/eval` helper added during planning. Legacy routes redirect to `/`.

- **Implementation plan** written, self-reviewed, force-committed (gitignore matched `**/plans`):
  - Path: `docs/superpowers/plans/2026-04-27-workspace-ui-redesign.md`
  - Commit: `8b344ce docs: workspace UI redesign implementation plan`
  - 15 tasks, each with bite-sized TDD steps and full code (no placeholders).
  - Spec coverage table cross-references every requirement to a task.
  - One spec item explicitly deferred: click-to-expand job-row drawer (artifact paths, command, log tail). Backend endpoints already exist; deferred as a small UI follow-up.

- **Gitignore tweak** committed (`c229109`): added `.superpowers/` so the brainstorming scratch dir doesn't pollute git status.

- **Tech direction locked in:**
  - Frontend: single Jinja2 template + Alpine.js v3 (CDN) + hand-rolled CSS with design tokens. **No build pipeline. No Tailwind. No SPA framework.**
  - Backend: FastAPI stays as-is. New endpoints added; existing endpoints unchanged.
  - Reactivity: per-component `x-data` blocks; events for cross-component refresh (`datasets:changed`, `jobs:changed`, `predict:select-job`).
  - Polling cadence: 5 s on `/api/jobs`, paused on `visibilitychange`.
  - Multi-model fan-out: server-side `asyncio.gather` over `asyncio.to_thread(infer_raw, ...)`.

## What Worked

- Visual companion with concrete A/B/C mockups got crisp picks fast — three questions, three confident answers.
- Reading existing tests (`test_pages.py`, `test_jobs_api.py`) before writing the plan caught the pattern (`TestClient(create_app(root=tmp_path))`) and the fact that `infer_raw` is dependency-injected.
- Cross-checking the spec against a coverage table during self-review caught the missing job-row drawer immediately.
- Following the repo's CLAUDE.md FP rules (pure functions for filesystem scans + result aggregation; I/O at handler boundaries) made the test plan straightforward — every pure function is unit-tested without mocks.

## What Didn't Work

- `docs/superpowers/plans/` is gitignored by the existing `**/plans` rule (intended for training output dirs). Had to `git add -f` to commit the plan. **If future agents add more plans here, they must force-add or amend `.gitignore` to whitelist `docs/superpowers/plans/`.**
- A first git commit attempt that bundled `.gitignore` + the spec failed because I hadn't `Read` the gitignore file before `Edit` — Edit requires a prior Read. Worked around with a separate commit. Lesson: always `Read` before `Edit`.

## Next Steps

1. **Land PR #8** — `gh pr merge 8 --squash` (or use `/land-and-deploy`).

2. **Optional follow-up** (deferred from plan): job-row click-to-expand drawer showing artifact paths, command, and log tail. Backend endpoints (`GET /api/jobs/{id}` and `/logs`) already supply the data — UI-only extension.

3. **3 INVESTIGATE items** from adversarial review (not blocking merge):
   - TOCTOU race in `update_job_status` — single-worker dev server is safe; affects multi-worker deploys only.
   - 100% agreement when all-but-one model fails — intentional design decision.
   - `_DATASET_ID_RE`/`_JOB_ID_RE` defined mid-module — latent readability issue, not a security risk.

## Key Files & Locations

- **Worktree root:** `/Users/snow/Documents/Repository/ai-engineer-training/projects/fine-tuning-platform/.claude/worktrees/zen-jang-0cc430/`
- **Project app:** `projects/fine-tuning-platform/`
- **Spec:** `docs/superpowers/specs/2026-04-27-workspace-ui-redesign.md`
- **Plan:** `docs/superpowers/plans/2026-04-27-workspace-ui-redesign.md` (force-tracked despite `**/plans` gitignore)
- **Brainstorm scratch (not tracked):** `.superpowers/brainstorm/52910-1777259418/` — the visual companion mockups (`layout-pattern.html`, `predict-comparison.html`, `visual-style.html`, `waiting.html`)
- **Existing platform code (don't break):**
  - `projects/fine-tuning-platform/app/main.py` — FastAPI app factory, existing endpoints
  - `projects/fine-tuning-platform/app/domain/` — pure-function modules (`datasets.py`, `jobs.py`, `metrics.py`, `swift_commands.py`)
  - `projects/fine-tuning-platform/app/services/` — I/O modules (`storage.py`, `inference.py`, `job_repository.py`, `subprocess_runner.py`)
  - `projects/fine-tuning-platform/app/templates/` — four templates that the plan replaces with one
  - `projects/fine-tuning-platform/tests/` — existing test patterns to mirror

## Context & Notes

- **Repo CLAUDE.md is strict:** TDD (red/green/refactor), pure functions, immutability via `@dataclass(frozen=True)`, explicit data flow, no module-level mutable state. Every backend task in the plan honors this. The frontend is necessarily stateful (Alpine.js components) but state is component-local; cross-component coordination uses `CustomEvent`.
- **Git committer warns "Your name and email address were configured automatically"** on every commit. Not blocking; user can fix later via `git config`.
- **Worktree is on branch `claude/zen-jang-0cc430`**, not `main`. PRs land on `main`. Don't push or create a PR until the user asks — the plan is a checkpoint, not the deliverable.
- **`.gitignore` already excludes `.superpowers/`** (added this session in commit `c229109`).
- **Auto mode is active** — user prefers continuous execution with minimal interruptions for routine decisions. They'll course-correct if needed. Save asks for risky/destructive moves (force-push, dropping data, anything visible to others).
- **No e2e/Playwright** in scope. Frontend tests are template-rendering smoke tests (`assert "<marker>" in response.text`) plus manual browser verification.
- **The user is Chinese-speaking** (sample prompts in the spec/mockups use 中文). The intent classification dataset format expects Chinese text.
