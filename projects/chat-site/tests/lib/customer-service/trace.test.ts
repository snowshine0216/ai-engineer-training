import { describe, expect, it, vi } from "vitest";
import { makeAgentTraceEvent, logAgentTraceEvent } from "../../../lib/customer-service/trace";

describe("customer service trace", () => {
  it("builds whitelisted agent_trace events", () => {
    expect(makeAgentTraceEvent({
      eventId: "evt-1",
      attemptId: 1,
      ts: 10,
      agentId: "order-status-agent",
      phase: "tool_called",
      label: "OrderStatusAgent",
      summary: "查询订单状态",
      metadata: { orderId: "1001", toolName: "get_order_status", attempt: 1, nextDelayMs: 200 },
    })).toEqual({
      eventId: "evt-1",
      kind: "agent_trace",
      attemptId: 1,
      ts: 10,
      agentId: "order-status-agent",
      phase: "tool_called",
      label: "OrderStatusAgent",
      summary: "查询订单状态",
      metadata: { orderId: "1001", toolName: "get_order_status", attempt: 1, nextDelayMs: 200 },
    });
  });

  it("logs trace events without requiring client emission", () => {
    const info = vi.fn();
    logAgentTraceEvent({ info }, makeAgentTraceEvent({
      eventId: "evt-2",
      attemptId: 1,
      ts: 20,
      agentId: "manager",
      phase: "manager_started",
      label: "CustomerServiceManager",
      summary: "开始处理订单 1001",
      metadata: { orderId: "1001" },
    }));
    expect(info).toHaveBeenCalledWith("customer-service agent trace", expect.objectContaining({
      agentId: "manager",
      phase: "manager_started",
      orderId: "1001",
    }));
  });

  it("preserves attempt: 0 in metadata", () => {
    const event = makeAgentTraceEvent({
      eventId: "e1", attemptId: 1, ts: 0,
      agentId: "a", phase: "retry_scheduled",
      label: "L", summary: "S",
      metadata: { orderId: "1001", attempt: 0, nextDelayMs: 0 },
    });
    expect(event.metadata).toMatchObject({ attempt: 0, nextDelayMs: 0 });
  });
});
