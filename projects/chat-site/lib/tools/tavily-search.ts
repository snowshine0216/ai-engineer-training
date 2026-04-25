// lib/tools/tavily-search.ts
import { tool } from "@openai/agents";
import { z } from "zod";

import type { ToolSpec } from "./types";
import { createTtlCache } from "../cache/ttl-cache";
import { getLogger } from "../logging";

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const TIMEOUT_MS = 15_000;
const ENDPOINT = "https://api.tavily.com/search";
const FALLBACK = "搜索服务暂时不可用，请稍后再试。";
const SNIPPET_MAX = 150;
const MAX_RESULTS = 5;

const cache = createTtlCache<string>({ maxSize: 1000 });

type TavilyResult = { title: string; url: string; content: string };
type TavilyResponse = { answer?: string; results?: TavilyResult[] };

const normalizeQuery = (q: string): string =>
  q.trim().toLowerCase().replace(/\s+/g, " ");

const trimSnippet = (s: string): string =>
  s.length <= SNIPPET_MAX ? s : s.slice(0, SNIPPET_MAX).trimEnd() + "…";

const formatResults = (data: TavilyResponse): string => {
  const parts: string[] = [];
  if (data.answer) parts.push(data.answer);
  const results = data.results ?? [];
  results.forEach((r, i) => {
    parts.push(`${i + 1}. ${r.title} — ${trimSnippet(r.content)} — ${r.url}`);
  });
  return parts.join("\n\n");
};

const fetchWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const executeImpl = async ({ query }: { query: string }): Promise<string> => {
  const logger = getLogger();
  const key = `search:${normalizeQuery(query)}`;
  const cached = cache.get(key);
  if (cached) {
    logger.info("tavily-search call", { query, cacheHit: true });
    return cached;
  }

  const body = JSON.stringify({
    api_key: process.env.TAVILY_API_KEY ?? "",
    query,
    search_depth: "basic",
    include_answer: true,
    max_results: MAX_RESULTS,
  });

  let res: Response;
  try {
    res = await fetchWithTimeout(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn("tavily-search failed", { query, reason });
    return FALLBACK;
  }

  if (!res.ok) {
    logger.warn("tavily-search failed", { query, status: res.status });
    return FALLBACK;
  }

  const data = (await res.json()) as TavilyResponse;
  const formatted = formatResults(data);
  if (!formatted) return FALLBACK;   // guard: empty answer + empty results → fallback
  cache.set(key, formatted, TTL_MS);
  logger.info("tavily-search call", { query, cacheHit: false, results: data.results?.length ?? 0 });
  return formatted;
};

export const _executeForTest = executeImpl;
export const _clearCacheForTest = (): void => { cache.clear(); };

export const tavilySearch: ToolSpec = {
  id: "tavily-search",
  toSDKTool: () =>
    tool({
      name: "tavily_search",
      description:
        "搜索互联网获取最新信息或新闻。Search the web for current information or news.",
      parameters: z.object({
        query: z.string().max(500).describe("The search query in any language"),
      }),
      execute: executeImpl,
    }),
};
