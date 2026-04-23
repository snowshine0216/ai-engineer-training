"use client";

import { useReducer, useRef, useCallback } from "react";

import { StatusChip } from "@/components/chat/status-chip";
import { StarterPrompts } from "@/components/chat/starter-prompts";
import { Composer } from "@/components/chat/composer";
import { AnswerPane } from "@/components/chat/answer-pane";
import { TimelineRail, type TimelineRow } from "@/components/chat/timeline-rail";
import { TraceCard } from "@/components/chat/trace-card";
import { InterruptionBanner } from "@/components/chat/interruption-banner";
import type { StreamEvent } from "@/lib/chat/stream-event";

type AttemptText = { text: string; isDone: boolean };

type ChatState = {
  status: "idle" | "running" | "done" | "failed" | "interrupted";
  draftPrompt: string;
  lastPrompt: string;
  attempts: Record<number, AttemptText>;
  winningAttemptId: number | null;
  timelineRows: TimelineRow[];
  traceUrl: string | null;
  errorMessage: string | null;
};

type Action =
  | { type: "SET_DRAFT"; prompt: string }
  | { type: "SUBMIT"; prompt: string }
  | { type: "STREAM_EVENT"; event: StreamEvent }
  | { type: "INTERRUPTED" };

const toTimelineRow = (event: StreamEvent): TimelineRow | null => {
  switch (event.kind) {
    case "accepted":
      return { id: event.eventId, kind: event.kind, ts: event.ts, label: "Accepted. Running.", variant: "neutral" };
    case "retrying":
      return { id: event.eventId, kind: event.kind, ts: event.ts, label: event.reason, variant: "warning" };
    case "recovered":
      return { id: event.eventId, kind: event.kind, ts: event.ts, label: event.message, variant: "success" };
    case "done":
      return { id: event.eventId, kind: event.kind, ts: event.ts, label: "Done.", variant: "success" };
    case "failed":
    case "interrupted":
      return { id: event.eventId, kind: event.kind, ts: event.ts, label: event.message, variant: "error" };
    default:
      return null;
  }
};

const initialState: ChatState = {
  status: "idle",
  draftPrompt: "",
  lastPrompt: "",
  attempts: {},
  winningAttemptId: null,
  timelineRows: [],
  traceUrl: null,
  errorMessage: null,
};

const reducer = (state: ChatState, action: Action): ChatState => {
  switch (action.type) {
    case "SET_DRAFT":
      return { ...state, draftPrompt: action.prompt };

    case "SUBMIT":
      return {
        ...initialState,
        status: "running",
        draftPrompt: action.prompt,
        lastPrompt: action.prompt,
      };

    case "STREAM_EVENT": {
      const event = action.event;
      const row = toTimelineRow(event);

      const timelineRows = row
        ? [...state.timelineRows, row]
        : state.timelineRows;

      if (event.kind === "answer_delta") {
        const prev = state.attempts[event.attemptId] ?? { text: "", isDone: false };
        return {
          ...state,
          timelineRows,
          winningAttemptId: event.attemptId,
          attempts: {
            ...state.attempts,
            [event.attemptId]: { ...prev, text: prev.text + event.delta },
          },
        };
      }

      if (event.kind === "trace") {
        return { ...state, timelineRows, traceUrl: event.traceUrl };
      }

      if (event.kind === "done") {
        const winId = event.attemptId;
        const prevAttempt = state.attempts[winId] ?? { text: "", isDone: false };
        return {
          ...state,
          status: "done",
          timelineRows,
          winningAttemptId: winId,
          attempts: { ...state.attempts, [winId]: { ...prevAttempt, isDone: true } },
        };
      }

      if (event.kind === "failed") {
        return {
          ...state,
          status: "failed",
          timelineRows,
          errorMessage: event.message,
        };
      }

      if (event.kind === "interrupted") {
        return {
          ...state,
          status: "interrupted",
          timelineRows,
          errorMessage: event.message,
        };
      }

      return { ...state, timelineRows };
    }

    case "INTERRUPTED":
      return { ...state, status: "interrupted", errorMessage: "Stream interrupted. Partial output preserved." };

    default:
      return state;
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

      const reader = resp.body.getReader();
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
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        dispatch({ type: "INTERRUPTED" });
      }
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

      <main
        style={{
          display: "grid",
          gridTemplateColumns: "62fr 38fr",
          gap: 0,
          height: "calc(100vh - 65px)",
          overflow: "hidden",
        }}
      >
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
            style={{
              position: "absolute",
              left: -9999,
              fontSize: 14,
            }}
          >
            Jump to system activity
          </a>

          {!state.winningAttemptId && !isRunning && (
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

      <style>{`
        @media (max-width: 767px) {
          main { grid-template-columns: 1fr !important; height: auto !important; }
          aside { border-top: 1px solid var(--line); }
        }
        @media (min-width: 768px) and (max-width: 1199px) {
          main { grid-template-columns: 58fr 42fr !important; }
        }
      `}</style>
    </>
  );
}
