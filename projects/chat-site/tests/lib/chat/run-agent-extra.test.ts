// tests/lib/chat/run-agent-extra.test.ts
// Extra coverage for runAgent paths not in the primary test file.
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
  return { ...actual, buildAgent: (a: unknown, b: unknown) => mockBuildAgent(a, b) };
});

vi.mock("../../../lib/logging", () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { runAgent } from "../../../lib/chat/run-agent";
import type { AgentSpec } from "../../../lib/agents";

const makeStreamedResult = (chunks: Array<string | Buffer>) => {
  async function* gen() { for (const c of chunks) yield c; }
  return { toTextStream: vi.fn(() => gen()), completed: Promise.resolve() };
};

const SPEC: AgentSpec = {
  id: "general",
  name: "General",
  description: "d",
  promptId: "general",
  toolIds: [],
};

const ENV = { DEFAULT_MODEL: "gpt-4o-mini", CUSTOMER_SERVICE_DB_PATH: "data/customer-service/customer-service.sqlite", SHOW_AGENT_TRACE: true } as const;

describe("runAgent (extra branches)", () => {
  let events: StreamEvent[];
  const emit = (e: StreamEvent) => { events.push(e); };

  beforeEach(() => {
    events = [];
    vi.clearAllMocks();
  });

  it("handles Buffer chunks by decoding them to utf8", async () => {
    const buf = Buffer.from("hello buffer", "utf8");
    mockRunnerRun.mockResolvedValue(makeStreamedResult([buf]));
    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });
    const delta = events.find((e) => e.kind === "answer_delta") as { delta: string } | undefined;
    expect(delta?.delta).toBe("hello buffer");
  });

  it("emits failed when both retry attempts fail on a retryable error", async () => {
    const rateLimitErr = new Error("rate limit exceeded");
    mockRunnerRun.mockRejectedValue(rateLimitErr);

    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });

    const kinds = events.map((e) => e.kind);
    // accepted → retrying (attempt 1 fails) → failed (attempt 2 also fails — exhausted)
    expect(kinds).toContain("accepted");
    expect(kinds).toContain("retrying");
    expect(kinds).toContain("failed");
    expect(kinds).not.toContain("done");
    expect(kinds).not.toContain("recovered");
  });

  it("does not emit recovered when only a single attempt succeeds (no retry happened)", async () => {
    mockRunnerRun.mockResolvedValue(makeStreamedResult(["ok"]));
    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });
    expect(events.map((e) => e.kind)).not.toContain("recovered");
  });

  it("segments with empty text are skipped (no empty events emitted)", async () => {
    // Parser may return empty-text segments for a pure tag boundary — verify none leak through.
    mockRunnerRun.mockResolvedValue(makeStreamedResult(["<think>", "</think>", "ans"]));
    await runAgent({ spec: SPEC, messages: [{ role: "user", content: "hi" }], emit, env: ENV });
    for (const e of events) {
      if (e.kind === "answer_delta" || e.kind === "thinking_delta") {
        expect((e as { delta: string }).delta.length).toBeGreaterThan(0);
      }
    }
  });

  it("abort signal checked before each attempt — does not retry when already aborted", async () => {
    const controller = new AbortController();
    // Abort before the first run call
    controller.abort();
    mockRunnerRun.mockResolvedValue(makeStreamedResult(["x"]));
    await runAgent({
      spec: SPEC,
      messages: [{ role: "user", content: "hi" }],
      emit,
      env: ENV,
      signal: controller.signal,
    });
    // Should emit accepted (emitted before the loop) then bail out — run should not be called
    expect(mockRunnerRun).not.toHaveBeenCalled();
  });
});
