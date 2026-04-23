export type TimelineRow = {
  id: string;
  kind: string;
  ts: number;
  label: string;
  variant: "neutral" | "warning" | "success" | "error";
};

type Props = { rows: TimelineRow[]; status: string };

const VARIANT_COLOR: Record<TimelineRow["variant"], string> = {
  neutral: "var(--muted)",
  warning: "var(--warning)",
  success: "var(--success)",
  error: "var(--error)",
};

const formatTs = (ts: number) => new Date(ts).toISOString().slice(11, 23);

export function TimelineRail({ rows, status }: Props) {
  if (rows.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 14 }}>
        System activity appears here while the run is live.
      </p>
    );
  }

  return (
    <ol
      aria-live="polite"
      style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}
    >
      {rows.map((row) => (
        <li
          key={row.id}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            fontSize: 14,
          }}
        >
          <span
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: 12,
              color: "var(--muted)",
              flexShrink: 0,
            }}
          >
            {formatTs(row.ts)}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: VARIANT_COLOR[row.variant],
              flexShrink: 0,
              marginTop: 3,
              animation:
                status === "running" && row === rows[rows.length - 1]
                  ? "pulse 1.4s ease-in-out infinite"
                  : "none",
            }}
          />
          <span style={{ color: VARIANT_COLOR[row.variant] }}>{row.label}</span>
        </li>
      ))}
    </ol>
  );
}
