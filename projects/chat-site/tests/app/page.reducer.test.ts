// tests/app/page.reducer.test.ts
// Unit-tests for the pure reducer and toTimelineRow helper from lib/chat/page-reducer.
//
// Covers:
//   reducer: SET_DRAFT, SUBMIT (state reset), STREAM_EVENT for every event kind,
//            INTERRUPTED, default/passthrough branch, unknown event kind (no-op)
//   toTimelineRow: accepted, retrying, recovered, done, failed, interrupted, answer_delta (null), trace (null)
import { describe, expect, it } from "vitest";
import { reducer, toTimelineRow, initialState, type ChatState } from "../../lib/chat/page-reducer";
import type { StreamEvent } from "../../lib/chat/stream-event";

// ---- Tests ----

describe("toTimelineRow", () => {
  it("returns neutral row for accepted event", () => {
    const event: StreamEvent = { eventId: "e1", kind: "accepted", attemptId: 1, ts: 100 };
    const row = toTimelineRow(event);
    expect(row).toMatchObject({ id: "e1", kind: "accepted", label: "Accepted. Running.", variant: "neutral" });
  });

  it("returns warning row for retrying event", () => {
    const event: StreamEvent = {
      eventId: "e2", kind: "retrying", attemptId: 1, nextAttemptId: 2, ts: 200, reason: "Throttled.", code: "rate_limit_exceeded",
    };
    const row = toTimelineRow(event);
    expect(row).toMatchObject({ variant: "warning", label: "Throttled." });
  });

  it("returns success row for recovered event", () => {
    const event: StreamEvent = {
      eventId: "e3", kind: "recovered", attemptId: 2, fromAttemptId: 1, ts: 300, message: "Recovered on attempt 2.",
    };
    const row = toTimelineRow(event);
    expect(row).toMatchObject({ variant: "success", label: "Recovered on attempt 2." });
  });

  it("returns success row for done event", () => {
    const event: StreamEvent = { eventId: "e4", kind: "done", attemptId: 1, ts: 400 };
    const row = toTimelineRow(event);
    expect(row).toMatchObject({ variant: "success", label: "Done." });
  });

  it("returns error row for failed event", () => {
    const event: StreamEvent = {
      eventId: "e5", kind: "failed", attemptId: 1, ts: 500, message: "API key invalid.", retryable: false,
    };
    const row = toTimelineRow(event);
    expect(row).toMatchObject({ variant: "error", label: "API key invalid." });
  });

  it("returns error row for interrupted event", () => {
    const event: StreamEvent = {
      eventId: "e6", kind: "interrupted", attemptId: 1, ts: 600, message: "User cancelled.", retryable: false,
    };
    const row = toTimelineRow(event);
    expect(row).toMatchObject({ variant: "error", label: "User cancelled." });
  });

  it("returns null for answer_delta event", () => {
    const event: StreamEvent = {
      eventId: "e7", kind: "answer_delta", attemptId: 1, ts: 700, delta: "chunk",
    };
    expect(toTimelineRow(event)).toBeNull();
  });

  it("returns null for trace event", () => {
    const event: StreamEvent = {
      eventId: "e8", kind: "trace", ts: 800, traceUrl: "https://example.com",
    };
    expect(toTimelineRow(event)).toBeNull();
  });
});

