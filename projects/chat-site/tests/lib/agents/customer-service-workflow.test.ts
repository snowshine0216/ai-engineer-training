import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation((opts: unknown) => ({ __agent: opts, asTool: vi.fn((toolOpts: unknown) => ({ __agentTool: toolOpts })) })),
  tool: vi.fn().mockImplementation((opts: unknown) => ({ __sdkTool: opts })),
}));

import { buildCustomerServiceWorkflow } from "../../../lib/agents/customer-service-workflow";
import { tool } from "@openai/agents";

type MockAgent = {
  __agent: {
    name: string;
    tools: { __agentTool: { toolName: string } }[];
  };
};

type MockWorkflow = {
  manager: MockAgent;
  orderAgent: MockAgent;
  logisticsAgent: MockAgent;
  replyAgent: MockAgent;
};

const repo = {
  findOrderById: vi.fn(),
  findLogisticsByOrderId: vi.fn(),
  close: vi.fn(),
};

describe("customer service workflow builders", () => {
  it("builds manager with three specialist agent tools", () => {
    const workflow = buildCustomerServiceWorkflow({
      model: "gpt-4o-mini",
      repository: repo,
      emitTrace: vi.fn(),
    }) as unknown as MockWorkflow;

    expect(workflow.manager.__agent.name).toBe("CustomerServiceManager");
    expect(workflow.manager.__agent.tools).toHaveLength(3);
    expect(workflow.orderAgent.__agent.tools).toHaveLength(1);
    expect(workflow.logisticsAgent.__agent.tools).toHaveLength(1);
    expect(workflow.replyAgent.__agent.tools).toHaveLength(0);
  });

  it("uses stable tool names for specialist agents", () => {
    const workflow = buildCustomerServiceWorkflow({
      model: "gpt-4o-mini",
      repository: repo,
      emitTrace: vi.fn(),
    }) as unknown as MockWorkflow;

    const toolNames = workflow.manager.__agent.tools.map((t) => t.__agentTool.toolName);
    expect(toolNames).toEqual(["order_status_agent", "logistics_agent", "reply_synthesis_agent"]);
  });
});

type ToolExecute<TArgs, TResult> = (args: TArgs) => Promise<TResult>;

