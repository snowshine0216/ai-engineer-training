import type { AgentTraceEvent } from "../chat/stream-event";

type LoggerLike = {
  info: (message: string, data: Record<string, unknown>) => void;
};

type MakeTraceInput = Omit<AgentTraceEvent, "kind">;

export const makeAgentTraceEvent = (input: MakeTraceInput): AgentTraceEvent => ({
  ...input,
  kind: "agent_trace",
  metadata: input.metadata
    ? {
        ...(input.metadata.orderId !== undefined ? { orderId: input.metadata.orderId } : {}),
        ...(input.metadata.toolName !== undefined ? { toolName: input.metadata.toolName } : {}),
        ...(input.metadata.attempt !== undefined ? { attempt: input.metadata.attempt } : {}),
        ...(input.metadata.nextDelayMs !== undefined ? { nextDelayMs: input.metadata.nextDelayMs } : {}),
      }
    : undefined,
});

export const logAgentTraceEvent = (logger: LoggerLike, event: AgentTraceEvent): void => {
  logger.info("customer-service agent trace", {
    eventId: event.eventId,
    attemptId: event.attemptId,
    agentId: event.agentId,
    phase: event.phase,
    label: event.label,
    summary: event.summary,
    orderId: event.metadata?.orderId,
    toolName: event.metadata?.toolName,
    attempt: event.metadata?.attempt,
    nextDelayMs: event.metadata?.nextDelayMs,
  });
};
