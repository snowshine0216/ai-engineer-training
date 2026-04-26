# Handoff Document
*Last updated: 2026-04-25 16:25 CST (GMT+8)*

## Goal

Implement a multi-task QA assistant per the brief at `projects/project1_1/项目描述.txt` — adding two real tools (AMap weather + Tavily search) to the existing `chat-site/` Next.js app. The deliverable lives in `projects/chat-site/`, **not** in `projects/project1_1/` (which has a stale Python scaffold that is intentionally being ignored).

## Current Progress

- **Brainstorming complete.** Three locked decisions:
  1. Agent placement → wire tools into existing `general` agent (no new agent).
  2. City data → build-time JSON (`scripts/build-city-index.mjs` reads `.xlsx` once → `lib/tools/amap-cities.json`).
  3. Tool depth → single weather tool with optional `forecast` flag; search locked to basic + include_answer + 5 results, only `query` exposed; in-memory TTL caching kept.
- **Spec written and self-reviewed**:
  `projects/chat-site/docs/superpowers/specs/2026-04-25-multi-task-qa-tools-design.md` (12 sections).
- **Implementation plan written and self-reviewed**:
  `projects/chat-site/docs/superpowers/plans/2026-04-25-multi-task-qa-tools-plan.md`
  - 8 tasks, ~7 commits, TDD throughout (red → green → commit), bite-sized steps with full code blocks.
  - Tests live under `tests/lib/...` (NOT colocated under `lib/`) — deviates from spec §3 to match `vitest.config.ts` `include: ["tests/**/*.test.ts"]`. Called out explicitly at the top of the plan's File Structure section.
  - Two pre-execution issues caught during self-review and fixed inline:
    1. AMap cache-hit test originally used 北京, colliding with the happy-path test's 北京/base cache entry — would have made `toHaveBeenCalledOnce()` fail. Switched to 杭州.
    2. `tests/lib/agents/registry.test.ts` mocks `@openai/agents` but only stubs `Agent`. After Task 6 wires real tools into `general`, `buildAgent` → `resolveTools` → `amapWeather.toSDKTool()` calls `tool(...)` which is `undefined` under the existing mock. Plan now extends the mock to also stub `tool`.
- **Awaiting**: user picks an execution mode (subagent-driven vs. inline) before code lands.

## What Worked

- Reading the existing chat-site code (`lib/agents/`, `lib/tools/`, `lib/prompts/`, `lib/chat/run-agent.ts`, `lib/ai/openai-provider.ts`, `lib/config/env.ts`) before drafting — the v0.3.0 architecture has tool/agent registries already scaffolded; `lib/tools/README.md` documents how to drop in new tools. The plan leverages all of this with zero changes to `app/` or `components/`.
- Cross-checking the spec against the actual repo structure (vitest config, tsconfig, existing test patterns) caught the colocated-tests issue and the @openai/agents-mock issue **before** writing any code.
- Reading the existing test files for shape (`tests/lib/agents/registry.test.ts`, `tests/lib/config/env.test.ts`) and using exactly that idiom — keeps the new tests visually consistent with the suite.
- One question per turn during brainstorming kept the conversation tight.

## What Didn't Work

- **First-question miss in brainstorming**: I initially assumed the build target was `projects/project1_1/` (Python). The user's first reply corrected me: build into `projects/chat-site/` (Next.js). Lesson encoded for next time: when the user mentions a `.env` from a Next.js project, that's a strong signal the build target is also that Next.js project — treat the source-doc folder as reference material, not the build target.

## Next Steps

1. **User picks execution mode:**
   - **Option A (recommended):** Subagent-driven — invoke `superpowers:subagent-driven-development`. Fresh subagent per task, two-stage review between tasks, fast iteration.
   - **Option B:** Inline — invoke `superpowers:executing-plans`. Execute tasks in the current session with checkpoints.
