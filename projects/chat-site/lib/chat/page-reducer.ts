import type { AttemptText, Status, StreamEvent } from "@/lib/chat/stream-event";

export type TimelineRow = {
  id: string;
  ts: number;
  label: string;
  variant: "neutral" | "warning" | "success" | "error";
};

export type State = {
  status: Status;
  lastPrompt: string;
  draftPrompt: string;
  winningAttemptId: number | null;
  errorMessage: string | null;
  attempts: Record<number, AttemptText>;
  timelineRows: TimelineRow[];
  traceUrl: string | null;
};

export type Action =
  | { type: "SUBMIT"; prompt: string }
  | { type: "INTERRUPTED" }
  | { type: "SET_DRAFT"; prompt: string }
  | { type: "STREAM_EVENT"; event: StreamEvent };

export const initialState: State = {
  status: "idle",
  lastPrompt: "",
  draftPrompt: "",
  winningAttemptId: null,
  errorMessage: null,
  attempts: {},
  timelineRows: [],
  traceUrl: null,
};

const addRow = (
  rows: TimelineRow[],
  eventId: string,
  ts: number,
  label: string,
  variant: TimelineRow["variant"],
): TimelineRow[] => [...rows, { id: eventId, ts, label, variant }];

const applyStreamEvent = (state: State, event: StreamEvent): State => {
  switch (event.kind) {
    case "accepted":
      return {
        ...state,
        timelineRows: addRow(state.timelineRows, event.eventId, event.ts, "Request accepted", "neutral"),
      };

    case "answer_delta": {
      const prev = state.attempts[event.attemptId] ?? { text: "", isDone: false };
      return {
        ...state,
        attempts: {
          ...state.attempts,
          [event.attemptId]: { ...prev, text: prev.text + event.delta },
        },
      };
    }

    case "retrying": {
      const prev = state.attempts[event.attemptId] ?? { text: "", isDone: false };
      return {
        ...state,
        attempts: { ...state.attempts, [event.attemptId]: { ...prev, isDone: true } },
        timelineRows: addRow(
          state.timelineRows,
          event.eventId,
          event.ts,
          `Retrying (attempt ${event.nextAttemptId}): ${event.reason}`,
          "warning",
        ),
      };
    }

    case "recovered":
      return {
        ...state,
        timelineRows: addRow(state.timelineRows, event.eventId, event.ts, event.message, "success"),
      };

    case "trace":
      return { ...state, traceUrl: event.traceUrl };

    case "done": {
      const prev = state.attempts[event.attemptId] ?? { text: "", isDone: false };
      return {
        ...state,
        status: "done",
        winningAttemptId: event.attemptId,
        attempts: { ...state.attempts, [event.attemptId]: { ...prev, isDone: true } },
        timelineRows: addRow(state.timelineRows, event.eventId, event.ts, "Done", "success"),
      };
    }

    case "failed":
      return {
        ...state,
        status: "failed",
        errorMessage: event.message,
        timelineRows: addRow(state.timelineRows, event.eventId, event.ts, `Failed: ${event.message}`, "error"),
      };

    case "interrupted":
      return {
        ...state,
        status: "interrupted",
        errorMessage: event.message,
        timelineRows: addRow(state.timelineRows, event.eventId, event.ts, "Interrupted", "error"),
      };
  }
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SUBMIT":
      return {
        ...initialState,
        status: "running",
        lastPrompt: action.prompt,
        draftPrompt: state.draftPrompt,
      };

    case "INTERRUPTED":
      return { ...state, status: "interrupted", errorMessage: "The request was interrupted." };

    case "SET_DRAFT":
      return { ...state, draftPrompt: action.prompt };

    case "STREAM_EVENT":
      return applyStreamEvent(state, action.event);
  }
};
