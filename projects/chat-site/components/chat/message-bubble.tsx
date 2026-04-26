"use client";
import { ThinkingBlock } from "./thinking-block";
import { AgentTrace } from "./agent-trace";
import type { UiMessage } from "@/lib/chat/page-reducer";
import type { PublicAgent } from "@/lib/agents/public";

type Props = {
  message: UiMessage;
  agentsById: Record<string, PublicAgent>;
  isLast: boolean;
  status: "idle" | "running" | "done" | "failed";
  retrying: boolean;
  thinkingDurationMs: number | null;
  onRetry: () => void;
};

export function MessageBubble({
  message,
  agentsById,
  isLast,
  status,
  retrying,
  thinkingDurationMs,
  onRetry,
}: Props) {
  if (message.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "78%",
            background: "var(--accent)",
            color: "var(--on-accent)",
            padding: "10px 14px",
            borderRadius: 12,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const agentName = message.agentId ? agentsById[message.agentId]?.name ?? message.agentId : "Assistant";
  const isStreaming = isLast && status === "running" && !message.error;
  const isFailed = !!message.error;

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          maxWidth: "78%",
          background: "var(--panel)",
          border: isFailed ? "1px solid var(--error)" : "1px solid var(--line)",
          borderRadius: 12,
          padding: "10px 14px",
          color: "var(--ink)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{agentName}</span>
          {isStreaming && retrying && <span title="Retrying…" style={{ fontSize: 12 }}>↻</span>}
        </div>

        <ThinkingBlock
          thinking={message.thinking ?? ""}
          isActive={isStreaming && (message.content?.length ?? 0) === 0}
          durationMs={isLast ? thinkingDurationMs : null}
        />

        <AgentTrace traces={message.traces ?? []} />

        {message.content.length > 0 && (
          <div aria-live={isStreaming ? "polite" : undefined} style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {message.content}
            {isStreaming && (
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: "1em",
                  background: "var(--accent)",
                  marginLeft: 2,
                  animation: "blink 1s step-end infinite",
                }}
              />
            )}
          </div>
        )}

        {isFailed && (
          <div style={{ marginTop: 8, color: "var(--error)", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{message.error}</span>
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry"
              style={{ background: "transparent", border: "1px solid var(--error)", color: "var(--error)", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}
            >
              ↻ Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
