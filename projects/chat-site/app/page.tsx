"use client";

import { useReducer, useRef, useCallback } from "react";

import { StatusChip } from "@/components/chat/status-chip";
import { StarterPrompts } from "@/components/chat/starter-prompts";
import { Composer } from "@/components/chat/composer";
import { AnswerPane } from "@/components/chat/answer-pane";
import { TimelineRail } from "@/components/chat/timeline-rail";
import { TraceCard } from "@/components/chat/trace-card";
import { InterruptionBanner } from "@/components/chat/interruption-banner";
import { reducer, initialState, type Action } from "@/lib/chat/page-reducer";
import type { StreamEvent } from "@/lib/chat/stream-event";

const readNDJSONStream = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dispatch: (action: Action) => void,
): Promise<void> => {
  const decoder = new TextDecoder();
  let buffer = "";
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
      } catch {
        // Malformed line — skip
      }
    }
  }
};

export default function Page() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async (prompt: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: "SUBMIT", prompt });

    // Guard against stalled streams — 65s without completion triggers INTERRUPTED
    // (5s over the server's 60s maxDuration so the server always wins the race).
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        dispatch({ type: "INTERRUPTED" });
      }
    }, 65_000);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
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

      await readNDJSONStream(resp.body.getReader(), dispatch);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        dispatch({ type: "INTERRUPTED" });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (state.lastPrompt) handleSubmit(state.lastPrompt);
  }, [state.lastPrompt, handleSubmit]);

  const isRunning = state.status === "running";
  const showInterruption = state.status === "interrupted" || state.status === "failed";

  return (
    <>
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Resilient Chat Demo</h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Answer with live system evidence.</p>
        </div>
        <StatusChip status={state.status} />
      </header>

      <main className="chat-main">
        <section
          aria-label="Conversation"
          style={{
            padding: 24,
            borderRight: "1px solid var(--line)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <a
            href="#system-activity"
            className="skip-link"
          >
            Jump to system activity
          </a>

          {state.winningAttemptId === null && !isRunning && (
            <StarterPrompts
              onSelect={(p) => {
                dispatch({ type: "SET_DRAFT", prompt: p });
                handleSubmit(p);
              }}
              disabled={isRunning}
            />
          )}

          <Composer
            value={state.draftPrompt}
            onChange={(p) => dispatch({ type: "SET_DRAFT", prompt: p })}
            onSubmit={handleSubmit}
            disabled={isRunning}
          />

          {showInterruption && state.errorMessage && (
            <InterruptionBanner message={state.errorMessage} onRetry={handleRetry} />
          )}

          <AnswerPane
            attempts={state.attempts}
            winningAttemptId={state.winningAttemptId}
            status={state.status}
          />
        </section>

        <aside
          id="system-activity"
          aria-label="System activity"
          style={{
            padding: 24,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            background: "var(--bg)",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>System activity</h2>

          <TimelineRail rows={state.timelineRows} status={state.status} />

          <TraceCard traceUrl={state.traceUrl} status={state.status} />
        </aside>
      </main>

    </>
  );
}
