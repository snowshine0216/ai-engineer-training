// tests/lib/tools/tavily-search.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _executeForTest, _clearCacheForTest, tavilySearch } from "../../../lib/tools/tavily-search";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const goodPayload = {
  answer: "AI 行业本周有多项重大进展。",
  results: [
    { title: "Anthropic ships new model", url: "https://example.com/a", content: "Anthropic released a model with better reasoning capabilities and improved tool use." },
    { title: "OpenAI conference recap", url: "https://example.com/b", content: "Announcements covered agent SDKs, voice, and pricing updates across the platform." },
  ],
};

describe("tavilySearch", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
    vi.spyOn(global, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _clearCacheForTest();
  });

  it("exposes the registry id", () => {
    expect(tavilySearch.id).toBe("tavily-search");
  });

  it("formats answer + numbered results on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok(goodPayload));
    const out = await _executeForTest({ query: "AI 行业新闻" });
    expect(out).toContain("AI 行业本周有多项重大进展");
    expect(out).toContain("1.");
    expect(out).toContain("Anthropic ships new model");
    expect(out).toContain("https://example.com/a");
    expect(out).toContain("2.");
    expect(out).toContain("OpenAI conference recap");
  });

  it("posts to /search with the right body shape", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(ok(goodPayload));
    await _executeForTest({ query: "AI news" });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("https://api.tavily.com/search");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      api_key: "test-tavily-key",
      query: "AI news",
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    });
  });

  it("hits the cache on repeat call (no second fetch)", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(ok(goodPayload));
    const a = await _executeForTest({ query: "cached query" });
    const b = await _executeForTest({ query: "cached query" });
    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("normalizes whitespace and case for cache key", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(ok(goodPayload));
    await _executeForTest({ query: "Foo Bar" });
    await _executeForTest({ query: "  foo   bar " });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("returns answer-only when results array is empty", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      ok({ answer: "Short answer.", results: [] })
    );
    const out = await _executeForTest({ query: "edgecase empty results" });
    expect(out).toContain("Short answer.");
  });

  it("returns fallback when both answer and results are absent", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(ok({}));
    const out = await _executeForTest({ query: "empty payload case" });
    expect(out).toContain("搜索服务暂时不可用");
  });

  it("returns fallback on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const out = await _executeForTest({ query: "5xx case" });
    expect(out).toContain("搜索服务暂时不可用");
  });

  it("returns fallback on network/abort error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("aborted"));
    const out = await _executeForTest({ query: "network error case" });
    expect(out).toContain("搜索服务暂时不可用");
  });

  it("returns fallback on invalid JSON response body", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("<<not json>>", { status: 200, headers: { "content-type": "application/json" } })
    );
    const out = await _executeForTest({ query: "bad json case" });
    expect(out).toContain("搜索服务暂时不可用");
  });

  it("trims long content snippets to <= ~150 chars with ellipsis", async () => {
    const longContent = "x".repeat(300);
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      ok({ answer: "", results: [{ title: "t", url: "https://example.com/x", content: longContent }] })
    );
    const out = await _executeForTest({ query: "long snippet trim case" });
    expect(out).toContain("…");
    // Should not contain the full 300-char string
    expect(out).not.toContain("x".repeat(200));
  });
});
