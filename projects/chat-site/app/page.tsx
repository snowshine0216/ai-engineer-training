"use client";
import { useReducer, useRef, useCallback, useEffect } from "react";

import { Composer } from "@/components/chat/composer";
import { StarterPrompts } from "@/components/chat/starter-prompts";
import { AgentPicker } from "@/components/chat/agent-picker";
import { MessageList } from "@/components/chat/message-list";
import { reducer, initialState, type Action, type UiMessage } from "@/lib/chat/page-reducer";
import type { StreamEvent } from "@/lib/chat/stream-event";
import type { PublicAgent } from "@/lib/agents/public";

const readNDJSONStream = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dispatch: (action: Action) => void,
): Promise<{ receivedDone: boolean }> => {
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as StreamEvent;
        dispatch({ type: "STREAM_EVENT", event });
        if (event.kind === "done") receivedDone = true;
      } catch {
        // Malformed line — skip
      }
    }
  }
  return { receivedDone };
};

export default function Page() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  // Load agents on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`agents fetch failed: ${r.status}`))))
      .then((data: { agents: PublicAgent[] }) => {
        if (!cancelled) dispatch({ type: "SET_AGENTS", agents: data.agents });
      })
      .catch(() => {
        // Soft-fail: AgentPicker shows "Loading agents…" indefinitely until user reloads.
      });
    return () => { cancelled = true; };
  }, []);

  // Default to the first agent once we have the list
  useEffect(() => {
    if (state.agents.length > 0 && state.agentId === null) {
      dispatch({ type: "SELECT_AGENT", agentId: state.agents[0].id });
    }
  }, [state.agents, state.agentId]);

  const handleSubmit = useCallback(
    async (prompt: string, historyOverride?: UiMessage[]) => {
      if (!state.agentId) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Build the next messages array including the new user turn so the request reflects it.
      const cleanHistory = (historyOverride ?? state.messages).filter(
        (m) => m.role !== "assistant" || m.content.length > 0,
      );
      const nextMessages = [...cleanHistory, { role: "user" as const, content: prompt }];

      dispatch({ type: "SUBMIT", prompt });

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: state.agentId,
            messages: nextMessages.map((m) =>
              m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content },
            ),
          }),
          signal: controller.signal,
        });
        if (!resp.ok || !resp.body) {
          const err = await resp.json().catch(() => ({ error: "Request failed" }));
          dispatch({
            type: "STREAM_EVENT",
            event: {
              eventId: crypto.randomUUID(),
              kind: "failed",
              attemptId: 1,
              ts: Date.now(),
              message: err.error ?? "Request failed",
              retryable: true,
            },
          });
          return;
        }
        const { receivedDone } = await readNDJSONStream(resp.body.getReader(), dispatch);
        if (!receivedDone) {
          dispatch({
            type: "STREAM_EVENT",
            event: {
              eventId: crypto.randomUUID(),
              kind: "failed",
              attemptId: 1,
              ts: Date.now(),
              message: "Stream ended unexpectedly",
              retryable: true,
            },
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          dispatch({
            type: "STREAM_EVENT",
            event: {
              eventId: crypto.randomUUID(),
              kind: "failed",
              attemptId: 1,
              ts: Date.now(),
              message: "Connection lost",
              retryable: true,
            },
          });
        }
      }
    },
    [state.agentId, state.messages],
  );

  const handleRetry = useCallback(() => {
    const lastUser = [...state.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Strip the last (failed) assistant turn so handleSubmit doesn't include stale partial content in history.
    const historyWithoutFailedAssistant = state.messages.slice(0, -1);
    dispatch({ type: "RETRY" });
    void handleSubmit(lastUser.content, historyWithoutFailedAssistant);
  }, [state.messages, handleSubmit]);

  const isRunning = state.status === "running";
  const isEmpty = state.messages.length === 0;

  return (
    <div className="chat-shell">
      <header
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <h1 style={{ fontSize: 17, fontWeight: 600 }}>Resilient Chat</h1>
        <AgentPicker
          agents={state.agents}
          agentId={state.agentId}
          locked={state.pickerLocked}
          onChange={(id) => dispatch({ type: "SELECT_AGENT", agentId: id })}
          onNewChat={() => dispatch({ type: "NEW_CHAT" })}
        />
      </header>

      <main style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {isEmpty ? (
          <div style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
            <h2 style={{ fontSize: 15, color: "var(--muted)" }}>Try one of these:</h2>
            <StarterPrompts
              onSelect={(p) => {
                dispatch({ type: "SET_DRAFT", value: p });
                void handleSubmit(p);
              }}
              disabled={isRunning}
            />
          </div>
        ) : (
          <MessageList
            messages={state.messages}
            agents={state.agents}
            status={state.status}
            retrying={state.retrying}
            thinkingDurationMs={state.thinkingDurationMs}
            onRetry={handleRetry}
          />
        )}

        <Composer
          value={state.draft}
          onChange={(v) => dispatch({ type: "SET_DRAFT", value: v })}
          onSubmit={handleSubmit}
          disabled={isRunning || !state.agentId}
          placeholder={isEmpty ? "Ask anything…" : "Ask a follow-up…"}
        />
      </main>
    </div>
  );
}
