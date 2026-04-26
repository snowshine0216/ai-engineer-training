// tests/lib/chat/page-reducer.test.ts
import { describe, it, expect } from "vitest";
import { reducer, initialState, type Action, type PageState, type AssistantMessage } from "../../../lib/chat/page-reducer";
import type { StreamEvent } from "../../../lib/chat/stream-event";

const apply = (state: PageState, ...actions: Action[]): PageState =>
  actions.reduce((s, a) => reducer(s, a), state);

const ev = (e: Partial<StreamEvent> & { kind: StreamEvent["kind"] }, base: { ts: number; eventId: string; attemptId: number }): StreamEvent =>
  ({ ts: base.ts, eventId: base.eventId, attemptId: base.attemptId, ...e } as StreamEvent);

const lastAssistant = (state: PageState): AssistantMessage => {
  const last = state.messages[state.messages.length - 1];
  if (last.role !== "assistant") throw new Error("expected last message to be assistant");
  return last;
};

describe("page-reducer", () => {
  it("initial state has no messages, no selected agent, picker unlocked", () => {
    expect(initialState).toMatchObject({
      messages: [],
      agentId: null,
      pickerLocked: false,
      status: "idle",
      retrying: false,
      draft: "",
    });
  });

  it("SET_DRAFT updates draft only", () => {
    const next = reducer(initialState, { type: "SET_DRAFT", value: "hi" });
    expect(next.draft).toBe("hi");
    expect(next.messages).toEqual([]);
  });

  it("SET_AGENTS stores the public list", () => {
    const next = reducer(initialState, {
      type: "SET_AGENTS",
      agents: [{ id: "general", name: "General", description: "d" }],
    });
    expect(next.agents).toHaveLength(1);
  });

  it("SELECT_AGENT updates the chosen agent when picker is unlocked", () => {
    const next = reducer({ ...initialState, agents: [] }, { type: "SELECT_AGENT", agentId: "qa-coach" });
    expect(next.agentId).toBe("qa-coach");
  });

  it("SELECT_AGENT is ignored when picker is locked", () => {
    const locked = { ...initialState, agentId: "general", pickerLocked: true };
    const next = reducer(locked, { type: "SELECT_AGENT", agentId: "qa-coach" });
    expect(next.agentId).toBe("general");
  });

  it("SUBMIT appends a user message, marks running, locks the picker, clears draft", () => {
    const start = { ...initialState, agentId: "general", draft: "what's up?" };
    const next = reducer(start, { type: "SUBMIT", prompt: "what's up?" });
    expect(next.messages[0]).toEqual({ role: "user", content: "what's up?" });
    expect(next.messages.length).toBe(2);
    expect(next.status).toBe("running");
    expect(next.pickerLocked).toBe(true);
    expect(next.draft).toBe("");
  });

  it("SUBMIT also appends an empty assistant placeholder", () => {
    const start = { ...initialState, agentId: "general" };
    const next = reducer(start, { type: "SUBMIT", prompt: "hi" });
    expect(next.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(next.messages[1]).toMatchObject({ role: "assistant", content: "", thinking: "" });
  });

  it("STREAM_EVENT accepted records the agent on the assistant placeholder", () => {
    const submitted = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "accepted", agentId: "general" }, { ts: 1, eventId: "1", attemptId: 1 }) },
    );
    expect(lastAssistant(submitted).agentId).toBe("general");
    expect(submitted.thinkingStartedAt).toBeNull();
  });

  it("STREAM_EVENT thinking_delta accumulates into the last assistant message and records start time", () => {
    const submitted = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "accepted", agentId: "general" }, { ts: 1, eventId: "a", attemptId: 1 }) },
      { type: "STREAM_EVENT", event: ev({ kind: "thinking_delta", delta: "I think" }, { ts: 2, eventId: "b", attemptId: 1 }) },
      { type: "STREAM_EVENT", event: ev({ kind: "thinking_delta", delta: " hard." }, { ts: 3, eventId: "c", attemptId: 1 }) },
    );
    expect(lastAssistant(submitted).thinking).toBe("I think hard.");
    expect(submitted.thinkingStartedAt).toBe(2);
  });

  it("STREAM_EVENT answer_delta accumulates into the last assistant message and records collapse time on first delta", () => {
    const state = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "accepted", agentId: "general" }, { ts: 1, eventId: "a", attemptId: 1 }) },
      { type: "STREAM_EVENT", event: ev({ kind: "thinking_delta", delta: "x" }, { ts: 2, eventId: "b", attemptId: 1 }) },
      { type: "STREAM_EVENT", event: ev({ kind: "answer_delta", delta: "Hello" }, { ts: 5200, eventId: "c", attemptId: 1 }) },
      { type: "STREAM_EVENT", event: ev({ kind: "answer_delta", delta: " world" }, { ts: 5300, eventId: "d", attemptId: 1 }) },
    );
    expect(lastAssistant(state).content).toBe("Hello world");
    expect(state.thinkingDurationMs).toBe(5200 - 2);
  });

  it("STREAM_EVENT retrying flips retrying flag on, recovered flips it off", () => {
    let state = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "retrying", nextAttemptId: 2, reason: "rate" }, { ts: 1, eventId: "a", attemptId: 1 }) },
    );
    expect(state.retrying).toBe(true);
    state = reducer(state, { type: "STREAM_EVENT", event: ev({ kind: "recovered", fromAttemptId: 1 }, { ts: 2, eventId: "b", attemptId: 2 }) });
    expect(state.retrying).toBe(false);
  });

  it("STREAM_EVENT done sets status to done", () => {
    const state = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "done" }, { ts: 1, eventId: "a", attemptId: 1 }) },
    );
    expect(state.status).toBe("done");
  });

  it("STREAM_EVENT failed sets status=failed and records the error on the last assistant message", () => {
    const state = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "failed", message: "boom", retryable: false }, { ts: 1, eventId: "a", attemptId: 1 }) },
    );
    expect(state.status).toBe("failed");
    expect(lastAssistant(state).error).toBe("boom");
  });

  it("NEW_CHAT clears the thread, unlocks the picker, keeps agents and draft empty", () => {
    const populated = {
      ...initialState,
      messages: [{ role: "user" as const, content: "x" }],
      pickerLocked: true,
      agentId: "general",
      status: "done" as const,
      thinkingStartedAt: 1,
    };
    const next = reducer(populated, { type: "NEW_CHAT" });
    expect(next.messages).toEqual([]);
    expect(next.pickerLocked).toBe(false);
    expect(next.status).toBe("idle");
    expect(next.agentId).toBe("general"); // remembered for convenience
    expect(next.thinkingStartedAt).toBeNull();
    expect(next.thinkingDurationMs).toBeNull();
  });

  it("RETRY replaces the last assistant message with a fresh placeholder + flips status to running", () => {
    const failed = apply(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
      { type: "STREAM_EVENT", event: ev({ kind: "failed", message: "x", retryable: true }, { ts: 1, eventId: "a", attemptId: 1 }) },
    );
    const retried = reducer(failed, { type: "RETRY" });
    expect(retried.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const last = lastAssistant(retried);
    expect(last.content).toBe("");
    expect(last.error).toBeUndefined();
    expect(retried.status).toBe("running");
  });

  it("STREAM_EVENT agent_trace appends trace entries to the last assistant message", () => {
    const state = apply(
      { ...initialState, agentId: "customer-service" },
      { type: "SUBMIT", prompt: "订单 1001 为什么没发货" },
      { type: "STREAM_EVENT", event: ev({
        kind: "agent_trace",
        agentId: "order-status-agent",
        phase: "tool_called",
        label: "OrderStatusAgent",
        summary: "查询订单状态",
        metadata: { orderId: "1001", toolName: "get_order_status" },
      }, { ts: 10, eventId: "trace-1", attemptId: 1 }) },
    );

    expect(lastAssistant(state).traces).toEqual([
      expect.objectContaining({
        phase: "tool_called",
        summary: "查询订单状态",
      }),
    ]);
  });
});
