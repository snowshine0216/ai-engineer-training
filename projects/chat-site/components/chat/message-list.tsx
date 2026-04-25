"use client";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import type { UiMessage } from "@/lib/chat/page-reducer";
import type { PublicAgent } from "@/lib/agents/public";

type Props = {
  messages: UiMessage[];
  agents: PublicAgent[];
  status: "idle" | "running" | "done" | "failed";
  retrying: boolean;
  thinkingDurationMs: number | null;
  onRetry: () => void;
};

const PIN_THRESHOLD_PX = 80;

export function MessageList({ messages, agents, status, retrying, thinkingDurationMs, onRetry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentsById = Object.fromEntries(agents.map((a) => [a.id, a]));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= PIN_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {messages.map((m, i) => (
        <MessageBubble
          key={i}
          message={m}
          agentsById={agentsById}
          isLast={i === messages.length - 1}
          status={status}
          retrying={retrying}
          thinkingDurationMs={thinkingDurationMs}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
