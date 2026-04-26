# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] — 2026-04-26

### Fixes
- `amap-weather` / `tavily-search`: wrap `res.json()` in try/catch — returns graceful fallback instead of throwing when upstream returns HTML or malformed JSON (e.g. WAF maintenance pages).
- `city-lookup`: fix `DATA_MAP` to keep the first occurrence of duplicate city names (e.g. `朝阳区` exists in both Beijing and Changchun — last-write-wins was silently returning the wrong city).
- `city-lookup`: guard `findSubstring` against single-char input — `lookupAdcode("市")` previously matched an arbitrary city via the unconstrained `row.name.includes(q)` branch.
- `city-lookup`: lift the 200-entry substring scan cap. The cap was added as a performance guard but it prevented correct matching of common cities (e.g. `北京市` at idx 426, `海淀区` at idx 431) for natural-language queries like `北京海淀区`. Memo bounds the cost instead.
- Performance: replace O(n) linear scans with O(1) `Map` lookups in city-lookup; eliminate redundant `entries()` iteration in TTL cache eviction path.
- Test isolation: `_clearCacheForTest` helpers added to both tools; test fixtures now supply `AMAP_API_KEY` and `TAVILY_API_KEY`.

### Refactors
- Extract `lib/tools/_http.ts` — shared `fetchWithTimeout` and `safeJson` used by `amap-weather` and `tavily-search`. Eliminates ~30 lines of duplicated fetch-with-timeout boilerplate.
- `ToolId` narrowed from `string` to `"amap-weather" | "tavily-search"`. A typo in an agent's `toolIds` array is now a TypeScript compile error instead of a silent runtime `undefined`.
- `ttl-cache`: route all writes through a private `writeEntry` so the `maxSize` invariant lives with the data structure.
- `city-lookup`: extract `LOOKUP_TTL_MS` constant; update Match priority comment block with one concrete example per step.

### Features
- `amap-weather` tool: current conditions or multi-day forecast for any Chinese city via AMap. 10-minute per-process TTL cache, 10 s timeout, graceful Chinese fallback message on error.
- `tavily-search` tool: web search with synthesized answer via Tavily REST API. 30-minute per-process TTL cache (normalized query key), 15 s timeout, graceful fallback.
- `general` agent now registers both tools; system prompt instructs the model to call them only on clear intent (weather / current information) and skip them on greetings and trainable knowledge.
- New `lib/cache/ttl-cache.ts` — tiny generic TTL cache factory (no shared globals).
- New `scripts/build-city-index.mjs` — builds `lib/tools/amap-cities.json` from `data/AMap_adcode_citycode.xlsx` (run via `pnpm build-cities`).
- New required env vars: `AMAP_API_KEY`, `TAVILY_API_KEY`. Validated by `parseServerEnv` at startup.

### Tests
- 33 new unit tests across `ttl-cache`, `city-lookup`, `amap-weather`, `tavily-search`, registry, and env (180 → 192 total).
- All upstream calls fully mocked via `vi.spyOn(global, "fetch")` — no network in the test suite.
- Memo tests strengthened to assert cache size growth (not just value equality).
- Snippet trim assertion pinned to exactly 150 chars + ellipsis; `ttl-cache` overwrite-at-maxSize and `maxSize=1` edge cases added.

### Notes
- Caches are per-Node-process. A Vercel cold start or restart resets them. Multi-instance deployments do not share cache. Acceptable for the homework / single-instance demo; swap in `lru-cache` or KV if memory or hit ratio becomes a concern.
- Tool `execute()` never throws to the SDK — every failure path returns a user-friendly Chinese string. The model relays the message to the user.

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
