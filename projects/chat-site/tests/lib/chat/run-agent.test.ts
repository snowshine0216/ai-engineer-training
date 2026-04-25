// tests/lib/chat/run-agent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../lib/chat/stream-event";

const mockRunnerRun = vi.fn();
const mockBuildAgent = vi.fn((..._args: unknown[]) => ({}));

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../../../lib/ai/openai-provider", () => ({
  getRunner: () => ({ run: mockRunnerRun }),
}));

vi.mock("../../../lib/agents", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/agents")>("../../../lib/agents");
  return {
    ...actual,
    buildAgent: (a: unknown, b: unknown) => mockBuildAgent(a, b),
  };
});

vi.mock("../../../lib/logging", () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { runAgent } from "../../../lib/chat/run-agent";
import type { AgentSpec } from "../../../lib/agents";

const makeStreamedResult = (chunks: Array<string | Buffer>) => {
  async function* gen() { for (const c of chunks) yield c; }
  return {
    toTextStream: vi.fn(() => gen()),
    completed: Promise.resolve(),
  };
};

const SPEC: AgentSpec = {
  id: "general",
  name: "General",
  description: "d",
  promptId: "general",
  toolIds: [],
};

const ENV = { DEFAULT_MODEL: "gpt-4o-mini" } as const;

describe("runAgent", () => {
  let events: StreamEvent[];
  const emit = (e: StreamEvent) => { events.push(e); };

  beforeEach(() => {
    events = [];
    vi.clearAllMocks();
  });

  it("emits accepted (with agentId) → answer_delta → done on first-attempt success with no <think>", async () => {
    mockRunnerRun.mockResolvedValue(makeStreamedResult(["Hello", " world"]));
    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });

    expect(events.map((e) => e.kind)).toEqual(["accepted", "answer_delta", "answer_delta", "done"]);
    expect(events[0]).toMatchObject({ kind: "accepted", attemptId: 1, agentId: "general" });
    expect(events[1]).toMatchObject({ kind: "answer_delta", delta: "Hello", attemptId: 1 });
  });

  it("splits <think>...</think> into thinking_delta then answer_delta", async () => {
    mockRunnerRun.mockResolvedValue(makeStreamedResult(["<think>reasoning</think>", "answer"]));
    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("thinking_delta");
    expect(kinds).toContain("answer_delta");
    const thinking = events.find((e) => e.kind === "thinking_delta") as { delta: string };
    const answer = events.find((e) => e.kind === "answer_delta") as { delta: string };
    expect(thinking.delta).toBe("reasoning");
    expect(answer.delta).toBe("answer");
  });

  it("retries on a retryable error and emits retrying then recovered", async () => {
    mockRunnerRun
      .mockRejectedValueOnce(new Error("rate limit exceeded (429)"))
      .mockResolvedValue(makeStreamedResult(["recovered"]));

    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });

    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual(["accepted", "retrying", "answer_delta", "recovered", "done"]);
    expect(events[1]).toMatchObject({ kind: "retrying", attemptId: 1, nextAttemptId: 2, code: "rate_limit_exceeded" });
    expect(events[3]).toMatchObject({ kind: "recovered", attemptId: 2, fromAttemptId: 1 });
  });

  it("emits failed after retries exhausted on a hard error", async () => {
    mockRunnerRun.mockRejectedValue(Object.assign(new Error("nope"), { status: 401 }));
    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });

    const failed = events.find((e) => e.kind === "failed");
    expect(failed).toMatchObject({ kind: "failed", retryable: false });
  });

  it("aborts on signal — does not emit further events after abort", async () => {
    const controller = new AbortController();
    mockRunnerRun.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    await runAgent({
      spec: SPEC,
      messages: [{ role: "user", content: "hi" }],
      emit,
      env: ENV,
      signal: controller.signal,
    });
    expect(events.map((e) => e.kind)).toEqual(["accepted"]);
  });

  it("passes the converted history to runner.run (multi-turn)", async () => {
    mockRunnerRun.mockResolvedValue(makeStreamedResult(["x"]));
    await runAgent({
      spec: SPEC,
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ],
      emit,
      env: ENV,
    });
    const [, input] = mockRunnerRun.mock.calls[0];
    expect(Array.isArray(input)).toBe(true);
    expect(input).toHaveLength(3);
  });
});
