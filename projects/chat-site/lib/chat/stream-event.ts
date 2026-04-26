// lib/chat/stream-event.ts

export type AcceptedEvent = {
  eventId: string;
  kind: "accepted";
  attemptId: 1;
  agentId: string;
  ts: number;
};

export type ThinkingDeltaEvent = {
  eventId: string;
  kind: "thinking_delta";
  attemptId: number;
  ts: number;
  delta: string;
};

export type AnswerDeltaEvent = {
  eventId: string;
  kind: "answer_delta";
  attemptId: number;
  ts: number;
  delta: string;
};

export type RetryingEvent = {
  eventId: string;
  kind: "retrying";
  attemptId: number;
  nextAttemptId: number;
  ts: number;
  reason: string;
  code?: string;
};

export type RecoveredEvent = {
  eventId: string;
  kind: "recovered";
  attemptId: number;
  fromAttemptId: number;
  ts: number;
};

export type DoneEvent = {
  eventId: string;
  kind: "done";
  attemptId: number;
  ts: number;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type FailedEvent = {
  eventId: string;
  kind: "failed";
  attemptId: number;
  ts: number;
  message: string;
  retryable: boolean;
};

export type AgentTraceEvent = {
  eventId: string;
  kind: "agent_trace";
  attemptId: number;
  ts: number;
  agentId: string;
  phase:
    | "manager_started"
    | "specialist_started"
    | "tool_called"
    | "retry_scheduled"
    | "tool_succeeded"
    | "tool_failed"
    | "specialist_completed"
    | "manager_completed";
  label: string;
  summary: string;
  metadata?: {
    orderId?: string;
    toolName?: string;
    attempt?: number;
    nextDelayMs?: number;
  };
};

export type StreamEvent =
  | AcceptedEvent
  | ThinkingDeltaEvent
  | AnswerDeltaEvent
  | RetryingEvent
  | RecoveredEvent
  | DoneEvent
  | FailedEvent
  | AgentTraceEvent;