describe("customer service workflow tool execution", () => {
  let mockEmitTrace: ReturnType<typeof vi.fn>;
  let mockRepo: typeof repo;
  let getOrderStatusExecute: ToolExecute<{ orderId: string }, string>;
  let getLogisticsInfoExecute: ToolExecute<{ orderId: string }, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitTrace = vi.fn();
    mockRepo = {
      findOrderById: vi.fn(),
      findLogisticsByOrderId: vi.fn(),
      close: vi.fn(),
    };
    buildCustomerServiceWorkflow({ model: "gpt-4o-mini", repository: mockRepo, emitTrace: mockEmitTrace });
    const calls = vi.mocked(tool).mock.calls;
    getOrderStatusExecute = (calls[0][0] as { execute: typeof getOrderStatusExecute }).execute;
    getLogisticsInfoExecute = (calls[1][0] as { execute: typeof getLogisticsInfoExecute }).execute;
  });

  it("getOrderStatus emits tool_called trace and returns found JSON with holdReason", async () => {
    mockRepo.findOrderById.mockResolvedValue({
      orderId: "1001", status: "hold", paymentStatus: "paid",
      promisedShipBy: "2024-01-20", holdReason: "inventory shortage", warehouse: "WH-1",
    });

    const result = JSON.parse(await getOrderStatusExecute({ orderId: "1001" }));

    expect(mockEmitTrace).toHaveBeenCalledWith(expect.objectContaining({ phase: "tool_called", agentId: "order-status-agent" }));
    expect(result.found).toBe(true);
    expect(result.status).toBe("hold");
    expect(result.summary).toContain("inventory shortage");
  });

  it("getOrderStatus returns found JSON with warehouse when holdReason is null", async () => {
    mockRepo.findOrderById.mockResolvedValue({
      orderId: "1001", status: "shipped", paymentStatus: "paid",
      promisedShipBy: "2024-01-20", holdReason: null, warehouse: "WH-2",
    });

    const result = JSON.parse(await getOrderStatusExecute({ orderId: "1001" }));

    expect(result.found).toBe(true);
    expect(result.summary).toContain("WH-2");
  });

  it("getOrderStatus returns found:false when order does not exist", async () => {
    mockRepo.findOrderById.mockResolvedValue(null);

    const result = JSON.parse(await getOrderStatusExecute({ orderId: "9999" }));

    expect(result.found).toBe(false);
  });

  it("getLogisticsInfo emits tool_called trace and returns found JSON with exceptionReason", async () => {
    mockRepo.findLogisticsByOrderId.mockResolvedValue({
      orderId: "1001", shipmentStatus: "exception", carrier: "SF-Express",
      trackingNumber: "TRK-001", events: [], exceptionReason: "address undeliverable",
    });

    const result = JSON.parse(await getLogisticsInfoExecute({ orderId: "1001" }));

    expect(mockEmitTrace).toHaveBeenCalledWith(expect.objectContaining({ phase: "tool_called", agentId: "logistics-agent" }));
    expect(result.found).toBe(true);
    expect(result.summary).toContain("address undeliverable");
  });

  it("getLogisticsInfo returns found JSON with status when exceptionReason is null", async () => {
    mockRepo.findLogisticsByOrderId.mockResolvedValue({
      orderId: "1001", shipmentStatus: "in_transit", carrier: "SF-Express",
      trackingNumber: "TRK-002", events: [], exceptionReason: null,
    });

    const result = JSON.parse(await getLogisticsInfoExecute({ orderId: "1001" }));

    expect(result.found).toBe(true);
    expect(result.summary).toContain("in_transit");
    expect(result.exceptionReason).toBeNull();
  });

  it("getLogisticsInfo returns found:false when no logistics record exists", async () => {
    mockRepo.findLogisticsByOrderId.mockResolvedValue(null);

    const result = JSON.parse(await getLogisticsInfoExecute({ orderId: "9999" }));

    expect(result.found).toBe(false);
  });

  it("withLookupRetry emits retry_scheduled trace on transient failure", async () => {
    const err = Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
    mockRepo.findOrderById
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ orderId: "1001", status: "shipped", paymentStatus: "paid", promisedShipBy: null, holdReason: null, warehouse: null });

    await getOrderStatusExecute({ orderId: "1001" });

    expect(mockEmitTrace).toHaveBeenCalledWith(expect.objectContaining({ phase: "retry_scheduled" }));
  });

  it("emits tool_failed trace and re-throws when getOrderStatus fails", async () => {
    const err = Object.assign(new Error("disk full"), { code: "DB_ERROR" });
    mockRepo.findOrderById.mockRejectedValue(err);

    await expect(getOrderStatusExecute({ orderId: "1001" })).rejects.toThrow("disk full");

    expect(mockEmitTrace).toHaveBeenCalledWith(expect.objectContaining({
      phase: "tool_failed",
      agentId: "order-status-agent",
      metadata: expect.objectContaining({ toolName: "get_order_status" }),
    }));
  });

  it("emits tool_failed trace and re-throws when getLogisticsInfo fails", async () => {
    const err = Object.assign(new Error("disk full"), { code: "DB_ERROR" });
    mockRepo.findLogisticsByOrderId.mockRejectedValue(err);

    await expect(getLogisticsInfoExecute({ orderId: "1001" })).rejects.toThrow("disk full");

    expect(mockEmitTrace).toHaveBeenCalledWith(expect.objectContaining({
      phase: "tool_failed",
      agentId: "logistics-agent",
      metadata: expect.objectContaining({ toolName: "get_logistics_info" }),
    }));
  });
});
