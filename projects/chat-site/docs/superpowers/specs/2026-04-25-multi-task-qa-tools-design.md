# chat-site v0.4.0 — Multi-Task QA Tools (AMap weather + Tavily search)

**Status:** draft (2026-04-25)
**Builds on:** v0.3.0 — pluggable agents, multi-turn chat, server-side logs
**Source brief:** `projects/project1_1/项目描述.txt`
**Stack constraint:** OpenAI Agents SDK (`@openai/agents`) — unchanged

## 1. Goal

Add two real tools to the chat-site so the existing `general` agent becomes a multi-task QA assistant:

- **AMap weather** — current conditions (and optional multi-day forecast) for any Chinese city.
- **Tavily search** — web search with synthesized answer for current information / news.

Both are wired into the existing `general` agent. The model decides when to call them based on user intent. Each call is cached per-process so repeat queries within the TTL window skip the upstream API.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Agent placement | Tools attached to existing `general` agent (no new agent) |
| City data source | `AMap_adcode_citycode.xlsx` → built once into `lib/tools/amap-cities.json` |
| Weather tool shape | Single tool, optional `forecast: boolean` arg (default `false` inside execute) |
| Search tool shape | Single tool, only `query` exposed; basic depth + include_answer + max_results=5 hardcoded |
| Caching | In-memory per-process TTL cache; weather 10 min, search 30 min |
| Cache scope | Single Node process; resets on restart; not shared across Vercel instances |
| Tool error policy | `execute()` always returns a string; never throws. User-friendly fallback messages on API failure |
| Network timeout | 10 s for AMap, 15 s for Tavily, via `AbortController` |
| History | Reuse existing chat-site multi-turn pipeline (no changes) |
| Retry | Reuse existing `runAgent` 2-attempt outer loop (no changes) |
| Tool used disclosure | None added — model already mentions which tool it called in its answer; no UI badge |

## 3. Module layout

```
projects/chat-site/
├── data/
│   └── AMap_adcode_citycode.xlsx                NEW (copy from projects/project1_1/, committed)
├── scripts/
│   └── build-city-index.mjs                     NEW (xlsx → json one-shot)
├── lib/
│   ├── cache/                                   NEW directory
│   │   ├── ttl-cache.ts                         NEW
│   │   └── ttl-cache.test.ts                    NEW
│   ├── tools/
│   │   ├── amap-cities.json                     NEW (generated, committed)
│   │   ├── city-lookup.ts                       NEW
│   │   ├── city-lookup.test.ts                  NEW
│   │   ├── amap-weather.ts                      NEW
│   │   ├── amap-weather.test.ts                 NEW
│   │   ├── tavily-search.ts                     NEW
│   │   ├── tavily-search.test.ts                NEW
│   │   ├── index.ts                             EDIT (register both tools)
│   │   └── README.md                            EDIT (document the two tools)
│   ├── agents/
│   │   └── general.ts                           EDIT (toolIds + description)
│   ├── prompts/
│   │   └── general.ts                           EDIT (mention tool capabilities)
│   └── config/
│       └── env.ts                               EDIT (add AMAP_API_KEY, TAVILY_API_KEY)
├── package.json                                 EDIT (devDep: xlsx; script: build-cities)
├── .env.example                                 EDIT (add AMAP_API_KEY, TAVILY_API_KEY)
├── .env                                         EDIT (add AMAP_API_KEY; TAVILY_API_KEY exists)
├── README.md                                    EDIT (env contract; tool list)
├── CHANGELOG.md                                 EDIT (0.4.0 entry)
└── TODOS.md                                     EDIT (move to Shipped)
```

No file in `app/` changes. No file in `components/` changes. The two API routes are untouched.

## 4. Module designs

### 4.1 `lib/cache/ttl-cache.ts`

Tiny generic in-memory TTL store. Module factory; no shared globals. Pure logic except for `Date.now()`.

```ts
export type TtlCache<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V, ttlMs: number) => void;
  delete: (key: string) => void;
  size: () => number;
};

export const createTtlCache = <V>(): TtlCache<V> => { /* Map<string, {value, expiresAt}> */ };
```

- Lazy expiration: `get()` checks `expiresAt < Date.now()` and deletes on miss.
- No background timer; no LRU eviction (homework scope, low cardinality).
- `delete()` exposed for tests.
- Each tool module owns one cache instance via `const cache = createTtlCache<string>()` at module scope. That singleton is the per-process cache.

