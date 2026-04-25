# Resilient Chat (chat-site)

Pluggable, multi-turn chat application built on Next.js + the OpenAI Agents SDK,
backed by a LiteLLM-compatible endpoint. Streams typed NDJSON events with
server-side `<think>`-tag reasoning extraction.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- `@openai/agents` 0.8.x via a LiteLLM-compatible OpenAI base URL
- Node 22, pnpm
- Vitest (unit) + Playwright (E2E)

## Getting started

```bash
nvm use
corepack enable pnpm
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test          # unit (Vitest)
pnpm test:e2e      # multi-turn E2E (requires a live LLM endpoint)
pnpm build
```

## Environment contract

Required:
- `OPENAI_BASE_URL` — OpenAI-compatible endpoint (e.g. LiteLLM)
- `OPENAI_API_KEY`
- `DEFAULT_MODEL`

Optional:
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` — server-side traces (URLs never sent to the browser)
- `DEMO_REQUEST_BUDGET` — per-process request budget, default 50 / minute
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`, default `info`
- `LOG_DIR` — log target dir, default `logs/` locally
- `LOG_FILE_ENABLED` — `true` | `false`. Defaults to `true` locally, `false` on Vercel (filesystem is read-only outside `/tmp`)

## Adding a new agent

1. Create `lib/prompts/<id>.ts` exporting a `PromptSpec`.
2. Register it in `lib/prompts/index.ts`.
3. Create `lib/agents/<id>.ts` exporting an `AgentSpec` that references the prompt id and any tool ids.
4. Register the agent in `lib/agents/index.ts`.

The picker auto-discovers all agents from `GET /api/agents`. No edits to `route.ts` or `run-agent.ts` are needed.

## How `<think>` parsing works

When the model emits `<think>...</think>` (DeepSeek-R1, QwQ, Qwen3-thinking — supported when LiteLLM passes through the tags), the server-side parser splits each chunk into ordered `thinking` / `answer` segments and emits them as typed `thinking_delta` and `answer_delta` events. The UI auto-collapses the thinking section to "Show thinking (Xs)" once the answer starts.

On non-reasoning models, no `<think>` tags are emitted and the thinking block simply doesn't render — graceful no-op.

## Architecture

- **Server** (`app/api/chat/route.ts`) — stateless. Validates `{ messages, agentId }`, resolves the agent from the registry, runs it with full history, streams typed NDJSON events.
- **Client** (`app/page.tsx`) — holds `messages: ConversationMessage[]` in a reducer (`lib/chat/page-reducer.ts`). Sends the full array each turn.
- **Logger** (`lib/logging/index.ts`) — JSON-line console + file logger. Server-side only.

See `docs/superpowers/specs/2026-04-25-chat-site-modular-architecture-design.md` for the full design.

## Limitations

- No history compaction. Long threads will eventually hit model context limits — click "+ New chat".
- No server-side persistence; reload resets the conversation.
- File logging is best-effort. On Vercel, default to console-only.
