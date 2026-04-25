// tests/lib/chat/page-reducer-extra.test.ts
// Extra coverage for page-reducer branches not hit by the primary test file.
import { describe, it, expect } from "vitest";
import { reducer, initialState, type PageState } from "../../../lib/chat/page-reducer";
import type { StreamEvent } from "../../../lib/chat/stream-event";

const ev = (
  e: Partial<StreamEvent> & { kind: StreamEvent["kind"] },
  base: { ts: number; eventId: string; attemptId: number },
): StreamEvent => ({ ts: base.ts, eventId: base.eventId, attemptId: base.attemptId, ...e } as StreamEvent);

const BASE = { ts: 1, eventId: "x", attemptId: 1 };

describe("page-reducer (extra branches)", () => {
  // updateLastAssistant: returns messages unchanged when last message is NOT assistant
  it("STREAM_EVENT accepted is a no-op on agentId when last message is a user message (non-assistant last)", () => {
    // Build a state where the last message is a user message (edge case — normally impossible
    // during normal flow, but the function should guard defensively).
    const state: PageState = {
      ...initialState,
      messages: [{ role: "user", content: "hi" }],
      status: "running",
    };
    const next = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "accepted", agentId: "general" }, BASE),
    });
    // messages unchanged — updateLastAssistant returned early
    expect(next.messages).toEqual(state.messages);
  });

  // answer_delta when thinkingStartedAt is null — thinkingDurationMs stays null
  it("STREAM_EVENT answer_delta without prior thinking keeps thinkingDurationMs=null", () => {
    // Submit then immediately send answer_delta with no thinking_delta
    let state = reducer(
      { ...initialState, agentId: "general" },
      { type: "SUBMIT", prompt: "hi" },
    );
    state = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "answer_delta", delta: "hello" }, { ts: 100, eventId: "a", attemptId: 1 }),
    });
    expect(state.thinkingDurationMs).toBeNull();
    expect(state.messages[1]).toMatchObject({ role: "assistant", content: "hello" });
  });

  // answer_delta when thinkingDurationMs already set — second delta does not override it
  it("STREAM_EVENT second answer_delta does not change thinkingDurationMs once locked", () => {
    let state = reducer({ ...initialState, agentId: "general" }, { type: "SUBMIT", prompt: "hi" });
    state = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "thinking_delta", delta: "think" }, { ts: 10, eventId: "a", attemptId: 1 }),
    });
    // First answer_delta — locks thinkingDurationMs
    state = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "answer_delta", delta: "A" }, { ts: 50, eventId: "b", attemptId: 1 }),
    });
    expect(state.thinkingDurationMs).toBe(50 - 10); // 40

    // Second answer_delta — must NOT override the locked value
    state = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "answer_delta", delta: "B" }, { ts: 200, eventId: "c", attemptId: 1 }),
    });
    expect(state.thinkingDurationMs).toBe(40); // unchanged
  });

  // thinking_delta when thinkingStartedAt already set — keeps the original ts
  it("STREAM_EVENT second thinking_delta preserves original thinkingStartedAt", () => {
    let state = reducer({ ...initialState, agentId: "general" }, { type: "SUBMIT", prompt: "hi" });
    state = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "thinking_delta", delta: "first" }, { ts: 5, eventId: "a", attemptId: 1 }),
    });
    expect(state.thinkingStartedAt).toBe(5);

    state = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "thinking_delta", delta: "second" }, { ts: 99, eventId: "b", attemptId: 1 }),
    });
    // Should STILL be 5, not 99
    expect(state.thinkingStartedAt).toBe(5);
  });

  // updateLastAssistant when messages array is empty — returns unchanged
  it("STREAM_EVENT thinking_delta on empty messages array is a safe no-op", () => {
    // Inject state with empty messages (unusual but guards internal helper)
    const state: PageState = { ...initialState };
    const next = reducer(state, {
      type: "STREAM_EVENT",
      event: ev({ kind: "thinking_delta", delta: "x" }, BASE),
    });
    expect(next.messages).toEqual([]);
  });

  // RETRY resets thinkingStartedAt + thinkingDurationMs to null
  it("RETRY clears thinkingStartedAt and thinkingDurationMs from previous run", () => {
    const stateWithThinking: PageState = {
      ...initialState,
      agentId: "general",
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "partial", thinking: "step" },
      ],
      status: "failed",
      thinkingStartedAt: 100,
      thinkingDurationMs: 3200,
    };
    const next = reducer(stateWithThinking, { type: "RETRY" });
    expect(next.thinkingStartedAt).toBeNull();
    expect(next.thinkingDurationMs).toBeNull();
    expect(next.status).toBe("running");
  });
});
