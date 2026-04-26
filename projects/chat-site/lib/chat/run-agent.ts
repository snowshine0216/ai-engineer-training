// lib/chat/run-agent.ts
import { randomUUID } from "crypto";

import { getRunner } from "../ai/openai-provider";
import { buildAgent, type AgentSpec } from "../agents";
import { getLogger } from "../logging";
import { classifyError } from "./errors";
import { toAgentInput, type ConversationMessage } from "./history";
import { createThinkParser, type Segment } from "./think-parser";
import type { StreamEvent } from "./stream-event";
import { extractOrderNumber } from "../customer-service/order-number";
import { runCustomerServiceAgent } from "../customer-service/runner";

export type RunAgentOptions = {
  spec: AgentSpec;
  messages: ConversationMessage[];
  emit: (event: StreamEvent) => void;
  env: { DEFAULT_MODEL: string; CUSTOMER_SERVICE_DB_PATH: string; SHOW_AGENT_TRACE: boolean };
  signal?: AbortSignal;
};

const MAX_ATTEMPTS = 2;

const makeEventId = () => randomUUID();

const segmentToEvent = (seg: Segment, attemptId: number): StreamEvent => ({
  eventId: makeEventId(),
  kind: seg.kind === "thinking" ? "thinking_delta" : "answer_delta",
  attemptId,
  ts: Date.now(),
  delta: seg.text,
});

const runAttempt = async (
  agent: ReturnType<typeof buildAgent>,
  input: ReturnType<typeof toAgentInput>,
  attemptId: number,
  emit: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const runner = getRunner();
  const streamed = await runner.run(agent, input, { stream: true, signal });
  const textStream = streamed.toTextStream({ compatibleWithNodeStreams: true });

  const parser = createThinkParser();

  for await (const chunk of textStream) {
    if (signal?.aborted) return;
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : (chunk as string);
    for (const seg of parser.feed(text)) {
      if (seg.text.length === 0) continue;
      emit(segmentToEvent(seg, attemptId));
    }
  }

  for (const seg of parser.flush()) {
    if (seg.text.length === 0) continue;
    emit(segmentToEvent(seg, attemptId));
  }

  await streamed.completed;
};

export const runAgent = async (opts: RunAgentOptions): Promise<void> => {
  const { spec, messages, emit, env, signal } = opts;
  const logger = getLogger();

  if (spec.id === "customer-service") {
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    const orderId = latestUser ? extractOrderNumber(latestUser.content) : null;
    emit({ eventId: makeEventId(), kind: "accepted", attemptId: 1, agentId: spec.id, ts: Date.now() });
    if (!orderId) {
      emit({
        eventId: makeEventId(),
        kind: "answer_delta",
        attemptId: 1,
        ts: Date.now(),
        delta: "请提供订单号，我帮你查询发货状态。",
      });
      emit({ eventId: makeEventId(), kind: "done", attemptId: 1, ts: Date.now() });
      return;
    }
    await runCustomerServiceAgent({ messages, orderId, emit, env, signal });
    return;
  }

  const agent = buildAgent(spec, env);
  const input = toAgentInput(messages);

  emit({ eventId: makeEventId(), kind: "accepted", attemptId: 1, agentId: spec.id, ts: Date.now() });

  let attemptId = 1;

  while (attemptId <= MAX_ATTEMPTS) {
    if (signal?.aborted) return;

    try {
      await runAttempt(agent, input, attemptId, emit, signal);
      if (attemptId > 1) {
        emit({
          eventId: makeEventId(),
          kind: "recovered",
          attemptId,
          fromAttemptId: attemptId - 1,
          ts: Date.now(),
        });
      }
      emit({ eventId: makeEventId(), kind: "done", attemptId, ts: Date.now() });
      return;
    } catch (err) {
      logger.error("runAgent attempt failed", {
        attemptId,
        agentId: spec.id,
        error: err instanceof Error ? err.message : String(err),
        status: err instanceof Error && "status" in err ? (err as { status: unknown }).status : undefined,
      });

      if (signal?.aborted) return;

      const { retryable, reason, code } = classifyError(err);
      if (retryable && attemptId < MAX_ATTEMPTS) {
        const next = attemptId + 1;
        emit({
          eventId: makeEventId(),
          kind: "retrying",
          attemptId,
          nextAttemptId: next,
          ts: Date.now(),
          reason,
          code,
        });
        attemptId = next;
        continue;
      }
      emit({
        eventId: makeEventId(),
        kind: "failed",
        attemptId,
        ts: Date.now(),
        message: reason,
        retryable: false,
      });
      return;
    }
  }
};
