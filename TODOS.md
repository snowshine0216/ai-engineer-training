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
