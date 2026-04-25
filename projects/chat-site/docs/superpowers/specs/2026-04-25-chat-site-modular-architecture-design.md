# chat-site v0.3.0 — Pluggable agents, multi-turn chat, server-side logs

**Status:** approved (2026-04-25)
**Supersedes:** v0.2.0 single-shot demo architecture
**Stack constraint:** OpenAI Agents SDK (`@openai/agents`) — unchanged

## 1. Goal

Evolve the v0.2.0 "Resilient Chat Demo" into a real-product-feel chat application:

- Pluggable sub-modules for agents, prompts, and tools (no longer hardcoded to a single `demo-agent`).
- Multi-turn conversation history (single in-memory thread, resets on reload).
- UI that separates per-turn "thinking" (reasoning content) from the final answer, with continuous follow-up Q&A.
- Server-side logger module (console + file), no log UI in the browser.
- The two-pane "right rail" (timeline + trace card) is gone — full-width chat scrollback.

Out of scope: multi-conversation sidebar, server-side persistence, multi-agent handoffs, working tools (registry ships empty), in-browser log viewer, history compaction, async log writes.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| History scope | Single thread, in-memory only, reload resets |
| Agent selection | UI picker; switching = new thread; locked after first message |
| "Thinking" semantics | Reasoning content extracted from inline `<think>...</think>` tags (DeepSeek-R1 / QwQ / Qwen3-thinking pattern), parsed server-side |
| Tools | Registry scaffold only; ships empty |
| Logs | Server-side only — console + `logs/app.log`; gitignored; no UI surface |
| Thinking UI | Auto-collapses to "Show thinking (Xs)" toggle on first answer delta |
| Picker placement | Header; locked after first message; "+ New chat" resets |
| Demo mode | Removed (env var, fake-failure injection, banner) |
| Retry on transient errors | Kept; silent (subtle inline indicator, no banner) |
| Multi-agent handoffs | Deferred |

## 3. Architecture

Two layers, simple boundary:

- **Server** (Next.js App Router, stateless): `POST /api/chat` accepts `{ messages, agentId }`, looks up the spec in the agent registry, runs it via the Agents SDK with the full message history, streams typed NDJSON events. All `console.log` calls go through the logger module which mirrors to `logs/app.log`.
- **Client** (React, `"use client"`): holds `messages: ConversationMessage[]` in component state via reducer. Sends the full array + chosen `agentId` each turn. Renders scrollback.

History lives only in the client. The server is stateless — Vercel-friendly.

## 4. Module layout

```
lib/
  agents/
    types.ts             AgentSpec, AgentId
    index.ts             AGENT_REGISTRY, listAgents, getAgent, buildAgent
    public.ts            client-safe view: { id, name, description }[]
    general.ts           default agent
    qa-coach.ts          second agent (validates registry has >1 entry)
  prompts/
    types.ts             PromptId
    index.ts             PROMPT_REGISTRY, getPrompt
    general.ts
    qa-coach.ts
  tools/
    types.ts             ToolSpec
    index.ts             TOOL_REGISTRY (empty), getTool, toSDKTool
    README.md            "how to add a tool"
  chat/
    run-agent.ts         (was run-demo.ts) takes AgentSpec + messages
    think-parser.ts      stateful <think>...</think> tag parser
    errors.ts            classifyError moved here from run-demo.ts
    stream-event.ts      extended union (added thinking_delta; removed trace, interrupted)
    history.ts           ConversationMessage type
    page-reducer.ts      rebuilt for multi-turn (file is currently missing in worktree)
    budget.ts            unchanged
  ai/
    openai-provider.ts   unchanged; debug fetch wrapper switched to logger.debug
  config/
    env.ts               DEMO_MODE removed; LOG_LEVEL, LOG_DIR, LOG_FILE_ENABLED added (all optional, defaults)
  logging/
    index.ts             logger module: console + file
  telemetry/
    langfuse.ts          unchanged (URL no longer surfaced to client)

components/chat/
  agent-picker.tsx       NEW
  message-list.tsx       NEW (scrollback container)
  message-bubble.tsx     NEW (user + assistant variants)
  thinking-block.tsx     NEW (collapsible reasoning section)
  composer.tsx           tweaked (pinned at bottom, follow-ups during conversation)
  starter-prompts.tsx    tweaked (only on empty thread)

app/page.tsx             rewritten — single-pane chat
app/api/chat/route.ts    extended — accepts {messages, agentId}; rejects unknown agent
app/api/agents/route.ts  NEW — GET returns public agent list

logs/                    (gitignored)
.gitignore               +/logs, *.log
```

