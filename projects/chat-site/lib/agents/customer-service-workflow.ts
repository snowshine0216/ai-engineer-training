import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import {
  customerServiceLogistics,
  customerServiceManager,
  customerServiceOrder,
  customerServiceReply,
} from "../prompts/customer-service";
import { withRetry } from "../customer-service/retry";
import type { AgentTraceEvent } from "../chat/stream-event";
import type { CustomerServiceRepository } from "../customer-service/repository";

type WorkflowOptions = {
  model: string;
  repository: CustomerServiceRepository;
  emitTrace: (event: Omit<AgentTraceEvent, "eventId" | "kind" | "attemptId" | "ts">) => void;
};

export const buildCustomerServiceWorkflow = ({ model, repository, emitTrace }: WorkflowOptions) => {
  const withLookupRetry = <T>(
    agentId: string,
    label: string,
    toolName: string,
    orderId: string,
    fn: () => Promise<T>,
  ): Promise<T> =>
    withRetry(fn, {
      onRetry: ({ attempt, nextDelayMs }) => {
        emitTrace({
          agentId,
          phase: "retry_scheduled",
          label,
          summary: `第 ${attempt} 次查询失败，准备重试`,
          metadata: { orderId, toolName, attempt, nextDelayMs },
        });
      },
    });

  const summarizeOrder = async (orderId: string): Promise<string> => {
    const order = await withLookupRetry("order-status-agent", "OrderStatusAgent", "get_order_status", orderId, () =>
      repository.findOrderById(orderId),
    );
    if (!order) return JSON.stringify({ orderId, found: false, summary: "未找到该订单。" });
    return JSON.stringify({
      orderId: order.orderId,
      found: true,
      status: order.status,
      paymentStatus: order.paymentStatus,
      promisedShipBy: order.promisedShipBy,
      holdReason: order.holdReason,
      warehouse: order.warehouse,
      summary: order.holdReason
        ? `订单状态为 ${order.status}，原因：${order.holdReason}。`
        : `订单状态为 ${order.status}，仓库：${order.warehouse ?? "未记录"}。`,
    });
  };

  const summarizeLogistics = async (orderId: string): Promise<string> => {
    const logistics = await withLookupRetry("logistics-agent", "LogisticsAgent", "get_logistics_info", orderId, () =>
      repository.findLogisticsByOrderId(orderId),
    );
    if (!logistics) return JSON.stringify({ orderId, found: false, summary: "暂未查询到物流记录。" });
    return JSON.stringify({
      orderId: logistics.orderId,
      found: true,
      shipmentStatus: logistics.shipmentStatus,
      carrier: logistics.carrier,
      trackingNumber: logistics.trackingNumber,
      latestEvent: logistics.events[0] ?? null,
      exceptionReason: logistics.exceptionReason,
      summary: logistics.exceptionReason
        ? `物流状态为 ${logistics.shipmentStatus}，异常原因：${logistics.exceptionReason}。`
        : `物流状态为 ${logistics.shipmentStatus}。`,
    });
  };

  const getOrderStatus = tool({
    name: "get_order_status",
    description: "Look up order status by order id from the customer service database.",
    parameters: z.object({ orderId: z.string().min(1) }),
    execute: async ({ orderId }) => {
      emitTrace({
        agentId: "order-status-agent",
        phase: "tool_called",
        label: "OrderStatusAgent",
        summary: "查询订单状态",
        metadata: { orderId, toolName: "get_order_status" },
      });
      try {
        return await summarizeOrder(orderId);
      } catch (err) {
        emitTrace({
          agentId: "order-status-agent",
          phase: "tool_failed",
          label: "OrderStatusAgent",
          summary: `查询失败：${err instanceof Error ? err.message : String(err)}`,
          metadata: { orderId, toolName: "get_order_status" },
        });
        throw err;
      }
    },
  });

  const getLogisticsInfo = tool({
    name: "get_logistics_info",
    description: "Look up logistics status by order id from the customer service database.",
    parameters: z.object({ orderId: z.string().min(1) }),
    execute: async ({ orderId }) => {
      emitTrace({
        agentId: "logistics-agent",
        phase: "tool_called",
        label: "LogisticsAgent",
        summary: "查询物流状态",
        metadata: { orderId, toolName: "get_logistics_info" },
      });
      try {
        return await summarizeLogistics(orderId);
      } catch (err) {
        emitTrace({
          agentId: "logistics-agent",
          phase: "tool_failed",
          label: "LogisticsAgent",
          summary: `查询失败：${err instanceof Error ? err.message : String(err)}`,
          metadata: { orderId, toolName: "get_logistics_info" },
        });
        throw err;
      }
    },
  });

  const orderAgent = new Agent({
    name: "OrderStatusAgent",
    instructions: customerServiceOrder.text,
    model,
    tools: [getOrderStatus],
  });

  const logisticsAgent = new Agent({
    name: "LogisticsAgent",
    instructions: customerServiceLogistics.text,
    model,
    tools: [getLogisticsInfo],
  });

  const replyAgent = new Agent({
    name: "ReplySynthesisAgent",
    instructions: customerServiceReply.text,
    model,
    tools: [],
  });

  const manager = new Agent({
    name: "CustomerServiceManager",
    instructions: customerServiceManager.text,
    model,
    tools: [
      orderAgent.asTool({ toolName: "order_status_agent", toolDescription: "Check order payment, hold, and fulfillment status." }),
      logisticsAgent.asTool({ toolName: "logistics_agent", toolDescription: "Check shipment, tracking, and logistics exception status." }),
      replyAgent.asTool({ toolName: "reply_synthesis_agent", toolDescription: "Compose the final Chinese customer-service answer." }),
    ],
  });

  return { manager, orderAgent, logisticsAgent, replyAgent };
};
