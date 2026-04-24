# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] — 2026-04-24

### Features
- Split-screen streaming chat UI with resilient state machine (`accepted → retrying → recovered → done/failed`)
- NDJSON streaming route (`/api/chat`) with per-process request budget and 429 guard
- `runDemo` orchestration with automatic retry on transient errors and demo-mode injection
- StreamEvent discriminated union wire contract
- Langfuse trace surface with bounded flush and noop fallback
- OpenAI Agents SDK integration via custom endpoint provider

### Security
- Sanitize `traceUrl` href — reject non-`https://` values before rendering as link
- Add `X-Content-Type-Options: nosniff` header on all streaming responses
- Prompt size cap: 4 000-character limit (server schema + client `maxLength`)
- Mask internal error details in `classifyError` catch-all
- LANGFUSE_HOST trailing-slash normalization prevents double-slash trace URLs

### Tests
- 92 % unit coverage across 10 vitest test files (78 tests)
- Playwright config + E2E interview-path tests
- `resetBudget()` export for deterministic rate-limit tests
- Coverage audit: 5 new test files covering route safety net, page reducer, run-demo branches, env validation, Langfuse edge cases

### Fixes
- Move Langfuse `flush()` before `controller.close()` — prevents Vercel from terminating before telemetry lands
- `classifyError` now checks `err.status === 429` before substring matching
- TraceCard no longer shows "Trace pending…" permanently after run completes without Langfuse configured
- `!state.winningAttemptId` falsy check replaced with strict `=== null` guard
- `@keyframes pulse` injected directly in `TimelineRail` — removes implicit coupling to `StatusChip`
- Google Fonts combined into a single `@import` request (was two round-trips)
- `.chat-main` layout moved to `globals.css` class — removes `!important` workaround
- Skip-link moved to CSS class; unused `<style>` block removed from `page.tsx`
- Removed unused `useRef` / dead `textareaRef` from `Composer`
- Added comment clarifying `FailedEvent` dual use (server `failed` vs client-only `interrupted`)

### Chores
- `vercel.json` with `maxDuration: 60` for streaming function
- Production build verified
- Handoff document added