**Deleted**: `components/chat/timeline-rail.tsx`, `trace-card.tsx`, `interruption-banner.tsx`, `status-chip.tsx`.

## 5. Data flow (one turn)

1. User types prompt in `Composer` (or selects starter prompt). Picks agent if first message.
2. Reducer appends `{role:"user", content:prompt}` to `messages`, locks agent picker, marks status `running`.
3. Client `POST /api/chat` with `{ messages, agentId }`.
4. Server validates body (zod), resolves `agentId` against `AGENT_REGISTRY` (404 if unknown), `checkBudget`, then `validateProviderAuth` (pre-flight HTTP — surfaces 401/404/500 before stream starts).
5. Server creates Langfuse trace (server-side only — URL never sent to client).
6. Server `runAgent({ spec, messages, emit, signal, env })`:
   - `buildAgent(spec, env)` constructs SDK `Agent` from prompt + tools + model.
   - `messages: ConversationMessage[]` is mapped to the SDK's input shape via `toAgentInput(messages)` in `lib/chat/history.ts` — a pure function that converts `{role, content}` entries to `AgentInputItem[]`. Assistant messages contribute their answer text only (the `thinking` field is UI-only and not sent back to the model).
   - `runner.run(agent, toAgentInput(messages), { stream: true, signal })`.
   - Each text chunk fed through `thinkParser.feed(chunk)` which emits ordered `{kind:"thinking"|"answer", text}` segments. The parser buffers when output ends with bytes that could be a partial tag, only flushing once disambiguated.
   - Each segment becomes a typed `thinking_delta` or `answer_delta` event.
   - Transient errors (`status===429`, 5xx, timeout, network) → `retrying` event, retry up to 2x. Hard errors → `failed`, end of stream.
7. After `runAgent` returns: emit `done`, flush Langfuse, close stream.
8. Client accumulates `thinking_delta` → `message.thinking`, `answer_delta` → `message.content`. On first `answer_delta`, thinking auto-collapses to a "Show thinking (Xs)" pill where `X` is wall-clock seconds from first thinking delta to first answer delta.
9. On `done`: status `"done"`. Composer re-enables. On `failed`: inline error in the assistant bubble with `↻ Retry` icon (re-submits the last user turn).

## 6. Stream event protocol

Extended `StreamEvent` discriminated union:

```ts
type AcceptedEvent      = { kind: "accepted",       eventId, attemptId: 1, agentId, ts };
type ThinkingDeltaEvent = { kind: "thinking_delta", eventId, attemptId, ts, delta };  // NEW
type AnswerDeltaEvent   = { kind: "answer_delta",   eventId, attemptId, ts, delta };
type RetryingEvent      = { kind: "retrying",       eventId, attemptId, nextAttemptId, ts, reason, code? };
type RecoveredEvent     = { kind: "recovered",      eventId, attemptId, fromAttemptId, ts };
type DoneEvent          = { kind: "done",           eventId, attemptId, ts, usage? };
type FailedEvent        = { kind: "failed",         eventId, attemptId, ts, message, retryable };
```

**Removed**: `trace` (no UI surface), `interrupted` (client synthesizes its own end-state on AbortError).

`accepted` carries the resolved `agentId` so the UI can label the bubble as soon as the turn starts.

## 7. Registry contracts

```ts
// lib/agents/types.ts
type AgentSpec = {
  id: string;            // url-safe, e.g. "general"
  name: string;          // display name
  description: string;   // shown under picker option
  promptId: PromptId;
  toolIds: ToolId[];
  model?: string;        // overrides env DEFAULT_MODEL
};

// lib/agents/index.ts (server-only)
export const AGENT_REGISTRY: Record<string, AgentSpec> = { ... };
export const listAgents  = (): AgentSpec[] => Object.values(AGENT_REGISTRY);
export const getAgent    = (id: string): AgentSpec | undefined => AGENT_REGISTRY[id];
export const buildAgent  = (spec: AgentSpec, env: ServerEnv): Agent => new Agent({
  name:         spec.name,
  instructions: getPrompt(spec.promptId),
  model:        spec.model ?? env.DEFAULT_MODEL,
  tools:        spec.toolIds.map(getTool).filter(Boolean).map(toSDKTool),
});

// lib/agents/public.ts (client-safe)
export type PublicAgent = { id: string; name: string; description: string };
export const toPublic = (spec: AgentSpec): PublicAgent => ({ id: spec.id, name: spec.name, description: spec.description });
```

