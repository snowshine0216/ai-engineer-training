import type { AgentTraceEvent } from "@/lib/chat/stream-event";

type Props = {
  traces: AgentTraceEvent[];
};

const phaseLabel = (phase: AgentTraceEvent["phase"]): string => {
  const labels: Record<AgentTraceEvent["phase"], string> = {
    manager_started: "Manager started",
    tool_called: "Tool called",
    retry_scheduled: "Retry scheduled",
    tool_failed: "Tool failed",
    manager_completed: "Manager completed",
  };
  return labels[phase];
};

export function AgentTrace({ traces }: Props) {
  if (traces.length === 0) return null;

  return (
    <details style={{ marginBottom: 10 }}>
      <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>
        Agent trace ({traces.length})
      </summary>
      <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>
        {traces.map((trace) => (
          <li key={trace.eventId}>
            <strong>{phaseLabel(trace.phase)}</strong>
            {" · "}
            <span>{trace.label}</span>
            {" · "}
            <span>{trace.summary}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
