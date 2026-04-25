# TODOs

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
