"use client";
import { useState } from "react";

type Props = {
  thinking: string;
  isActive: boolean;
  durationMs: number | null;
};

export function ThinkingBlock({ thinking, isActive, durationMs }: Props) {
  // null = no user override; boolean = user has explicitly toggled
  const [override, setOverride] = useState<boolean | null>(null);

  // Auto-collapse when durationMs becomes non-null (answer started), unless user overrode
  const open = override !== null ? override : durationMs === null;

  if (thinking.length === 0) return null;

  const seconds = durationMs !== null ? (durationMs / 1000).toFixed(1) : null;

  return (
    <details
      open={open}
      onToggle={(e) => setOverride((e.currentTarget as HTMLDetailsElement).open)}
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
