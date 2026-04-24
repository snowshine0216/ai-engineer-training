export type AcceptedEvent = {
  eventId: string;
  kind: "accepted";
  attemptId: 1;
  ts: number;
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
  message: string;
};

export type TraceEvent = {
  eventId: string;
  kind: "trace";
  ts: number;
  traceUrl: string | null;
};

export type DoneEvent = {
  eventId: string;
  kind: "done";
  attemptId: number;
  ts: number;
};

// "failed" is emitted by the server when all retry attempts are exhausted.
export type FailedEvent = {
  eventId: string;
  kind: "failed";
  attemptId: number;
  ts: number;
  message: string;
  retryable: boolean;
};

// "interrupted" is client-only — synthesized in page.tsx, never sent by the server.
export type InterruptedEvent = {
  eventId: string;
  kind: "interrupted";
  attemptId: number;
  ts: number;
  message: string;
  retryable: boolean;
};

export type StreamEvent =
  | AcceptedEvent
  | AnswerDeltaEvent
  | RetryingEvent
  | RecoveredEvent
  | TraceEvent
  | DoneEvent
  | FailedEvent
  | InterruptedEvent;

// Shared shape for accumulated text per attempt — used by page.tsx and AnswerPane
export type AttemptText = { text: string; isDone: boolean };
