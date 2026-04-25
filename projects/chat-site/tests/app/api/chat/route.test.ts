// tests/app/api/chat/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../../lib/chat/stream-event";

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
import { resetBudget } from "../../../../lib/chat/budget";
import { validateProviderAuth as mockValidateAuth } from "../../../../lib/ai/openai-provider";

const readStream = async (response: Response): Promise<StreamEvent[]> => {
  const text = await response.text();
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as StreamEvent);
};

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const userTurn = { role: "user", content: "hello" };

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBudget();
  });

  it("rejects invalid JSON with 400", async () => {
    const resp = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    );
    expect(resp.status).toBe(400);
  });

  it("rejects missing agentId with 400", async () => {
    const resp = await POST(makeRequest({ messages: [userTurn] }));
    expect(resp.status).toBe(400);
    expect((await resp.json()).error).toMatch(/agentId/);
  });

  it("rejects empty messages with 400", async () => {
    const resp = await POST(makeRequest({ agentId: "general", messages: [] }));
    expect(resp.status).toBe(400);
  });

  it("rejects unknown agentId with 404", async () => {
    const resp = await POST(makeRequest({ agentId: "no-such-agent", messages: [userTurn] }));
    expect(resp.status).toBe(404);
    expect((await resp.json()).code).toBe("unknown_agent");
  });

  it("rejects when last message is from assistant with 400", async () => {
    const resp = await POST(
      makeRequest({ agentId: "general", messages: [userTurn, { role: "assistant", content: "hi" }] }),
    );
    expect(resp.status).toBe(400);
  });

  it("returns 401 when validateProviderAuth throws an auth error", async () => {
    vi.mocked(mockValidateAuth).mockRejectedValueOnce(Object.assign(new Error("nope"), { status: 401 }));
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    expect(resp.status).toBe(401);
    expect((await resp.json()).code).toBe("auth_error");
  });

  it("returns 404 when validateProviderAuth throws a not_found error", async () => {
    vi.mocked(mockValidateAuth).mockRejectedValueOnce(Object.assign(new Error("nope"), { status: 404 }));
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    expect(resp.status).toBe(404);
  });

  it("streams events from runAgent on the happy path", async () => {
    vi.mocked(mockRunAgent).mockImplementation(async ({ emit }) => {
      emit({ eventId: "1", kind: "accepted", attemptId: 1, agentId: "general", ts: 1 });
      emit({ eventId: "2", kind: "answer_delta", attemptId: 1, ts: 2, delta: "hi" });
      emit({ eventId: "3", kind: "done", attemptId: 1, ts: 3 });
    });
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("application/x-ndjson");
    const events = await readStream(resp);
    expect(events.map((e) => e.kind)).toEqual(["accepted", "answer_delta", "done"]);
  });

  it("passes the resolved spec and full message array to runAgent", async () => {
    vi.mocked(mockRunAgent).mockImplementation(async () => {});
    const messages = [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ];
    await POST(makeRequest({ agentId: "general", messages }));
    expect(vi.mocked(mockRunAgent)).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({ id: "general" }),
        messages,
      }),
    );
  });

  it("returns 429 when DEMO_REQUEST_BUDGET is exceeded", async () => {
    vi.mocked(mockRunAgent).mockImplementation(async () => {});
    for (let i = 0; i < 50; i++) {
      await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    }
    const resp = await POST(makeRequest({ agentId: "general", messages: [userTurn] }));
    expect(resp.status).toBe(429);
    expect(resp.headers.get("retry-after")).toBe("60");
  });
});
