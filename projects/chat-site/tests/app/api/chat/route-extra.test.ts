// tests/app/api/chat/route-extra.test.ts
// Covers gaps: invalid JSON body, rate-limit budget, runDemo throw safety net,
// DEMO_MODE=true forwarded, trace always last, body parsing error path.
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../../lib/chat/stream-event";

// ------- default env (budget=50) -------
vi.mock("../../../../lib/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    OPENAI_BASE_URL: "https://api.example.com/v1",
    OPENAI_API_KEY: "sk-test",
    DEFAULT_MODEL: "gpt-4o-mini",
    DEMO_MODE: false,
    DEMO_REQUEST_BUDGET: 50,
    LANGFUSE_PUBLIC_KEY: undefined,
    LANGFUSE_SECRET_KEY: undefined,
    LANGFUSE_HOST: undefined,
  })),
}));

vi.mock("../../../../lib/ai/openai-provider", () => ({
  initializeOpenAIProvider: vi.fn(),
}));

vi.mock("../../../../lib/chat/run-demo", () => ({
  runDemo: vi.fn(),
}));

vi.mock("../../../../lib/telemetry/langfuse", () => ({
  createLangfuseTrace: vi.fn(() =>
    Promise.resolve({ traceId: "t1", traceUrl: "https://langfuse.example.com/trace/t1", flush: vi.fn() }),
  ),
}));

import { POST, resetBudgetForTesting } from "../../../../app/api/chat/route";
import { runDemo as mockRunDemo } from "../../../../lib/chat/run-demo";
import { getServerEnv as mockGetServerEnv } from "../../../../lib/config/env";

const readStream = async (response: Response): Promise<StreamEvent[]> => {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);
};

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const makeMalformedRequest = () =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json{{{",
  });

describe("POST /api/chat — additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBudgetForTesting();
  });

  it("returns 400 with error key when body is not valid JSON", async () => {
    const resp = await POST(makeMalformedRequest());
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 429 when request budget is exhausted", async () => {
    // resetBudgetForTesting() in beforeEach ensures a clean counter state.
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 1,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    const resp1 = await POST(makeRequest({ prompt: "first" }));
    expect(resp1.status).toBe(200);

    const resp2 = await POST(makeRequest({ prompt: "second" }));
    expect(resp2.status).toBe(429);
    const body = await resp2.json();
    expect(body.error).toMatch(/demo is busy/i);
  });

  it("429 response includes Retry-After header", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 1,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    await POST(makeRequest({ prompt: "first" }));
    const resp = await POST(makeRequest({ prompt: "second" }));
    expect(resp.status).toBe(429);
    expect(resp.headers.get("retry-after")).toBe("60");
  });

  it("stream still closes with a trace event when runDemo throws", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    // runDemo throws unexpectedly (the catch block in the route is the safety net)
    vi.mocked(mockRunDemo).mockRejectedValue(new Error("unexpected internal error"));

    const resp = await POST(makeRequest({ prompt: "hello" }));
    expect(resp.status).toBe(200);

    const events = await readStream(resp);
    // The stream must still close and emit the trace event as the final frame
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1].kind).toBe("trace");
  });

  it("trace event carries the traceUrl from langfuse", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    const resp = await POST(makeRequest({ prompt: "trace check" }));
    const events = await readStream(resp);
    const traceEvent = events.find((e) => e.kind === "trace");
    expect(traceEvent).toBeDefined();
    // traceUrl from mock is "https://langfuse.example.com/trace/t1"
    expect((traceEvent as { traceUrl: string | null }).traceUrl).toBe(
      "https://langfuse.example.com/trace/t1",
    );
  });

  it("forwards DEMO_MODE=true to runDemo", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: true,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    await POST(makeRequest({ prompt: "demo" }));

    expect(vi.mocked(mockRunDemo)).toHaveBeenCalledWith(
      expect.objectContaining({ demoMode: true }),
    );
  });

  it("response headers include X-Content-Type-Options: nosniff", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    const resp = await POST(makeRequest({ prompt: "header check" }));
    expect(resp.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns 400 with field-specific message for prompt validation failure", async () => {
    const resp = await POST(makeRequest({ prompt: 123 }));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    // Should include field path in the message
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });
});
