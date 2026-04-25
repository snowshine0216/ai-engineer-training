"use client";
import type { PublicAgent } from "@/lib/agents/public";

type Props = {
  agents: PublicAgent[];
  agentId: string | null;
  locked: boolean;
  onChange: (agentId: string) => void;
  onNewChat: () => void;
};

export function AgentPicker({ agents, agentId, locked, onChange, onNewChat }: Props) {
  if (agents.length === 0) {
    return <span style={{ fontSize: 13, color: "var(--muted)" }}>Loading agents…</span>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <label style={{ fontSize: 13, color: "var(--muted)" }}>
        Agent:&nbsp;
        <select
          value={agentId ?? agents[0].id}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Select agent"
          style={{
            padding: "4px 8px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--panel)",
            color: "var(--ink)",
            fontSize: 14,
            opacity: locked ? 0.6 : 1,
          }}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id} title={a.description}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {locked && (
        <button
          type="button"
          onClick={onNewChat}
          aria-label="Start a new chat"
          style={{
            padding: "4px 10px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--panel)",
            color: "var(--ink)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          + New chat
        </button>
      )}
    </div>
  );
}