The client receives `PublicAgent[]` only — `promptId` and `toolIds` stay server-internal. The picker is populated from `GET /api/agents` (server returns `listAgents().map(toPublic)`).

## 8. UI layout

```
┌────────────────────────────────────────────────────────────────┐
│ Resilient Chat       Agent: [General ▾]   [+ New chat]         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────┐                 │
│  │ You                                       │ ◀ user, right  │
│  │ what's CAP theorem?                       │   aligned      │
│  └──────────────────────────────────────────┘                 │
│                                                                │
│  ┌──────────────────────────────────────────┐                 │
│  │ General                                   │                 │
│  │ ▸ Show thinking (3.2s)                    │ ◀ collapsed   │
│  │                                           │                 │
│  │ CAP states that a distributed system…     │                 │
│  └──────────────────────────────────────────┘                 │
│                                                                │
│  [auto-scrolls to newest as deltas stream in]                 │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐  [Send]         │
│  │ ask a follow-up…                          │                 │
│  └──────────────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────┘
```

Behaviors:

- **Empty state**: `StarterPrompts` shown above composer; agent picker editable; composer placeholder "Ask anything…"
- **First user message**: picker disables; "+ New chat" button appears next to it. Clicking "New chat" clears `messages`, re-enables picker.
- **Thinking block**: while reasoning is streaming, expanded with cursor. First `answer_delta` arrives → animates collapse to "Show thinking (Xs)" pill. User can re-expand.
- **Silent retry**: subtle `↻` indicator below the assistant header (no banner, no modal). On `recovered`, indicator disappears.
- **Failed state**: red-bordered assistant bubble, inline message, `↻ Retry` icon → re-submits the last user message as a fresh turn.
- **Auto-scroll**: on every delta, scroll only if user is already pinned within 80px of bottom — don't fight the user reading scrollback.
- **Agent name on bubble**: each assistant `MessageBubble` displays the agent's display name. The wire `accepted` event carries `agentId`; the client looks up the name from the `PublicAgent[]` list it loaded from `/api/agents` at page mount. The list is held in a top-level state slice keyed by `id`.

## 9. Logger module

```ts
// lib/logging/index.ts
type LogLevel = "debug" | "info" | "warn" | "error";

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
```

