# Handoff Document
*Last updated: 2026-04-26 12:23:27 CST*

## Goal

Design and then implement a customer-service multi-agent workflow in `projects/chat-site` for the exercise in `/Users/snow/Documents/Repository/ai-engineer-training/projects/project1_2/项目描述.txt`.

The user explicitly chose the existing Next.js/TypeScript `chat-site` app and required OpenAI Agents SDK only. AutoGen, LangChain, or any other agent framework are out of scope.

## Current Progress

- Reviewed the project description. Original prompt says AutoGen, but the user overrode it with “only OpenAI Agents SDK.”
- Reviewed the existing `chat-site` repo. It is a Next.js 16 + React 19 + TypeScript app using `@openai/agents`, with existing agent registry, streaming chat route, tool registry, Vitest tests, Playwright config, and prior specs under `docs/superpowers/specs/`.
- Used `superpowers:brainstorming` and completed the design workflow up through spec creation.
- User chose target option 1: integrate into the existing `chat-site` app.
- User decided missing order number behavior: ask the user for an order number first, with no SDK/model call.
- User decided trace visibility: read a flag from `.env`, default on. If on, show agent interactions in chat UI. If off, keep trace details only in server logs/traces.
- User approved architecture approach A: a manager agent with specialist agents exposed as OpenAI Agents SDK tools.
- User clarified SQLite should be used as the real production DB for orders/logistics, not just a mock fixture, with tests using the same schema.
- Wrote and committed the design spec:
  - `docs/superpowers/specs/2026-04-26-customer-service-multi-agent-design.md`
  - commit `6d34351 docs: design customer service multi-agent workflow`
- The spec locks in:
  - `CustomerServiceManager` as user-facing manager.
  - Agent A: `OrderStatusAgent`.
  - Agent B: `LogisticsAgent`.
  - Agent C: `ReplySynthesisAgent`.
  - Specialists exposed through `agent.asTool()`.
  - SQLite repository abstraction.
  - `SHOW_AGENT_TRACE=true` default.
  - deterministic order-number preflight.
  - retry policy for transient internal lookup failures.
  - compact `agent_trace` UI timeline.

## What Worked

- The existing app already has `@openai/agents`, `Runner.run(..., { stream: true })`, agent registry, stream events, and tests, so adding a new customer-service agent fits the repo structure.
- The “manager plus agents-as-tools” pattern matches the assignment’s Agent A/B/C requirement while keeping a single coherent customer-facing reply.
- The spec uses OpenAI Agents SDK docs for agents-as-tools, streaming, and tracing:
  - https://openai.github.io/openai-agents-js/guides/tools/#4-agents-as-tools
  - https://openai.github.io/openai-agents-js/guides/streaming/
  - https://openai.github.io/openai-agents-js/guides/tracing/
- SQLite is viable if production is a persistent Node host with a writable disk. The spec isolates it behind a repository interface so hosted SQLite/libSQL can replace file SQLite later.

## What Didn't Work

- The OpenAI developer docs MCP was not available through the current tool surface even after adding the MCP server with `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`. Official web docs were used instead.
- `node_modules/@openai/agents` was not present in this checkout, so local SDK type inspection with `rg node_modules/@openai/agents` failed. The design relies on official SDK docs and existing app imports instead.
- The `/context-save` attempt was interrupted before it wrote a checkpoint file. Do not assume a gstack checkpoint exists for this exact point.

## Next Steps

1. Ask the user to review and approve `docs/superpowers/specs/2026-04-26-customer-service-multi-agent-design.md`.
2. After approval, invoke `superpowers:writing-plans` as required by the brainstorming workflow. Do not jump straight to implementation.
3. Build the implementation plan from the committed spec, with TDD ordering:
   - order-number extraction tests first.
   - SQLite schema/repository tests with temp DB.
   - retry tests.
   - trace normalizer/reducer tests.
   - agent wiring tests.
   - route tests for missing order number and trace flag.
   - UI timeline tests.
4. Only after the implementation plan is approved, start code changes.
5. Keep unrelated `AGENTS.md` changes untouched unless the user explicitly asks to modify or revert them.

## Key Files & Locations

- Current project root: `/Users/snow/.codex/worktrees/e986/ai-engineer-training/projects/chat-site`
- Source brief: `/Users/snow/Documents/Repository/ai-engineer-training/projects/project1_2/项目描述.txt`
- Design spec: `/Users/snow/.codex/worktrees/e986/ai-engineer-training/projects/chat-site/docs/superpowers/specs/2026-04-26-customer-service-multi-agent-design.md`
- Handoff file: `/Users/snow/.codex/worktrees/e986/ai-engineer-training/projects/chat-site/HANDOFF.md`
- Relevant existing code:
  - `lib/chat/run-agent.ts`
  - `lib/chat/stream-event.ts`
  - `lib/agents/index.ts`
  - `lib/agents/types.ts`
  - `lib/ai/openai-provider.ts`
  - `app/api/chat/route.ts`
  - `app/page.tsx`

## Context & Notes

- Git is currently on detached `HEAD` at commit `6d34351`.
- `git status --short` showed `M AGENTS.md` before this handoff. That change was pre-existing or user-owned and was intentionally left untouched.
- The design spec was committed before this handoff. `HANDOFF.md` is newly added and may be uncommitted unless the next agent commits it.
- The user prefers the OpenAI Agents SDK only. Be strict about not adding another agent orchestration framework.
- File-based SQLite has a deployment caveat. It is fine for a persistent Node host, VM, or Docker container with a mounted volume. It is not appropriate as durable storage on Vercel/serverless. The spec notes this and points to hosted SQLite/libSQL as the alternative.
- Project instructions require TDD and functional programming style: pure helpers, immutable data flow, explicit dependencies, no mutation of arguments, small modules.
- The next skill in the brainstorming workflow is `superpowers:writing-plans`, but only after the user reviews and approves the spec.
