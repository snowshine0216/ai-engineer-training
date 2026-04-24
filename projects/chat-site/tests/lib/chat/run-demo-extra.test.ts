// tests/lib/chat/run-demo-extra.test.ts
// Covers classifyError branches: 500/503 server error, timeout, connection,
// unknown non-Error throw, and verifies MAX_ATTEMPTS=2 ceiling.
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../lib/chat/stream-event";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
  run: vi.fn(),
}));

import { run as mockRun } from "@openai/agents";
import { runDemo } from "../../../lib/chat/run-demo";

const makeStreamedResult = (textChunks: string[]) => {
  async function* textGenerator() {
    for (const chunk of textChunks) {
      yield chunk;
    }
  }
  return {
    toTextStream: vi.fn(() => textGenerator()),
    completed: Promise.resolve(),
    finalOutput: textChunks.join(""),
  };
};

describe("runDemo — classifyError branches", () => {
  let emittedEvents: StreamEvent[];
  const emit = (event: StreamEvent) => {
    emittedEvents.push(event);
  };

  beforeEach(() => {
    emittedEvents = [];
    vi.clearAllMocks();
  });

  it("classifies 500 server error as retryable and retries once", async () => {
    vi.mocked(mockRun)
      .mockRejectedValueOnce(new Error("internal 500 server error"))
      .mockResolvedValue(makeStreamedResult(["ok"]) as any);

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    expect(kinds).toContain("retrying");
    expect(kinds).toContain("recovered");
    expect(kinds).toContain("done");

    const retryingEvent = emittedEvents.find((e) => e.kind === "retrying") as Extract<
      StreamEvent,
      { kind: "retrying" }
    >;
    expect(retryingEvent.code).toBe("server_error");
  });

  it("classifies 503 server error as retryable", async () => {
    vi.mocked(mockRun)
      .mockRejectedValueOnce(new Error("service unavailable 503"))
      .mockResolvedValue(makeStreamedResult(["ok"]) as any);

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const retryingEvent = emittedEvents.find((e) => e.kind === "retrying") as Extract<
      StreamEvent,
      { kind: "retrying" }
    >;
    expect(retryingEvent.code).toBe("server_error");
  });

  it("classifies timeout error as retryable", async () => {
    vi.mocked(mockRun)
      .mockRejectedValueOnce(new Error("request timed out after 30s"))
      .mockResolvedValue(makeStreamedResult(["ok"]) as any);

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const retryingEvent = emittedEvents.find((e) => e.kind === "retrying") as Extract<
      StreamEvent,
      { kind: "retrying" }
    >;
    expect(retryingEvent.code).toBe("timeout");
  });

  it("classifies connection error as retryable", async () => {
    vi.mocked(mockRun)
      .mockRejectedValueOnce(new Error("network connection refused"))
      .mockResolvedValue(makeStreamedResult(["ok"]) as any);

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const retryingEvent = emittedEvents.find((e) => e.kind === "retrying") as Extract<
      StreamEvent,
      { kind: "retrying" }
    >;
    expect(retryingEvent.code).toBe("connection_error");
  });

  it("classifies non-Error throws as non-retryable and emits failed", async () => {
    // Simulate a non-Error throw (plain string)
    vi.mocked(mockRun).mockRejectedValue("something weird happened");

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    expect(kinds).toEqual(["accepted", "failed"]);
    const failedEvent = emittedEvents[1] as Extract<StreamEvent, { kind: "failed" }>;
    expect(failedEvent.message).toBe("Unknown error");
    expect(failedEvent.retryable).toBe(false);
  });

  it("respects MAX_ATTEMPTS=2: does not retry beyond attempt 2", async () => {
    // Both calls fail with retryable errors
    vi.mocked(mockRun).mockRejectedValue(new Error("rate limit exceeded"));

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    // accepted → retrying (attempt 1→2) → failed (attempt 2)
    expect(kinds).toEqual(["accepted", "retrying", "failed"]);
    // run() should only have been called at most twice (for attempt 1 and 2)
    expect(vi.mocked(mockRun).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("emits retrying with nextAttemptId = attemptId + 1", async () => {
    vi.mocked(mockRun)
      .mockRejectedValueOnce(new Error("rate limit exceeded"))
      .mockResolvedValue(makeStreamedResult([]) as any);

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const retryingEvent = emittedEvents.find((e) => e.kind === "retrying") as Extract<
      StreamEvent,
      { kind: "retrying" }
    >;
    expect(retryingEvent.attemptId).toBe(1);
    expect(retryingEvent.nextAttemptId).toBe(2);
  });

  it("failed event has retryable=false regardless of error type", async () => {
    vi.mocked(mockRun).mockRejectedValue(new Error("rate limit exceeded"));

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const failedEvent = emittedEvents.find((e) => e.kind === "failed") as Extract<
      StreamEvent,
      { kind: "failed" }
    >;
    expect(failedEvent).toBeDefined();
    expect(failedEvent.retryable).toBe(false);
  });

  it("classifies error with numeric status=429 as rate-limited via status property", async () => {
    // Exercises the 'in' + typeof guard branch (not the msg.includes path)
    const err = Object.assign(new Error("upstream error"), { status: 429 });
    vi.mocked(mockRun)
      .mockRejectedValueOnce(err)
      .mockResolvedValue(makeStreamedResult(["ok"]) as any);

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit });

    const retryingEvent = emittedEvents.find((e) => e.kind === "retrying") as Extract<
      StreamEvent,
      { kind: "retrying" }
    >;
    expect(retryingEvent).toBeDefined();
    expect(retryingEvent.code).toBe("rate_limit_exceeded");
  });

  it("stops before first attempt when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await runDemo({ prompt: "hi", model: "m", demoMode: false, emit, signal: controller.signal });

    // accepted is emitted before the loop; the loop exits immediately on aborted signal
    expect(emittedEvents.map((e) => e.kind)).toEqual(["accepted"]);
    expect(vi.mocked(mockRun)).not.toHaveBeenCalled();
  });
});
