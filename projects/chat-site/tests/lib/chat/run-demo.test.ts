// tests/lib/chat/run-demo.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../lib/chat/stream-event";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
  run: vi.fn(),
}));

import { run as mockRun } from "@openai/agents";
import { runDemo } from "../../../lib/chat/run-demo";

// Returns a fake StreamedRunResult with the given text chunks
const makeStreamedResult = (textChunks: Array<string | Buffer>) => {
  async function* textGenerator() {
    for (const chunk of textChunks) {
      yield chunk;
    }
  }
  return {
    toTextStream: vi.fn(() => textGenerator()),
    completed: Promise.resolve(),
    finalOutput: textChunks
      .map((chunk) => (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk))
      .join(""),
  };
};

describe("runDemo", () => {
  let emittedEvents: StreamEvent[];
  const emit = (event: StreamEvent) => {
    emittedEvents.push(event);
  };

  beforeEach(() => {
    emittedEvents = [];
    vi.clearAllMocks();
  });

  it("emits accepted, answer_delta chunks, and done on first-attempt success", async () => {
    vi.mocked(mockRun).mockResolvedValue(makeStreamedResult(["Hello", " world"]) as any);

    await runDemo({ prompt: "hi", model: "test-model", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    expect(kinds).toEqual(["accepted", "answer_delta", "answer_delta", "done"]);

    expect(emittedEvents[0]).toMatchObject({ kind: "accepted", attemptId: 1 });
    expect(emittedEvents[1]).toMatchObject({ kind: "answer_delta", delta: "Hello", attemptId: 1 });
    expect(emittedEvents[2]).toMatchObject({ kind: "answer_delta", delta: " world", attemptId: 1 });
    expect(emittedEvents[3]).toMatchObject({ kind: "done", attemptId: 1 });
  });

  it("decodes Buffer chunks from the node-compatible text stream before emitting deltas", async () => {
    vi.mocked(mockRun).mockResolvedValue(
      makeStreamedResult([Buffer.from("Hello"), Buffer.from(" world")]) as any,
    );

    await runDemo({ prompt: "hi", model: "test-model", demoMode: false, emit });

    expect(emittedEvents[1]).toMatchObject({
      kind: "answer_delta",
      attemptId: 1,
      delta: "Hello",
    });
    expect(emittedEvents[2]).toMatchObject({
      kind: "answer_delta",
      attemptId: 1,
      delta: " world",
    });
  });

  it("emits retrying then recovered when attempt 1 fails with a retryable error", async () => {
    vi.mocked(mockRun)
      .mockRejectedValueOnce(new Error("rate limit exceeded (429)"))
      .mockResolvedValue(makeStreamedResult(["Recovered answer"]) as any);

    await runDemo({ prompt: "hi", model: "test-model", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    expect(kinds).toEqual(["accepted", "retrying", "answer_delta", "recovered", "done"]);

    expect(emittedEvents[1]).toMatchObject({
      kind: "retrying",
      attemptId: 1,
      nextAttemptId: 2,
      code: "rate_limit_exceeded",
    });
    expect(emittedEvents[3]).toMatchObject({
      kind: "recovered",
      attemptId: 2,
      fromAttemptId: 1,
    });
    expect(emittedEvents[4]).toMatchObject({ kind: "done", attemptId: 2 });
  });

  it("emits failed without retrying when the error is not retryable", async () => {
    vi.mocked(mockRun).mockRejectedValue(new Error("Invalid API key"));

    await runDemo({ prompt: "hi", model: "test-model", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    expect(kinds).toEqual(["accepted", "failed"]);
    expect(emittedEvents[1]).toMatchObject({ kind: "failed", attemptId: 1, retryable: false });
  });

  it("emits failed when all attempts exhaust retryable errors", async () => {
    vi.mocked(mockRun).mockRejectedValue(new Error("rate limit exceeded (429)"));

    await runDemo({ prompt: "hi", model: "test-model", demoMode: false, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    expect(kinds).toEqual(["accepted", "retrying", "failed"]);
    expect(emittedEvents[2]).toMatchObject({ kind: "failed", attemptId: 2, retryable: false });
  });

  it("in demo mode, injects a failure on attempt 1 then recovers on attempt 2", async () => {
    vi.mocked(mockRun).mockResolvedValue(makeStreamedResult(["Demo answer"]) as any);

    await runDemo({ prompt: "hi", model: "test-model", demoMode: true, emit });

    const kinds = emittedEvents.map((e) => e.kind);
    // attempt 1 is injected (no run() call), attempt 2 succeeds
    expect(kinds).toEqual(["accepted", "retrying", "answer_delta", "recovered", "done"]);
    expect(emittedEvents[1]).toMatchObject({
      kind: "retrying",
      attemptId: 1,
      nextAttemptId: 2,
      code: "rate_limit_exceeded",
    });
    expect(vi.mocked(mockRun)).toHaveBeenCalledTimes(1);
  });

  it("each event has an eventId and ts", async () => {
    vi.mocked(mockRun).mockResolvedValue(makeStreamedResult(["hi"]) as any);

    await runDemo({ prompt: "hi", model: "test-model", demoMode: false, emit });

    for (const event of emittedEvents) {
      expect(typeof event.eventId).toBe("string");
      expect(event.eventId.length).toBeGreaterThan(0);
      expect(typeof event.ts).toBe("number");
    }
  });
});
