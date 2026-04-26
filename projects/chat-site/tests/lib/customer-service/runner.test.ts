import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../lib/chat/stream-event";

vi.mock("../../../lib/ai/openai-provider", () => ({
  getRunner: vi.fn(),
}));

vi.mock("../../../lib/agents/customer-service-workflow", () => ({
  buildCustomerServiceWorkflow: vi.fn(),
}));

vi.mock("../../../lib/customer-service/sqlite-repository", () => ({
  createSqliteCustomerServiceRepository: vi.fn(),
}));

vi.mock("../../../lib/chat/think-parser", () => ({
  createThinkParser: vi.fn(),
}));

vi.mock("../../../lib/logging", () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { runCustomerServiceAgent } from "../../../lib/customer-service/runner";
import { getRunner } from "../../../lib/ai/openai-provider";
import { buildCustomerServiceWorkflow } from "../../../lib/agents/customer-service-workflow";
import { createSqliteCustomerServiceRepository } from "../../../lib/customer-service/sqlite-repository";
import { createThinkParser } from "../../../lib/chat/think-parser";

const makeEnv = (overrides: Partial<{ DEFAULT_MODEL: string; CUSTOMER_SERVICE_DB_PATH: string; SHOW_AGENT_TRACE: boolean }> = {}) => ({
  DEFAULT_MODEL: "gpt-4o-mini",
  CUSTOMER_SERVICE_DB_PATH: "/tmp/test.sqlite",
  SHOW_AGENT_TRACE: true,
  ...overrides,
});

type TextStreamChunk = string | Buffer;
const makeTextStream = (chunks: TextStreamChunk[]) => ({
  [Symbol.asyncIterator]: async function* () {
    for (const chunk of chunks) yield chunk;
  },
});

const makeStreamed = (chunks: TextStreamChunk[] = []) => ({
  toTextStream: vi.fn(() => makeTextStream(chunks)),
  completed: Promise.resolve(),
});

describe("runCustomerServiceAgent", () => {
  let mockEmit: ReturnType<typeof vi.fn<[StreamEvent], void>>;
  let mockClose: ReturnType<typeof vi.fn>;
  let mockRun: ReturnType<typeof vi.fn>;
  let mockManager: object;
  let mockParser: { feed: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEmit = vi.fn();
    mockClose = vi.fn();
    mockManager = { __manager: true };

    vi.mocked(createSqliteCustomerServiceRepository).mockReturnValue({
      findOrderById: vi.fn(),
      findLogisticsByOrderId: vi.fn(),
      close: mockClose,
    });

    vi.mocked(buildCustomerServiceWorkflow).mockReturnValue({
      manager: mockManager,
      orderAgent: {},
      logisticsAgent: {},
      replyAgent: {},
    } as ReturnType<typeof buildCustomerServiceWorkflow>);

    mockParser = {
      feed: vi.fn().mockReturnValue([]),
      flush: vi.fn().mockReturnValue([]),
    };
    vi.mocked(createThinkParser).mockReturnValue(mockParser as ReturnType<typeof createThinkParser>);

    mockRun = vi.fn().mockResolvedValue(makeStreamed());
    vi.mocked(getRunner).mockReturnValue({ run: mockRun } as ReturnType<typeof getRunner>);
  });

  it("emits manager_started trace and calls runner.run with the manager agent", async () => {
    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv() });

    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      kind: "agent_trace",
      phase: "manager_started",
      agentId: "customer-service-manager",
    });
    expect(mockRun).toHaveBeenCalledWith(mockManager, expect.any(Array), expect.objectContaining({ stream: true }));
  });

  it("emits answer_delta for answer segments from the parser", async () => {
    mockParser.feed.mockImplementation((text: string) => [{ kind: "answer", text }]);
    mockRun.mockResolvedValue(makeStreamed(["Hello", " world"]));

    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv({ SHOW_AGENT_TRACE: false }) });

    const deltas = mockEmit.mock.calls.filter(([e]) => e.kind === "answer_delta");
    expect(deltas).toHaveLength(2);
    expect(deltas[0][0]).toMatchObject({ kind: "answer_delta", delta: "Hello" });
    expect(deltas[1][0]).toMatchObject({ kind: "answer_delta", delta: " world" });
  });

  it("emits thinking_delta for thinking segments from the parser", async () => {
    mockParser.feed.mockImplementation((text: string) => [{ kind: "thinking", text }]);
    mockRun.mockResolvedValue(makeStreamed(["<think>reasoning</think>"]));

    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv({ SHOW_AGENT_TRACE: false }) });

    const thinkingDeltas = mockEmit.mock.calls.filter(([e]) => e.kind === "thinking_delta");
    expect(thinkingDeltas[0][0]).toMatchObject({ kind: "thinking_delta", delta: "<think>reasoning</think>" });
  });

  it("emits manager_completed trace and done event after the stream completes", async () => {
    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv() });

    const kinds = mockEmit.mock.calls.map(([e]) => e.kind);
    const managerCompleted = mockEmit.mock.calls.find(
      ([e]) => e.kind === "agent_trace" && (e as { phase: string }).phase === "manager_completed",
    );
    expect(managerCompleted).toBeDefined();
    expect(kinds[kinds.length - 1]).toBe("done");
  });

  it("suppresses agent_trace events when SHOW_AGENT_TRACE is false", async () => {
    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv({ SHOW_AGENT_TRACE: false }) });

    const traceEmits = mockEmit.mock.calls.filter(([e]) => e.kind === "agent_trace");
    expect(traceEmits).toHaveLength(0);
  });

  it("skips parser segments with empty text", async () => {
    mockParser.feed.mockReturnValue([{ kind: "answer", text: "" }, { kind: "answer", text: "real" }]);
    mockRun.mockResolvedValue(makeStreamed(["chunk"]));

    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv({ SHOW_AGENT_TRACE: false }) });

    const deltas = mockEmit.mock.calls.filter(([e]) => e.kind === "answer_delta");
    expect(deltas).toHaveLength(1);
    expect(deltas[0][0]).toMatchObject({ delta: "real" });
  });

  it("flushes remaining parser segments after the stream loop ends", async () => {
    mockParser.flush.mockReturnValue([{ kind: "answer", text: "flushed" }]);
    mockRun.mockResolvedValue(makeStreamed([]));

    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv({ SHOW_AGENT_TRACE: false }) });

    const deltas = mockEmit.mock.calls.filter(([e]) => e.kind === "answer_delta");
    expect(deltas[0][0]).toMatchObject({ delta: "flushed" });
  });

  it("calls repository.close in the finally block even if runner.run throws", async () => {
    mockRun.mockRejectedValue(new Error("SDK error"));

    await expect(
      runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv() }),
    ).rejects.toThrow("SDK error");

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("handles Buffer chunks from the text stream", async () => {
    mockParser.feed.mockImplementation((text: string) => [{ kind: "answer", text }]);
    mockRun.mockResolvedValue(makeStreamed([Buffer.from("buffered text")]));

    await runCustomerServiceAgent({ messages: [], orderId: "1001", emit: mockEmit, env: makeEnv({ SHOW_AGENT_TRACE: false }) });

    const deltas = mockEmit.mock.calls.filter(([e]) => e.kind === "answer_delta");
    expect(deltas[0][0]).toMatchObject({ kind: "answer_delta", delta: "buffered text" });
  });
});
