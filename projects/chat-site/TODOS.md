# TODOs

## Shipped in 0.5.0

- [x] Customer service multi-agent workflow: order status + logistics info + reply synthesis via OpenAI Agents SDK
- [x] SQLite customer service repository with parameterized queries and full seed data
- [x] Retry policy for transient SQLite errors (SQLITE_BUSY, SQLITE_LOCKED) with exponential backoff and jitter
- [x] Real-time agent trace timeline in the chat UI (`SHOW_AGENT_TRACE` env var)
- [x] `CUSTOMER_SERVICE_DB_PATH` and `SHOW_AGENT_TRACE` added to environment contract
- [x] `run-agent` error handling: customer-service runner now emits `failed` event on throw

## Shipped in 0.4.0
- [x] `amap-weather` tool with 10-min TTL cache and 10 s timeout
- [x] `tavily-search` tool with 30-min TTL cache (normalized query key) and 15 s timeout
- [x] `lib/cache/ttl-cache.ts` — generic in-memory TTL cache factory
- [x] `scripts/build-city-index.mjs` — xlsx → json city/adcode index
- [x] `general` agent registers both tools; prompt gates tool-calling to clear intent

## Shipped in 0.3.0
- [x] Pluggable agent/prompt/tools registries (general + qa-coach agents)
- [x] Multi-turn conversation history with full message-array API
- [x] Header agent picker with per-session lock and "+ New chat" reset
- [x] `<think>` tag parser — splits reasoning from answer, auto-collapses in UI
- [x] Server-side JSON-line logger (console + file, fail-once-and-disable)
- [x] `GET /api/agents` route; `POST /api/chat` accepts `agentId`
- [x] 144 unit tests; multi-turn Playwright E2E spec
- [x] Client disconnect cancels upstream model run via `AbortSignal` through `ReadableStream.cancel()`
- [x] Client-side 65 s timeout guard prevents hung TCP from freezing UI permanently

## Shipped in 0.2.0
- [x] Split-screen streaming chat UI
- [x] NDJSON streaming route with budget guard
- [x] runDemo retry orchestration with demo-mode injection
- [x] Langfuse trace integration with bounded flush
- [x] Playwright E2E tests (interview path)
- [x] 92% unit test coverage (78 tests)
- [x] Security: trace URL sanitization, prompt size cap, X-Content-Type-Options
- [x] Flush before close (Vercel termination race)
- [x] LANGFUSE_HOST trailing-slash normalization
- [x] Strict null check on winningAttemptId
- [x] TraceCard terminal state label

## Known limitations (investigate before production)

- [ ] **`initializeOpenAIProvider()` mutates global SDK singleton** — concurrent warm-instance requests could race on the shared SDK config. Fix: create a per-request provider instance.
- [ ] **Budget is per-worker on Vercel** — multiple warm instances multiply the effective budget. Consider a shared store (KV, Redis) for true rate limiting.
- [ ] **Retry button ignores Retry-After header** — client should delay the retry by the server-specified seconds.
- [ ] **Multi-agent handoffs** — server-side agent routing, multi-conversation sidebar, history compaction, in-browser log viewer remain deferred.
- [ ] **Tool caches are per-process** — Vercel cold starts and multiple warm instances each carry their own cache. Acceptable for single-instance demos; consider Vercel KV / Redis for production.

## Deferred from v0.4.0 (quality / pre-prod)

- [ ] **Prompt injection from tool output** — `formatLives` and `formatResults` interpolate raw upstream fields (AMap response fields, Tavily web snippets) directly into the LLM context. Tavily aggregates adversary-controlled content by design. Consider sanitising `[` `]` `(` `)` and code fences, or wrapping tool output in a `<tool_output>` envelope with a system-prompt instruction to treat it as data, not instructions.
- [ ] **`safeJson` conflates empty body with malformed JSON** — both return `null`; a future caller treating `null` as "empty body OK" will be surprised. Consider `tryParseJson<T>` returning `{ ok: false; reason: "empty" | "parse-error" }` for differentiated handling.
- [ ] **`createTtlCache()` default is `maxSize: Infinity`** — a future caller that forgets to pass `maxSize` gets unbounded memory growth if writes outpace TTL expirations. Consider defaulting to 1000 or making `maxSize` required.
- [ ] **Promote `getTool(id: string)` to two overloads** — `getTool(id: ToolId)` (compile-time safe, no cast) for internal callers + `getTool(id: string)` (explicit unsafe) for HTTP routes, so the narrowing benefit actually reaches agent registry callers.
