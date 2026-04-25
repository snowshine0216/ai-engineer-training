// tests/app/api/chat/route-gaps.test.ts
// Tests for POST /api/chat branches not covered by the primary route test file.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    OPENAI_BASE_URL: "https://api.example.com/v1",
    OPENAI_API_KEY: "sk-test",
    DEFAULT_MODEL: "gpt-4o-mini",
    DEMO_REQUEST_BUDGET: 50,
    LANGFUSE_PUBLIC_KEY: undefined,
    LANGFUSE_SECRET_KEY: undefined,
    LANGFUSE_HOST: undefined,
    LOG_LEVEL: "info",
    LOG_DIR: "logs",
    LOG_FILE_ENABLED: false,
  })),
}));

vi.mock("../../../../lib/ai/openai-provider", () => ({
  initializeOpenAIProvider: vi.fn(),
  validateProviderAuth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../lib/chat/run-agent", () => ({
  runAgent: vi.fn(),
}));

vi.mock("../../../../lib/telemetry/langfuse", () => ({
  createLangfuseTrace: vi.fn(() =>
    Promise.resolve({ traceId: "t1", traceUrl: null, flush: vi.fn() }),
  ),
}));

vi.mock("../../../../lib/logging", () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "../../../../app/api/chat/route";
import { runAgent as mockRunAgent } from "../../../../lib/chat/run-agent";
import { validateProviderAuth as mockValidateAuth } from "../../../../lib/ai/openai-provider";
import { resetBudget } from "../../../../lib/chat/budget";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const userTurn = { role: "user", content: "hello" };

describe("POST /api/chat (gap coverage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBudget();
  });

  it("response Content-Type is application/x-ndjson", async () => {
    vi.mocked(mockRunAgent).mockImplementation(async () => {});
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    expect(resp.headers.get("content-type")).toBe("application/x-ndjson");
  });

  it("emits a failed event when runAgent throws unexpectedly (catch path in stream start)", async () => {
    vi.mocked(mockRunAgent).mockRejectedValueOnce(new Error("unexpected boom"));
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    const text = await resp.text();
    const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const failed = events.find((e: { kind: string }) => e.kind === "failed");
    expect(failed).toBeDefined();
    expect(failed.retryable).toBe(false);
  });

  it("falls through to runAgent when validateProviderAuth throws a retryable error (e.g. 503)", async () => {
    // A retryable error should NOT return early from POST — it falls through.
    vi.mocked(mockValidateAuth).mockRejectedValueOnce(new Error("HTTP 503 Service Unavailable"));
    vi.mocked(mockRunAgent).mockImplementation(async ({ emit }) => {
      emit({ eventId: "1", kind: "done", attemptId: 1, ts: 1 });
    });
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    // runAgent should still have been called (fall-through for retryable auth check)
    expect(vi.mocked(mockRunAgent)).toHaveBeenCalled();
    expect(resp.status).toBe(200);
  });

  it("returns 500 for a non-auth, non-404 non-retryable error from validateProviderAuth", async () => {
    // e.g. a 400 with an unrecognised error message — classifyError returns retryable=false
    vi.mocked(mockValidateAuth).mockRejectedValueOnce(Object.assign(new Error("bad model"), {}));
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    // Generic non-retryable falls through to 500
    expect(resp.status).toBe(500);
  });

  it("X-Content-Type-Options header is set to nosniff", async () => {
    vi.mocked(mockRunAgent).mockImplementation(async () => {});
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    expect(resp.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