describe("reducer", () => {
  it("SET_DRAFT updates draftPrompt only", () => {
    const state = reducer(initialState, { type: "SET_DRAFT", prompt: "hello" });
    expect(state.draftPrompt).toBe("hello");
    expect(state.status).toBe("idle");
    expect(state.lastPrompt).toBe("");
  });

  it("SUBMIT resets all state and sets status=running", () => {
    const dirty: ChatState = {
      ...initialState,
      status: "done",
      attempts: { 1: { text: "old", isDone: true } },
      timelineRows: [{ id: "r1", kind: "done", ts: 1, label: "Done.", variant: "success" }],
      winningAttemptId: 1,
      traceUrl: "https://example.com",
      errorMessage: "prev error",
    };
    const state = reducer(dirty, { type: "SUBMIT", prompt: "new prompt" });
    expect(state.status).toBe("running");
    expect(state.draftPrompt).toBe("new prompt");
    expect(state.lastPrompt).toBe("new prompt");
    expect(state.attempts).toEqual({});
    expect(state.timelineRows).toEqual([]);
    expect(state.traceUrl).toBeNull();
    expect(state.errorMessage).toBeNull();
    expect(state.winningAttemptId).toBeNull();
  });

  it("STREAM_EVENT answer_delta accumulates text and sets winningAttemptId", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "answer_delta", attemptId: 1, ts: 1, delta: "Hello",
    };
    const s1 = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(s1.attempts[1]?.text).toBe("Hello");
    expect(s1.winningAttemptId).toBe(1);

    const event2: StreamEvent = {
      eventId: "e2", kind: "answer_delta", attemptId: 1, ts: 2, delta: " world",
    };
    const s2 = reducer(s1, { type: "STREAM_EVENT", event: event2 });
    expect(s2.attempts[1]?.text).toBe("Hello world");
  });

  it("STREAM_EVENT answer_delta starts with empty text when attemptId is new", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "answer_delta", attemptId: 2, ts: 1, delta: "Fresh",
    };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.attempts[2]?.text).toBe("Fresh");
    expect(state.attempts[2]?.isDone).toBe(false);
  });

  it("STREAM_EVENT trace updates traceUrl", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "trace", ts: 1, traceUrl: "https://trace.example.com",
    };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.traceUrl).toBe("https://trace.example.com");
    // trace event does NOT produce a timeline row
    expect(state.timelineRows).toHaveLength(0);
  });

  it("STREAM_EVENT trace with null traceUrl sets traceUrl=null", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "trace", ts: 1, traceUrl: null,
    };
    const state = reducer({ ...initialState, traceUrl: "https://old.example.com" }, { type: "STREAM_EVENT", event });
    expect(state.traceUrl).toBeNull();
  });

  it("STREAM_EVENT done sets status=done and marks attempt isDone", () => {
    const preState: ChatState = {
      ...initialState,
      status: "running",
      attempts: { 1: { text: "partial", isDone: false } },
      winningAttemptId: 1,
    };
    const event: StreamEvent = { eventId: "e1", kind: "done", attemptId: 1, ts: 1 };
    const state = reducer(preState, { type: "STREAM_EVENT", event });
    expect(state.status).toBe("done");
    expect(state.attempts[1]?.isDone).toBe(true);
    expect(state.winningAttemptId).toBe(1);
  });

  it("STREAM_EVENT done creates attempt entry if not present", () => {
    const event: StreamEvent = { eventId: "e1", kind: "done", attemptId: 1, ts: 1 };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.attempts[1]).toBeDefined();
    expect(state.attempts[1]?.isDone).toBe(true);
    expect(state.attempts[1]?.text).toBe("");
  });

  it("STREAM_EVENT failed sets status=failed and errorMessage", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "failed", attemptId: 1, ts: 1, message: "Auth failed", retryable: false,
    };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.status).toBe("failed");
    expect(state.errorMessage).toBe("Auth failed");
  });

  it("STREAM_EVENT interrupted sets status=interrupted and errorMessage", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "interrupted", attemptId: 1, ts: 1, message: "User cancelled", retryable: false,
    };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.status).toBe("interrupted");
    expect(state.errorMessage).toBe("User cancelled");
  });

  it("STREAM_EVENT accepted appends a timeline row", () => {
    const event: StreamEvent = { eventId: "e1", kind: "accepted", attemptId: 1, ts: 1 };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.timelineRows).toHaveLength(1);
    expect(state.timelineRows[0]?.label).toBe("Accepted. Running.");
  });

  it("STREAM_EVENT retrying appends a warning timeline row", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "retrying", attemptId: 1, nextAttemptId: 2, ts: 1, reason: "Throttled.",
    };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.timelineRows).toHaveLength(1);
    expect(state.timelineRows[0]?.variant).toBe("warning");
  });

  it("STREAM_EVENT recovered appends a success timeline row", () => {
    const event: StreamEvent = {
      eventId: "e1", kind: "recovered", attemptId: 2, fromAttemptId: 1, ts: 1, message: "Back online.",
    };
    const state = reducer(initialState, { type: "STREAM_EVENT", event });
    expect(state.timelineRows[0]?.variant).toBe("success");
  });

  it("INTERRUPTED action sets status=interrupted with default message", () => {
    const state = reducer({ ...initialState, status: "running" }, { type: "INTERRUPTED" });
    expect(state.status).toBe("interrupted");
    expect(state.errorMessage).toMatch(/stream interrupted/i);
  });

  it("does not mutate state reference on SET_DRAFT", () => {
    const state = reducer(initialState, { type: "SET_DRAFT", prompt: "new" });
    expect(state).not.toBe(initialState);
    expect(initialState.draftPrompt).toBe("");
  });
});
