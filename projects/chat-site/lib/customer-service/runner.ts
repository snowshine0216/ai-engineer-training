import { randomUUID } from "crypto";
import { getRunner } from "../ai/openai-provider";
import { buildCustomerServiceWorkflow } from "../agents/customer-service-workflow";
import { createSqliteCustomerServiceRepository } from "./sqlite-repository";
import { classifyCustomerServiceError } from "./retry";
import { makeAgentTraceEvent, logAgentTraceEvent } from "./trace";
import { toAgentInput, type ConversationMessage } from "../chat/history";
import { createThinkParser, type Segment } from "../chat/think-parser";
import type { AgentTraceEvent, StreamEvent } from "../chat/stream-event";
import { getLogger } from "../logging";

type RunnerEnv = {
  DEFAULT_MODEL: string;
  CUSTOMER_SERVICE_DB_PATH: string;
  SHOW_AGENT_TRACE: boolean;
};

export type RunCustomerServiceAgentOptions = {
  messages: ConversationMessage[];
  orderId: string;
  emit: (event: StreamEvent) => void;
  env: RunnerEnv;
  signal?: AbortSignal;
};

const makeEventId = () => randomUUID();

const buildAgentInput = (messages: ConversationMessage[], orderId: string) => [
  ...toAgentInput(messages),
  { role: "user" as const, content: `订单号：${orderId}` },
];

const emitSegments = (segments: Segment[], emit: (event: StreamEvent) => void, attemptId: number): void => {
  for (const seg of segments) {
    if (seg.text.length === 0) continue;
    emit({
      eventId: makeEventId(),
      kind: seg.kind === "thinking" ? "thinking_delta" : "answer_delta",
      attemptId,
      ts: Date.now(),
      delta: seg.text,
    });
  }
};

const streamAndFlush = async (
  textStream: AsyncIterable<string | Buffer>,
  parser: { feed: (t: string) => Segment[]; flush: () => Segment[] },
  emit: (event: StreamEvent) => void,
  signal: AbortSignal | undefined,
  attemptId: number,
): Promise<boolean> => {
  for await (const chunk of textStream) {
    if (signal?.aborted) return true;
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : (chunk as string);
    emitSegments(parser.feed(text), emit, attemptId);
  }
  emitSegments(parser.flush(), emit, attemptId);
  return false;
};

export const runCustomerServiceAgent = async ({
  messages,
  orderId,
  emit,
  env,
  signal,
}: RunCustomerServiceAgentOptions): Promise<void> => {
  const attemptId = 1;
  const logger = getLogger();
  const parser = createThinkParser();
  let repository: ReturnType<typeof createSqliteCustomerServiceRepository> | undefined;

  const emitTrace = (input: Omit<AgentTraceEvent, "eventId" | "kind" | "attemptId" | "ts">): void => {
    const event = makeAgentTraceEvent({ ...input, eventId: makeEventId(), attemptId, ts: Date.now() });
    logAgentTraceEvent(logger, event);
    if (env.SHOW_AGENT_TRACE) emit(event);
  };

  try {
    repository = createSqliteCustomerServiceRepository(env.CUSTOMER_SERVICE_DB_PATH);
    emitTrace({
      agentId: "customer-service-manager",
      phase: "manager_started",
      label: "CustomerServiceManager",
      summary: `开始处理订单 ${orderId}`,
      metadata: { orderId },
    });
    const workflow = buildCustomerServiceWorkflow({ model: env.DEFAULT_MODEL, repository, emitTrace });
    const streamed = await getRunner().run(
      workflow.manager,
      buildAgentInput(messages, orderId),
      { stream: true, signal },
    );
    const aborted = await streamAndFlush(
      streamed.toTextStream({ compatibleWithNodeStreams: true }),
      parser,
      emit,
      signal,
      attemptId,
    );
    if (aborted) return;
    await streamed.completed;
    emitTrace({
      agentId: "customer-service-manager",
      phase: "manager_completed",
      label: "CustomerServiceManager",
      summary: `完成订单 ${orderId} 的客服回复`,
      metadata: { orderId },
    });
    emit({ eventId: makeEventId(), kind: "done", attemptId, ts: Date.now() });
  } catch (err) {
    logger.error("customer-service agent failed", { orderId, error: err instanceof Error ? err.message : String(err) });
    const { retryable, reason } = classifyCustomerServiceError(err);
    emit({ eventId: makeEventId(), kind: "failed", attemptId, ts: Date.now(), message: reason, retryable });
  } finally {
    repository?.close();
  }
};
