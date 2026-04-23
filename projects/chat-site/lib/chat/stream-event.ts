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

export type FailedEvent = {
  eventId: string;
  kind: "failed" | "interrupted";
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
  | FailedEvent;