**Test cases**: hit before expiry, miss after expiry, overwrite resets TTL, delete works, size reflects live entries only.

### 4.2 `lib/tools/city-lookup.ts`

Reads the generated `amap-cities.json` once at import. Pure lookup helpers.

```ts
export type CityMatch = { adcode: string; matched: string };
export const lookupAdcode = (input: string): CityMatch | undefined;
```

Match priority:
1. Exact match on `中文名` (e.g., "北京")
2. Strip trailing "市" / "县" / "区" suffix, then exact match
3. Substring match (input contained in city name, or city name contained in input — first match wins)
4. Return `undefined`

The JSON shape is `Array<{ name: string; adcode: string }>` — only the columns needed; ~3000 entries; one-time deserialization at import.

**Test cases**: exact, suffix-stripped, substring, missing → undefined, whitespace tolerance.

### 4.3 `lib/tools/amap-weather.ts`

```ts
export const amapWeather: ToolSpec = {
  id: "amap-weather",
  toSDKTool: () => tool({
    name: "amap_weather",
    description: "查询中国城市的天气。Look up current weather (or multi-day forecast) for a Chinese city by name.",
    parameters: z.object({
      city: z.string().describe("Chinese city name, e.g. 北京, 上海, 深圳"),
      forecast: z.boolean().optional().describe("If true, return multi-day forecast (4 days from AMap) instead of current conditions"),
    }),
    execute: async ({ city, forecast }) => { /* see flow; default forecast to false inside */ },
  }),
};
```

**Execute flow** (every step returns user-friendly string on failure; no throws to SDK):