- One JSON line per call: `{ts, level, msg, ...meta}`.
- Console: `console.log/warn/error` per level.
- File: `fs.appendFileSync(path.join(LOG_DIR, "app.log"))` after `fs.mkdirSync(LOG_DIR, {recursive:true})`. Sync write — simplest, off the request hot path. File-write errors are caught and silently disable subsequent file writes for the lifetime of the process (so a single failure doesn't burn CPU on retries every request); the failure is reported once via `console.error`.
- **Env-driven defaults**:
  - `LOG_LEVEL` filters output (default `info`).
  - `LOG_DIR` overrides target dir.
  - `LOG_FILE_ENABLED` — `"true"` / `"false"`, default `"true"` locally, default `"false"` on Vercel (detected via `process.env.VERCEL === "1"`).
  - On Vercel, the project filesystem is read-only outside `/tmp`. If a deploy wants file logs, set `LOG_FILE_ENABLED=true` and `LOG_DIR=/tmp/logs` (logs are then ephemeral per cold-start invocation). Default behavior on Vercel is console-only.
- `lib/ai/openai-provider.ts` debug fetch wrapper switched to `logger.debug` (gated by `LOG_LEVEL=debug`). Existing `console.log` calls in `run-agent.ts` migrated to structured `logger.info` / `logger.error` with meta fields (`{attemptId, model, error, status}`).
- `.gitignore`: append `/logs/` and `*.log`.

## 10. Migration notes

**Removed**:
- `DEMO_MODE` env var, demo-mode toggle path in `route.ts`, `DemoInjectedFailure` class.
- `lib/chat/run-demo.ts` (renamed to `run-agent.ts`; signature changes from `{prompt, model, demoMode, emit, signal}` to `{spec, messages, emit, signal, env}`).
- `components/chat/timeline-rail.tsx`, `trace-card.tsx`, `interruption-banner.tsx`, `status-chip.tsx`.
- `app/page.tsx` rewritten end-to-end.

**Reused unchanged**:
- `lib/ai/openai-provider.ts` (debug fetch routes through logger)
- `lib/chat/budget.ts`
- `lib/telemetry/langfuse.ts` (still emits traces; URL no longer surfaced)
- Pre-flight `validateProviderAuth` and HTTP-status-mapping in `route.ts`

**Rebuilt**:
- `lib/chat/page-reducer.ts` — currently absent on disk but referenced by `app/page.tsx` and `timeline-rail.tsx`. The new reducer replaces both the missing file and the old single-shot model with a multi-turn `messages[]` model. No legacy reducer tests to preserve.

**Versioning**:
- Bump `package.json` to `0.3.0`. CHANGELOG entry. README documents agent registry, picker, and removed env vars.

## 11. Test strategy

- `tests/lib/chat/think-parser.test.ts` — unit, exhaustive: tag-split-across-chunks down to 1-byte slices, no `<think>`, only `<think>` then EOF, multiple blocks, malformed (open without close, close without open), unicode inside tags, empty buffer.
- `tests/lib/agents/registry.test.ts` — every spec's `promptId` resolves; every `toolId` resolves (or registry is empty); ids unique; `toPublic` strips server-only fields.
- `tests/lib/chat/run-agent.test.ts` — agent dispatch from spec, history passthrough, retry loop preserved, demo-mode path gone, `signal.aborted` propagates.
- `tests/lib/logging/index.test.ts` — file write, mkdir idempotent, level filter, JSON shape, swallows file-write errors.
- `tests/app/api/chat/route.test.ts` — extended: rejects unknown `agentId` (404), validates `messages` array shape, returns 401/404/500 from pre-flight unchanged.
- `tests/app/api/agents/route.test.ts` — GET returns public projection only (no `promptId`, no `toolIds`).
- `tests/e2e/multi-turn.spec.ts` — Playwright: send 3 turns, verify 6 bubbles in scrollback, picker locks after first send, thinking auto-collapses on answer start, "+ New chat" resets thread.

Coverage target: maintain ≥90% per the v0.2.0 baseline.

## 12. Risks & open questions

- **Model dependency for `<think>` tags** — only certain models emit them (DeepSeek-R1, QwQ, Qwen3-thinking via LiteLLM). With a vanilla GPT model, the thinking block never renders. Design handles this gracefully (no `thinking_delta` → no block). README documents which models exercise the feature.
- **Tag boundary across chunks** — `think-parser` must buffer up to 7 bytes (length of `</think>`) when output ends with bytes that could begin a tag, only flushing once disambiguated. Covered by exhaustive unit tests.
- **Token blowup on long threads** — no compaction in v0.3. Long threads may eventually hit model context limits. Mitigation: user clicks "+ New chat". Documented limitation.
- **Vercel filesystem read-only** — Vercel disallows file writes outside `/tmp`. Logger defaults to console-only when `process.env.VERCEL` is set; opt-in file logging requires `LOG_DIR=/tmp/logs`. Durable observability lives in Langfuse, not files.
- **No upstream cancel on client disconnect** — pre-existing TODOS.md item; deferred again.
- **Reducer rebuilt from scratch** — current `page-reducer.ts` is missing on disk; the rewrite reconstructs it for the new `messages[]` model. No old tests of this reducer to preserve.

## 13. Acceptance criteria

The implementation ships when:

- [ ] User can pick an agent from a header dropdown populated by `/api/agents`.
- [ ] After sending the first message, picker is locked; "+ New chat" button resets the thread and re-enables the picker.
- [ ] Multi-turn conversation: the user can ask follow-up questions and the assistant has the prior turns in context.
- [ ] Reload clears the thread (no persistence).
- [ ] When the model emits `<think>...</think>`, the UI shows reasoning above the answer; on first answer delta, thinking collapses to "Show thinking (Xs)" toggle.
- [ ] No right-pane trace card or timeline rail in the UI.
- [ ] Server-side logger writes JSON lines to console and `logs/app.log` (when `LOG_LEVEL` allows).
- [ ] `logs/` is gitignored; no log files committed.
- [ ] `lib/agents/`, `lib/prompts/`, `lib/tools/` exist as registries; adding a new agent requires only adding files to those directories (no edits to `route.ts` or `run-agent.ts`).
- [ ] `DEMO_MODE` env var is gone; transient retry remains silent (no banner).
- [ ] Test coverage ≥ 90%; all green; Playwright multi-turn E2E green.
- [ ] `package.json` bumped to `0.3.0`; CHANGELOG and README updated.
