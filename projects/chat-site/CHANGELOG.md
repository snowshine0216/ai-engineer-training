# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] — 2026-04-25

### Features
- Pluggable sub-modules: `lib/agents/`, `lib/prompts/`, `lib/tools/` registries (general + qa-coach agents shipped; tools registry is an empty scaffold)
- Multi-turn conversation history — single in-memory thread, reload resets
- Header agent picker with "+ New chat" reset button; picker locks after the first message
- Server-side `<think>...</think>` tag parser splits reasoning content from the answer; UI auto-collapses thinking section on first answer delta with "Show thinking (Xs)" toggle
- Server-side JSON-line logger (`lib/logging`) — console + `logs/app.log`, level-filtered, fail-once-and-disable on file errors
- New `GET /api/agents` route returns the public agent list
- `POST /api/chat` accepts `{ messages, agentId }` with full message-array validation; returns 404 on unknown `agentId`
- Stream protocol: `accepted` carries `agentId`, new `thinking_delta` event, `done` may carry `usage`

### Removed
- `DEMO_MODE` env var, demo-mode failure injection, interruption banner
- Two-pane right rail (timeline + trace card + status chip)
- `lib/chat/run-demo.ts` (renamed and rewritten as `run-agent.ts`)
- `TraceEvent`, `InterruptedEvent`, `AttemptText`, `Status` types from the stream-event union

### Tests
- New: think-parser exhaustive tests (cross-chunk byte slicing, malformed tags, multiple blocks, unicode)
- New: agents/prompts/tools registry tests; logger file/console tests; agents API GET test; multi-turn E2E spec
- Removed: run-demo tests, route demo-mode tests, interview happy-path / forced-retry-recovery E2E specs

### Notes
- Vercel filesystem is read-only outside `/tmp`. The logger defaults to console-only when `process.env.VERCEL=1`. Set `LOG_FILE_ENABLED=true` and `LOG_DIR=/tmp/logs` to opt in (logs are ephemeral per cold-start).
- Multi-agent handoffs, server-side persistence, multi-conversation sidebar, in-browser log viewer, and history compaction remain deferred.

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