1. `lookupAdcode(city)` → on miss return `"未找到 '${city}' 的城市编码，请尝试更具体的中国城市名。"`
2. `cacheKey = `weather:${adcode}:${forecast ? "all" : "base"}\``
3. Check cache — if hit, return cached string.
4. `fetch` AMap API with `key=AMAP_API_KEY&city=adcode&extensions=base|all`, `AbortController` 10 s timeout.
5. Non-2xx or `data.status !== "1"` → `"天气服务暂时不可用，请稍后再试。"`
6. Format response (current: temp/weather/wind/humidity/reporttime; forecast: daily entries from AMap's `forecasts[0].casts[]` — typically today + 3 days).
7. Cache for 10 min, return string.

**Logging**: `logger.info("amap-weather call", { city, adcode, forecast, cacheHit })` on success; `logger.warn("amap-weather failed", { ... })` on error.

**Test cases**: cache hit, cache miss → calls fetch, AMap status=0 returns fallback, network timeout returns fallback, unknown city returns lookup-failure message, forecast flag toggles `extensions=all`. All using `vi.fn()` for fetch; no real network.

### 4.4 `lib/tools/tavily-search.ts`

```ts
export const tavilySearch: ToolSpec = {
  id: "tavily-search",
  toSDKTool: () => tool({
    name: "tavily_search",
    description: "搜索互联网获取最新信息或新闻。Search the web for current information or news.",
    parameters: z.object({
      query: z.string().describe("The search query in any language"),
    }),
    execute: async ({ query }) => { /* see flow */ },
  }),
};
```

**Execute flow:**

1. `key = `search:${normalizeQuery(query)}\`` where `normalizeQuery` lowercases, trims, collapses whitespace.
2. Check cache.
3. `fetch` `https://api.tavily.com/search` POST `{ api_key, query, search_depth: "basic", include_answer: true, max_results: 5 }`, `AbortController` 15 s timeout.
4. Non-2xx → `"搜索服务暂时不可用，请稍后再试。"`
5. Format: `answer` (if present) on top, then numbered list of `title — content snippet — url` (content trimmed to ~150 chars).
6. Cache for 30 min, return string.

**Why call Tavily HTTP directly instead of `tavily-python`?** Repo is TypeScript / Node; the JS package (`@tavily/core`) adds an extra dep with its own surface; the REST API is two fields wide. Direct fetch keeps deps thin and deterministic. (Equivalent to what `tavily-python` does internally.)

**Test cases**: cache hit, miss → fetch called with the right body, 5xx returns fallback, empty results still renders the answer block, query normalization (trailing whitespace, mixed case → same cache key).

### 4.5 `lib/tools/index.ts`

```ts
import { amapWeather } from "./amap-weather";
import { tavilySearch } from "./tavily-search";

export const TOOL_REGISTRY: Record<ToolId, ToolSpec> = {
  [amapWeather.id]: amapWeather,
  [tavilySearch.id]: tavilySearch,
};
```

`getTool`, `listTools`, `toSDKTool` unchanged.

### 4.6 `lib/agents/general.ts`

```ts
export const general: AgentSpec = {
  id: "general",
  name: "General",
  description: "Helpful assistant with weather (AMap) and web search (Tavily) tools.",
  promptId: "general",
  toolIds: ["amap-weather", "tavily-search"],
};
```

The picker shows the new description on next render — no other UI change.

### 4.7 `lib/prompts/general.ts`

Append a tool-use paragraph; keep existing `<think>` instruction.

```ts
export const general: PromptSpec = {
  id: "general",
  text: [
    "You are a helpful assistant. Answer questions clearly and concisely.",
    "",
    "You have two tools available:",
    "- amap_weather(city, forecast?): get current weather (or multi-day forecast) for a Chinese city.",
    "- tavily_search(query): search the web for current information or news.",
    "",
    "Use a tool when the user clearly asks for weather or current/recent information. Otherwise just answer directly. Do not call tools for greetings or general knowledge questions you can answer from training.",
    "",
    "If you reason step-by-step, wrap that reasoning in <think>...</think> tags before giving the final answer.",
  ].join("\n"),
};
```

This deliberately gates tool-calling to clear intent — prevents the model from hitting the search API on "你好".

### 4.8 `lib/config/env.ts`

Add two required strings to the schema:

```ts
AMAP_API_KEY: nonEmptyString,
TAVILY_API_KEY: nonEmptyString,
```

These are validated at process start by `parseServerEnv` — failing fast if missing, same pattern as `OPENAI_API_KEY`.

### 4.9 `scripts/build-city-index.mjs`

One-shot ESM script invoked via `pnpm build-cities`.

- Reads `data/AMap_adcode_citycode.xlsx` with `xlsx` (devDep).
- Picks the first sheet, expects columns `中文名` and `adcode` (verifies header row).
- Filters out rows where `adcode` is empty (the file has a few region-level placeholders).
- Writes `lib/tools/amap-cities.json` as `[{name, adcode}, ...]`, sorted by name length descending (so substring match prefers longer, more specific names).
- Logs the row count.

Run once locally; commit both files. Re-run only if AMap publishes a newer dataset.

## 5. Data flow

```
User: "查询北京天气"
  │
  ▼
chat-site UI → POST /api/chat { messages, agentId: "general" }
  │
  ▼
runAgent → buildAgent({ ..., toolIds: ["amap-weather", "tavily-search"] })
  │   resolveTools() → [amapWeather.toSDKTool(), tavilySearch.toSDKTool()]
  ▼
SDK Runner streams; model emits tool_call: amap_weather({ city: "北京" })
  │
  ▼
SDK invokes amapWeather.execute({ city: "北京", forecast: false })
  │   1. lookupAdcode("北京") → { adcode: "110000", matched: "北京" }
  │   2. cache.get("weather:110000:base") → undefined
  │   3. fetch(AMap, AbortController 10s) → JSON
  │   4. format → "🌡️ 温度: 18°C  🌤️ 天气: 晴 ..."
  │   5. cache.set("weather:110000:base", result, 10 * 60 * 1000)
  │   6. return string
  ▼
SDK feeds tool result back to model → model streams answer (with <think>...</think>)
  │
  ▼
think-parser splits → thinking_delta + answer_delta events to client
  │
  ▼
UI renders thinking block + answer
```

Repeat query within 10 min hits step 2 cache and skips fetch entirely.

## 6. Caching policy summary

| Tool | TTL | Key | Notes |
|---|---|---|---|
| amap-weather | 10 min | `weather:{adcode}:{base|all}` | Weather updates roughly hourly; 10 min is comfortable |
| tavily-search | 30 min | `search:{normalized-query}` | News-style queries; 30 min de-dups bursty repeat asks |

Tradeoffs accepted:
- Per-process: a Vercel cold start or restart loses the cache. Acceptable for homework / single-instance demo.
- No cross-instance sharing: with multiple warm instances, cache hit ratio is split. Acceptable; no Redis.
- No size cap: tool-call cardinality is bounded by user input volume; in practice << 1000 entries. If we ever see memory growth, swap in `lru-cache`.

## 7. Error handling

| Failure | Behavior |
|---|---|
| Unknown city | Tool returns `"未找到 '{city}' 的城市编码..."` — model can ask user to clarify |
| AMap network error / non-200 | Tool returns `"天气服务暂时不可用..."`; logger.warn with details |
| AMap status=0 (API-level error) | Same fallback string; logger.warn with `data.info` |
| Tavily network error / non-200 | Tool returns `"搜索服务暂时不可用..."`; logger.warn |
| AbortController timeout (10/15 s) | Same fallback string; logger.warn `{ reason: "timeout" }` |
| Missing env var at startup | `parseServerEnv` throws — process won't start. Same as today for OPENAI_API_KEY |
| Model produces malformed args | SDK validates against zod schema; SDK auto-retries / surfaces as outer error → existing `runAgent` retry loop catches |

Tool execute() **never throws**. The SDK treats a string return as a successful tool result and feeds it back to the model, which can then decide what to say. This avoids tripping `runAgent`'s retry on what is really a tool-level partial failure.

## 8. Testing strategy (TDD)

Per CLAUDE.md, write tests first. Vitest only (no Playwright additions in this slice).

- **Unit (pure logic, no mocks)**: `ttl-cache`, `city-lookup`, weather formatter, search formatter, query normalizer.
- **Integration (mocked fetch via `vi.spyOn(global, "fetch")`)**: `amap-weather.execute()` and `tavily-search.execute()` covering cache hit/miss, success, API error, timeout, malformed response.
- **Smoke**: that updated `lib/tools/index.ts` registers both ids and `getTool` returns specs.
- **Skip**: live API calls, Playwright additions. Existing E2E continues to pass because the agent picker still works.

Target: ~25 new test cases. Run `pnpm test` — must pass alongside existing 144 unit tests.

## 9. Documentation updates

- **`README.md`** — add `AMAP_API_KEY`, `TAVILY_API_KEY` to required env contract; add a "Built-in tools" section listing the two tools.
- **`lib/tools/README.md`** — replace the "ships empty" line with a table of registered tools and brief usage; keep the "how to add a tool" snippet.
- **`CHANGELOG.md`** — 0.4.0 entry: AMap weather tool; Tavily search tool; in-memory TTL cache; updated `general` agent.
- **`TODOS.md`** — promote tools section to Shipped; add a "Known limitations" entry about per-process cache.

## 10. Security & secrets

- API keys live only in `.env` / process env. The chat-site `.env` already has `TAVILY_API_KEY`; we add `AMAP_API_KEY=f3a328d8176dbfe490b1f0d12310d754` (provided in the brief). `.env.example` shows placeholder values.
- Tool ids and tool inputs/outputs may surface in server logs, not in client-bound stream events. Existing `lib/logging` already strips. No tool-call payloads leak to browser.
- Tavily and AMap responses can include URLs; rendered as-is in the model's answer (the model is responsible). No HTML injection risk because the UI renders chat as plain text / markdown.

## 11. Out of scope (deferred)

- New dedicated `multi-task-qa` agent (we chose to wire tools into `general` for simplicity).
- Persistent / cross-instance caching (Redis, Vercel KV).
- Tool usage badges / chips in the UI ("🔧 used: amap_weather").
- Forecast rendering as a card or table — model formats inline for now.
- Fuzzy / pinyin city matching beyond simple substring.
- City lookup outside mainland China.
- Streaming partial tool output (Tavily and AMap are single-shot).
- Tool-level retry/backoff (rely on outer agent retry).
- LLM-side rate-limiting on tool calls (no infinite-loop guard beyond SDK defaults).

## 12. Acceptance criteria

The slice is done when:

- [ ] `pnpm build-cities` regenerates `amap-cities.json` from the .xlsx, deterministic output.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass.
- [ ] Local `pnpm dev`: with the picker on **General**, asking "查询北京天气" produces an answer mentioning current Beijing weather.
- [ ] Same prompt within 10 min produces an identical-looking answer with `cacheHit: true` in the server log.
- [ ] Asking "最近的人工智能新闻有哪些" triggers `tavily_search`; answer cites Tavily-style results.
- [ ] Asking "你好" triggers no tool call (model handles greeting directly).
- [ ] Asking weather for an unknown city ("查询火星天气") gets a graceful "未找到城市编码" reply.
- [ ] Killing network mid-call (or returning 500 from a mocked endpoint) yields the user-friendly fallback message.
