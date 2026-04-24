import type { Status } from "@/lib/chat/stream-event";

type Props = { status: Status };

const STATUS_LABELS: Record<Props["status"], string> = {
  idle: "Ready",
  running: "Running",
  done: "Done",
  failed: "Failed",
  interrupted: "Interrupted",
};

const STATUS_COLORS: Record<Props["status"], string> = {
  idle: "var(--muted)",
  running: "var(--accent)",
  done: "var(--success)",
  failed: "var(--error)",
  interrupted: "var(--warning)",
};

export function StatusChip({ status }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid var(--line)`,
        fontSize: 13,
        fontFamily: '"Geist Mono", monospace',
        color: STATUS_COLORS[status],
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: STATUS_COLORS[status],
          animation: status === "running" ? "pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
