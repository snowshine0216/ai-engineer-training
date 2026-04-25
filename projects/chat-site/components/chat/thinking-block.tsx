"use client";
import { useEffect, useState } from "react";

type Props = {
  thinking: string;
  isActive: boolean;
  durationMs: number | null;
};

export function ThinkingBlock({ thinking, isActive, durationMs }: Props) {
  const [open, setOpen] = useState(true);

  // Auto-collapse the moment the answer starts (durationMs becomes non-null)
  useEffect(() => {
    if (durationMs !== null) setOpen(false);
  }, [durationMs]);

  if (thinking.length === 0) return null;

  const seconds = durationMs !== null ? (durationMs / 1000).toFixed(1) : null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "6px 10px",
        marginBottom: 8,
        background: "var(--bg)",
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      <summary style={{ cursor: "pointer", userSelect: "none" }}>
        {seconds !== null ? `Show thinking (${seconds}s)` : isActive ? "Thinking…" : "Show thinking"}
      </summary>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, fontFamily: "inherit" }}>{thinking}</pre>
    </details>
  );
}
