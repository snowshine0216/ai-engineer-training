type Props = { traceUrl: string | null; status: string };

const terminalStatuses = new Set(["done", "failed", "interrupted"]);

export function TraceCard({ traceUrl, status }: Props) {
  const label =
    traceUrl !== null
      ? null
      : status === "idle"
        ? "Trace available when Langfuse is configured."
        : terminalStatuses.has(status)
          ? "Trace unavailable."
          : "Trace pending…";

  const safeUrl = traceUrl?.startsWith("https://") ? traceUrl : null;

  return (
    <div
      style={{
        padding: "12px 16px",
        border: "1px solid var(--line)",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--ink)" }}>Trace</div>
      {safeUrl ? (
        <a href={safeUrl} target="_blank" rel="noopener noreferrer">
          Open in Langfuse ↗
        </a>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
