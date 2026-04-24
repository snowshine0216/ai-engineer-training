# TODOs

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

- [ ] **Client disconnect doesn't cancel upstream model run** — if the user navigates away, `runDemo` keeps running and consuming tokens. Fix: pass `AbortSignal` through to `@openai/agents` `run()` via `ReadableStream`'s `cancel()` callback.
- [ ] **Broken stream leaves UI in `running` forever** — no guaranteed terminal event verification on the client. Consider a keepalive/heartbeat or a client-side timeout.
- [ ] **`initializeOpenAIProvider()` mutates global SDK singleton per request** — concurrent warm-instance requests could race on the shared SDK config. Fix: create a per-request provider instance.
- [ ] **Budget is per-worker on Vercel** — multiple warm instances multiply the effective budget. Consider a shared store (KV, Redis) for true rate limiting.
- [ ] **Retry button ignores Retry-After header** — client should delay the retry by the server-specified seconds.
