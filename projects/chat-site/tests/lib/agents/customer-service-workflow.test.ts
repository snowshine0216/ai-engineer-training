import { describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  Agent: vi.fn().mockImplementation((opts: unknown) => ({ __agent: opts, asTool: vi.fn((toolOpts: unknown) => ({ __agentTool: toolOpts })) })),
  tool: vi.fn().mockImplementation((opts: unknown) => ({ __sdkTool: opts })),
}));

import { buildCustomerServiceWorkflow } from "../../../lib/agents/customer-service-workflow";

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

    const toolNames = workflow.manager.__agent.tools.map((tool) => tool.__agentTool.toolName);
    expect(toolNames).toEqual(["order_status_agent", "logistics_agent", "reply_synthesis_agent"]);
  });
});
