// tests/app/api/chat/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../../lib/chat/stream-event";

// Mock env and provider so tests don't need real keys
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
    Promise.resolve({ traceId: "t1", traceUrl: null, flush: vi.fn() }),
  ),
}));

import { POST } from "../../../../app/api/chat/route";
import { runDemo as mockRunDemo } from "../../../../lib/chat/run-demo";

// Parse an NDJSON response stream into typed events
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

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when prompt is missing", async () => {
    const resp = await POST(makeRequest({}));
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toMatch(/prompt/i);
  });

  it("returns 400 when prompt is not a string", async () => {
    const resp = await POST(makeRequest({ prompt: 42 }));
    expect(resp.status).toBe(400);
  });

  it("returns 400 when prompt is empty", async () => {
    const resp = await POST(makeRequest({ prompt: "   " }));
    expect(resp.status).toBe(400);
  });

  it("streams events from runDemo and closes with a trace event", async () => {
    vi.mocked(mockRunDemo).mockImplementation(async ({ emit }) => {
      emit({ eventId: "e1", kind: "accepted", attemptId: 1, ts: 1 });
      emit({ eventId: "e2", kind: "answer_delta", attemptId: 1, ts: 2, delta: "Hi" });
      emit({ eventId: "e3", kind: "done", attemptId: 1, ts: 3 });
    });

    const resp = await POST(makeRequest({ prompt: "hello" }));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("application/x-ndjson");

    const events = await readStream(resp);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("accepted");
    expect(kinds).toContain("answer_delta");
    expect(kinds).toContain("done");
    expect(kinds).toContain("trace");
    // trace must be last
    expect(kinds[kinds.length - 1]).toBe("trace");
  });

  it("passes demoMode=false to runDemo when DEMO_MODE env is false", async () => {
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    await POST(makeRequest({ prompt: "test" }));

    expect(vi.mocked(mockRunDemo)).toHaveBeenCalledWith(
      expect.objectContaining({ demoMode: false }),
    );
  });

  it("passes the DEFAULT_MODEL to runDemo", async () => {
    vi.mocked(mockRunDemo).mockImplementation(async () => {});

    await POST(makeRequest({ prompt: "test" }));

    expect(vi.mocked(mockRunDemo)).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" }),
    );
  });
});
