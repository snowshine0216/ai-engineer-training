import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamEvent } from "../../../../lib/chat/stream-event";

vi.mock("../../../../lib/config/env", () => ({
  getServerEnv: vi.fn(() => ({
    OPENAI_BASE_URL: "https://api.example.com/v1",
    OPENAI_API_KEY: "sk-test",
    DEFAULT_MODEL: "gpt-4o-mini",
    AMAP_API_KEY: "amap",
    TAVILY_API_KEY: "tavily",
    CUSTOMER_SERVICE_DB_PATH: "data/customer-service/customer-service.sqlite",
    SHOW_AGENT_TRACE: true,
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

vi.mock("../../../../lib/customer-service/runner", () => ({
  runCustomerServiceAgent: vi.fn(),
}));

vi.mock("../../../../lib/telemetry/langfuse", () => ({
  createLangfuseTrace: vi.fn(() => Promise.resolve({ traceId: "t1", traceUrl: null, flush: vi.fn() })),
}));

vi.mock("../../../../lib/logging", () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "../../../../app/api/chat/route";
import { runCustomerServiceAgent } from "../../../../lib/customer-service/runner";
import { resetBudget } from "../../../../lib/chat/budget";

const readStream = async (response: Response): Promise<StreamEvent[]> =>
  (await response.text()).split("\n").filter(Boolean).map((line) => JSON.parse(line) as StreamEvent);

const makeRequest = (content: string) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId: "customer-service", messages: [{ role: "user", content }] }),
  });

describe("POST /api/chat customer-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBudget();
  });

  it("asks for an order number without calling the SDK runner", async () => {
    const resp = await POST(makeRequest("我的订单为什么还没发货？"));
    expect(resp.status).toBe(200);
    const events = await readStream(resp);
    expect(events.map((event) => event.kind)).toEqual(["accepted", "answer_delta", "done"]);
    expect(events[1]).toMatchObject({ kind: "answer_delta", delta: "请提供订单号，我帮你查询发货状态。" });
    expect(runCustomerServiceAgent).not.toHaveBeenCalled();
  });

  it("delegates to the customer service runner when an order number exists", async () => {
    vi.mocked(runCustomerServiceAgent).mockImplementation(async ({ emit }) => {
      emit({ eventId: "2", kind: "done", attemptId: 1, ts: 2 });
    });

    const resp = await POST(makeRequest("我的订单 1001 为什么还没发货？"));
    expect(resp.status).toBe(200);
    await readStream(resp);
    expect(runCustomerServiceAgent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "1001",
      env: expect.objectContaining({ SHOW_AGENT_TRACE: true }),
    }));
  });

  it("passes SHOW_AGENT_TRACE=false to suppress client trace events in the runner", async () => {
    const { getServerEnv } = await import("../../../../lib/config/env");
    vi.mocked(getServerEnv).mockReturnValueOnce({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      AMAP_API_KEY: "amap",
      TAVILY_API_KEY: "tavily",
      CUSTOMER_SERVICE_DB_PATH: "data/customer-service/customer-service.sqlite",
      SHOW_AGENT_TRACE: false,
      DEMO_REQUEST_BUDGET: 50,
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_HOST: undefined,
      LOG_LEVEL: "info",
      LOG_DIR: "logs",
      LOG_FILE_ENABLED: false,
    });

    vi.mocked(runCustomerServiceAgent).mockImplementation(async ({ emit }) => {
      emit({ eventId: "2", kind: "done", attemptId: 1, ts: 2 });
    });

    const resp = await POST(makeRequest("订单 1001 为什么没发货"));
    await readStream(resp);
    expect(runCustomerServiceAgent).toHaveBeenCalledWith(expect.objectContaining({
      env: expect.objectContaining({ SHOW_AGENT_TRACE: false }),
    }));
  });
});
