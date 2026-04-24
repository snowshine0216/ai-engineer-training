# Handoff Document
*Last updated: 2026-04-24*

## Goal

Build a Vercel-ready, interview-demo-quality split-screen chat app (`projects/chat-site`) that proves resilient AI workflow — not just a chat wrapper. The memorable demo moment: user sends one messy prompt, the system retries visibly, recovery is shown live, and a Langfuse trace link surfaces as evidence.

## Current Progress

- **Brainstormed and reviewed** a full product spec (office-hours → eng-review → design-review). All reviews cleared (0 critical gaps, design score 9/10).
- **Plan written and saved** to `docs/superpowers/plans/2026-04-24-resilient-chat-demo.md` in this worktree. The plan is comprehensive: 10 tasks, ~60 TDD steps, real code in every step — nothing left as TBD.
- **Existing scaffold** already in place:
  - `lib/config/env.ts` — Zod env schema (needs simplification per Task 2)
  - `lib/ai/openai-provider.ts` — DI-injected OpenAI provider (needs simplification per Task 3)
  - Passing unit tests: `tests/lib/config/env.test.ts`, `tests/lib/ai/openai-provider.test.ts`
  - `@openai/agents` v0.8.5 already installed
  - No `app/api/chat/route.ts` yet, no UI components yet, no Langfuse
- **SDK streaming API confirmed** from reading `node_modules`:
  - `run(agent, prompt, { stream: true })` → `Promise<StreamedRunResult>`
  - `streamedResult.toTextStream({ compatibleWithNodeStreams: true })` → Node.js `Readable` of text chunks
  - `streamedResult.completed` → `Promise<void>` when done

## What Worked

- Reading `node_modules/@openai/agents-core/dist/result.d.ts` directly to get exact streaming API types — avoids guessing.
- DI pattern in `openai-provider.ts` (inject `setDefaultOpenAIClient`, `setOpenAIAPI`, etc.) makes the provider fully testable without network calls.
- Mocking `@openai/agents` at the module level in Vitest + faking `toTextStream()` as an async generator — clean isolation for run-demo tests.
- NDJSON over a single `ReadableStream` (not SSE, not polling) keeps the transport simple and avoids split-brain state.

## What Didn't Work

- Nothing failed in this session — it was planning-only. The plan itself exists to avoid pitfalls discovered in eng/design review:
  - **Don't use a second timeline channel or polling sidecar** — one ordered stream only
  - **Don't expose demo-mode as a public toggle** — gate behind `DEMO_MODE` env flag
  - **Don't block the HTTP response on Langfuse flush** — bounded 3-second timeout, then swallow

## Next Steps

1. **Execute the plan** using `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. The plan is at `docs/superpowers/plans/2026-04-24-resilient-chat-demo.md`.
2. **Start with Task 1** (rename product copy) — it's 4 steps, no TDD, low risk, fast win.
3. **Task 2 (env) and Task 3 (provider)** are CRITICAL regressions — do these before any new logic.
4. **Task 5 (run-demo)** is the most complex — mock `@openai/agents` at the module level using `vi.mock`, fake `toTextStream` as an async generator.
5. Before Task 8 (UI), run `pnpm dev` with a real `.env.local` to smoke-test the API route.
6. E2E tests (Task 9) require `.env.local` with real keys. `DEMO_MODE=true` for the retry-recovery path.

## Key Files & Locations

| File | Status | Notes |
|------|--------|-------|
| `docs/superpowers/plans/2026-04-24-resilient-chat-demo.md` | ✅ Written | Full implementation plan — start here |
| `lib/config/env.ts` | Needs simplification (Task 2) | Remove OPENAI_API_MODE, OPENAI_AGENTS_ENABLE_TRACING; add DEMO_MODE |
| `lib/ai/openai-provider.ts` | Needs simplification (Task 3) | Hardcode chat_completions, remove tracing branches |
| `lib/chat/stream-event.ts` | Not created yet (Task 4) | StreamEvent discriminated union wire contract |
| `lib/chat/run-demo.ts` | Not created yet (Task 5) | Core orchestration: Agent, run(), retry, demo injection |
| `app/api/chat/route.ts` | Not created yet (Task 6) | POST route, NDJSON stream, request budget |
| `lib/telemetry/langfuse.ts` | Not created yet (Task 7) | Trace + noop fallback + bounded flush |
| `components/chat/` | Not created yet (Task 8) | All UI components |
| `app/page.tsx` | Placeholder (Task 8) | Full split-screen shell, stream consumer |
| `tests/lib/chat/run-demo.test.ts` | Not created yet (Task 5) | Unit tests for orchestration |
| `tests/app/api/chat/route.test.ts` | Not created yet (Task 6) | Route integration tests |
| `tests/lib/telemetry/langfuse.test.ts` | Not created yet (Task 7) | Telemetry unit tests |
| `tests/e2e/` | Not created yet (Task 9) | Playwright browser tests |

## Context & Notes

- **Worktree:** `projects/chat-site/.claude/worktrees/funny-rosalind-e377ce` on branch `claude/funny-rosalind-e377ce`. Main branch is `main`.
- **Package manager:** `pnpm`. Run commands from `projects/chat-site/`.
- **Runtime:** Node.js 22 (not edge). The route uses `export const runtime = "nodejs"` — required for `@openai/agents` `Readable` stream support.
- **`langfuse` package not yet installed** — Task 7 Step 1 runs `pnpm add langfuse`.
- **`@playwright/test` not yet installed** — Task 9 Step 1 installs it.
- **Env override pattern:** `@openai/agents` uses a global singleton for the OpenAI client. `initializeOpenAIProvider(env)` must be called once per route handler (not module-level) to set `baseURL`/`apiKey` for each request.
- **Demo mode:** `DEMO_MODE=true` in `.env.local` injects a fake failure before attempt 1's first token — no network call is made for attempt 1, so the demo path is deterministic.
- **Design system:** CSS custom properties in `globals.css`, Geist Sans / Geist Mono fonts, no shadcn/no Tailwind by design — keeps the bundle lean and the UI easy to audit.
- **The spec:** `/Users/snow/.copilot/session-state/d6b256cf-16da-4bae-819d-8942d29aae24/plan.md` is the original brainstorm doc if you need to re-read requirements.
