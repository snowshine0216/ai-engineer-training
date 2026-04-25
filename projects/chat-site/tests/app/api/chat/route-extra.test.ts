// tests/app/api/chat/route-extra.test.ts
// Covers gaps: invalid JSON body, rate-limit budget, runDemo throw safety net,
// DEMO_MODE=true forwarded, trace always last, body parsing error path,
// pre-flight auth/not-found errors.
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
  validateProviderAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../lib/chat/run-demo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/chat/run-demo")>();
  return {
    runDemo: vi.fn(),
    classifyError: actual.classifyError,
  };
});

vi.mock("../../../../lib/telemetry/langfuse", () => ({
  createLangfuseTrace: vi.fn(() =>
    Promise.resolve({ traceId: "t1", traceUrl: "https://langfuse.example.com/trace/t1", flush: vi.fn() }),
  ),
}));

import { POST } from "../../../../app/api/chat/route";
import { resetBudget } from "../../../../lib/chat/budget";
import { runDemo as mockRunDemo } from "../../../../lib/chat/run-demo";
import { getServerEnv as mockGetServerEnv } from "../../../../lib/config/env";
import { validateProviderAuth as mockValidateProviderAuth } from "../../../../lib/ai/openai-provider";

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
    resetBudget();
  });

  it("returns 400 with error key when body is not valid JSON", async () => {
    const resp = await POST(makeMalformedRequest());
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 429 when request budget is exhausted", async () => {
    // resetBudget() in beforeEach ensures a clean counter state.
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
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe("string");
  });

  it("returns 401 when validateProviderAuth throws a 401 auth error", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-bad",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    const authErr = Object.assign(new Error("Unauthorized"), { status: 401 });
    vi.mocked(mockValidateProviderAuth).mockRejectedValue(authErr);

    const resp = await POST(makeRequest({ prompt: "hello" }));
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toMatch(/authentication/i);
    expect(body.code).toBe("auth_error");
  });

  it("returns 404 when validateProviderAuth throws a 404 not-found error", async () => {
    vi.mocked(mockGetServerEnv).mockReturnValue({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "unknown-model",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
    });
    const notFoundErr = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(mockValidateProviderAuth).mockRejectedValue(notFoundErr);

    const resp = await POST(makeRequest({ prompt: "hello" }));
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.code).toBe("not_found");
  });

  it("returns 200 and falls through to the stream when validateProviderAuth throws a retryable error", async () => {
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
    const rateLimitErr = Object.assign(new Error("rate limit exceeded"), { status: 429 });
    vi.mocked(mockValidateProviderAuth).mockRejectedValue(rateLimitErr);
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    const resp = await POST(makeRequest({ prompt: "hello" }));
    // Retryable pre-flight errors fall through to the stream — runDemo handles the retry
    expect(resp.status).toBe(200);
  });

  it("skips validateProviderAuth and returns 200 when DEMO_MODE is true", async () => {
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

    const resp = await POST(makeRequest({ prompt: "demo" }));
    expect(resp.status).toBe(200);
    expect(vi.mocked(mockValidateProviderAuth)).not.toHaveBeenCalled();
  });
});
