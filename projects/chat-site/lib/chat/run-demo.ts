// lib/chat/run-demo.ts
import { Agent, run } from "@openai/agents";
import { randomUUID } from "crypto";

import type { StreamEvent } from "./stream-event";

const SYSTEM_PROMPT =
  "You are a helpful assistant for a demo. Answer questions clearly and concisely.";

export type RunDemoOptions = {
  prompt: string;
  model: string;
  demoMode: boolean;
  emit: (event: StreamEvent) => void;
  signal?: AbortSignal;
};

const makeEventId = () => randomUUID();

/*
 * Maps known error signatures to retry decisions.
 * Non-retryable errors (auth failures, bad requests) surface immediately as failed.
 */
const classifyError = (
  err: unknown,
): { retryable: boolean; reason: string; code?: string } => {
  if (!(err instanceof Error)) {
    return { retryable: false, reason: "Unknown error" };
  }
  const msg = err.message.toLowerCase();
  const status = "status" in err && typeof (err as { status: unknown }).status === "number"
    ? (err as { status: number }).status
    : undefined;
  if (msg.includes("demo_injected_failure")) {
    return { retryable: true, reason: "Provider throttled. Retrying.", code: "rate_limit_exceeded" };
  }
  if (status === 429 || msg.includes("rate limit") || msg.includes("429")) {
    return { retryable: true, reason: "Provider throttled. Retrying.", code: "rate_limit_exceeded" };
  }
  if (msg.includes("500") || msg.includes("503") || msg.includes("server error")) {
    return { retryable: true, reason: "Provider unavailable. Retrying.", code: "server_error" };
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return { retryable: true, reason: "Request timed out. Retrying.", code: "timeout" };
  }
  if (msg.includes("connection") || msg.includes("network")) {
    return { retryable: true, reason: "Connection error. Retrying.", code: "connection_error" };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, reason: "API authentication failed. Check your API key.", code: "auth_error" };
  }
  if (status === 404) {
    return { retryable: false, reason: "Model or API endpoint not found.", code: "not_found" };
  }
  return { retryable: false, reason: err.message || "An unexpected error occurred." };
};

class DemoInjectedFailure extends Error {
  constructor() {
    super("demo_injected_failure");
  }
}

const runAttempt = async (
  agent: Agent,
  prompt: string,
  attemptId: number,
  demoMode: boolean,
  emit: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  if (demoMode && attemptId === 1) {
    throw new DemoInjectedFailure();
  }

  const streamedResult = await run(agent, prompt, { stream: true, signal });
  const textStream = streamedResult.toTextStream({ compatibleWithNodeStreams: true });

  for await (const chunk of textStream) {
    emit({
      eventId: makeEventId(),
      kind: "answer_delta",
      attemptId,
      ts: Date.now(),
      delta: Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk,
    });
  }

  await streamedResult.completed;
};

export const runDemo = async (options: RunDemoOptions): Promise<void> => {
  const { prompt, model, demoMode, emit, signal } = options;
  const MAX_ATTEMPTS = 2;

  const agent = new Agent({ name: "demo-agent", instructions: SYSTEM_PROMPT, model });

  emit({ eventId: makeEventId(), kind: "accepted", attemptId: 1, ts: Date.now() });

  let attemptId = 1;

  while (attemptId <= MAX_ATTEMPTS) {
    if (signal?.aborted) break;
    try {
      await runAttempt(agent, prompt, attemptId, demoMode, emit, signal);

      if (attemptId > 1) {
        emit({
          eventId: makeEventId(),
          kind: "recovered",
          attemptId,
          fromAttemptId: attemptId - 1,
          ts: Date.now(),
          message: `Recovered on attempt ${attemptId}.`,
        });
      }

      emit({ eventId: makeEventId(), kind: "done", attemptId, ts: Date.now() });
      return;
    } catch (err) {
      const { retryable, reason, code } = classifyError(err);

      if (retryable && attemptId < MAX_ATTEMPTS) {
        const nextAttemptId = attemptId + 1;
        emit({
          eventId: makeEventId(),
          kind: "retrying",
          attemptId,
          nextAttemptId,
          ts: Date.now(),
          reason,
          code,
        });
        attemptId = nextAttemptId;
      } else {
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
  }
};
