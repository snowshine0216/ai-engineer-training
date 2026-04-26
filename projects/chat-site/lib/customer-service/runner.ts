import { randomUUID } from "crypto";
import { getRunner } from "../ai/openai-provider";
import { buildCustomerServiceWorkflow } from "../agents/customer-service-workflow";
import { createSqliteCustomerServiceRepository } from "./sqlite-repository";
import { makeAgentTraceEvent, logAgentTraceEvent } from "./trace";
import { toAgentInput, type ConversationMessage } from "../chat/history";
import { createThinkParser } from "../chat/think-parser";
import type { AgentTraceEvent } from "../chat/stream-event";
import type { StreamEvent } from "../chat/stream-event";
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

export const runCustomerServiceAgent = async ({
  messages,
  orderId,
  emit,
  env,
  signal,
}: RunCustomerServiceAgentOptions): Promise<void> => {
  const logger = getLogger();
  const repository = createSqliteCustomerServiceRepository(env.CUSTOMER_SERVICE_DB_PATH);
  const parser = createThinkParser();

  const emitTrace = (input: Omit<AgentTraceEvent, "eventId" | "kind" | "attemptId" | "ts">): void => {
    const event = makeAgentTraceEvent({
      ...input,
      eventId: makeEventId(),
      attemptId: 1,
      ts: Date.now(),
    });
    logAgentTraceEvent(logger, event);
    if (env.SHOW_AGENT_TRACE) emit(event);
  };

  try {
    emitTrace({
      agentId: "customer-service-manager",
      phase: "manager_started",
      label: "CustomerServiceManager",
      summary: `开始处理订单 ${orderId}`,
      metadata: { orderId },
    });

    const workflow = buildCustomerServiceWorkflow({
      model: env.DEFAULT_MODEL,
      repository,
      emitTrace,
    });

    const runner = getRunner();
    const input = [
      ...toAgentInput(messages),
      {
        role: "user" as const,
        content: `订单号：${orderId}`,
      },
    ];
    const streamed = await runner.run(workflow.manager, input, { stream: true, signal });
    const textStream = streamed.toTextStream({ compatibleWithNodeStreams: true });

    for await (const chunk of textStream) {
      if (signal?.aborted) return;
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : (chunk as string);
      for (const seg of parser.feed(text)) {
        if (seg.text.length === 0) continue;
        emit({
          eventId: makeEventId(),
          kind: seg.kind === "thinking" ? "thinking_delta" : "answer_delta",
          attemptId: 1,
          ts: Date.now(),
          delta: seg.text,
        });
      }
    }

    for (const seg of parser.flush()) {
      if (seg.text.length === 0) continue;
      emit({
        eventId: makeEventId(),
        kind: seg.kind === "thinking" ? "thinking_delta" : "answer_delta",
        attemptId: 1,
        ts: Date.now(),
        delta: seg.text,
      });
    }

    await streamed.completed;
    emitTrace({
      agentId: "customer-service-manager",
      phase: "manager_completed",
      label: "CustomerServiceManager",
      summary: `完成订单 ${orderId} 的客服回复`,
      metadata: { orderId },
    });
    emit({ eventId: makeEventId(), kind: "done", attemptId: 1, ts: Date.now() });
  } finally {
    repository.close();
  }
};