2. **Execute the plan task-by-task.** Suggested order is the task numbering in the plan:
   - Task 1: `lib/cache/ttl-cache.ts` + tests (pure, zero deps).
   - Task 2: `pnpm add -D xlsx`; copy `.xlsx` to `data/`; write `scripts/build-city-index.mjs`; run it; commit `amap-cities.json`.
   - Task 3: `lib/tools/city-lookup.ts` + tests (pure).
   - Task 4: `lib/tools/amap-weather.ts` + tests (mocked fetch).
   - Task 5: `lib/tools/tavily-search.ts` + tests (mocked fetch).
   - Task 6: register both in `lib/tools/index.ts`; wire into `lib/agents/general.ts`; update `lib/prompts/general.ts` + `lib/config/env.ts`; update three existing tests (tools index, agents registry, env).
   - Task 7: docs (`README.md`, `lib/tools/README.md`, `CHANGELOG.md` 0.4.0, `TODOS.md`); update `.env.example`; add `AMAP_API_KEY` to local `.env`.
   - Task 8: verification gate (`pnpm typecheck && pnpm lint && pnpm test && pnpm build` + manual `pnpm dev` smoke per acceptance criteria).
3. **Open the PR** once all 8 tasks ship green.

## Key Files & Locations

**Created this and prior session:**
- `projects/chat-site/docs/superpowers/specs/2026-04-25-multi-task-qa-tools-design.md` — design spec.
- `projects/chat-site/docs/superpowers/plans/2026-04-25-multi-task-qa-tools-plan.md` — implementation plan (canonical execution reference).

**Source materials (read-only inputs):**
- `projects/project1_1/项目描述.txt` — the brief.
- `projects/project1_1/AMap_adcode_citycode.xlsx` — city dataset to be copied to `projects/chat-site/data/` in Task 2.
- `projects/chat-site/.env` — already has `TAVILY_API_KEY`; needs `AMAP_API_KEY=f3a328d8176dbfe490b1f0d12310d754` added in Task 7.

**Existing chat-site infrastructure to leverage (no edits needed except the targeted ones in Task 6):**
- `projects/chat-site/lib/tools/{types.ts, index.ts, README.md}` — registry pattern.
- `projects/chat-site/lib/agents/{types.ts, index.ts, general.ts}` — agent registry + `buildAgent`.
- `projects/chat-site/lib/prompts/{types.ts, index.ts, general.ts}` — prompt registry.
- `projects/chat-site/lib/chat/run-agent.ts` — runner with retry + streaming + think-parsing (no changes).
- `projects/chat-site/lib/config/env.ts` — zod-validated env schema (Task 6 adds 2 fields).
- `projects/chat-site/lib/logging/index.ts` — structured logger; tools call `getLogger().info/warn(...)`.

## Context & Notes

- **Worktree**: `/Users/snow/Documents/Repository/ai-engineer-training/projects/chat-site/.claude/worktrees/magical-tereshkova-2297b0`
- **Branch**: `claude/magical-tereshkova-2297b0`
- **Working dir for the actual app**: `projects/chat-site/` (pnpm + Node 22 + Next.js 16 + TypeScript 5.9 + `@openai/agents` 0.8.5).
- **Auto mode is active** — minimize interruptions, prefer action.
- **User CLAUDE.md** mandates TDD (red-green-refactor, tests first) and functional programming (small modules of pure functions, no classes-with-mutable-state, immutable data flow). The plan respects this throughout.
- **API keys**:
  - AMap (provided in brief): `f3a328d8176dbfe490b1f0d12310d754`
  - Tavily (already in chat-site `.env`): `tvly-dev-...` (full value in `.env`, not committed).
  - LLM provider in chat-site `.env` is MiniMax (`MiniMax-M2.7`) via OpenAI-compatible base URL.
- **Test convention** — `tests/lib/...` mirrors `lib/...`. Vitest config enforces this via `include: ["tests/**/*.test.ts"]`. The plan reflects this (correcting spec §3's colocated-test sketch).
- **Module-level cache caveat** — both new tools own a module-scope `createTtlCache<string>()`. Tests in the same file share that cache across `it()` blocks; the plan's tests use distinct cities/queries per case to keep cache keys disjoint. If a future test needs to clear cache, expose a `_clearCacheForTest` from the tool module — do NOT add `vi.resetModules()` global hooks (slow + brittle).
- **Out of scope** (per spec §11): persistent / cross-instance cache, dedicated multi-task-qa agent, tool-use UI badges, Playwright additions, fuzzy/pinyin city matching, streaming partial tool output.
- **Repo also has `uv` workspace** at the parent level (`pyproject.toml`, `uv.toml` with Tsinghua mirror) for the Python weeks. Unrelated to this slice — chat-site is its own pnpm subproject.
