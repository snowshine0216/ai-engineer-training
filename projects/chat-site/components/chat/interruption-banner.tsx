type Props = { message: string; onRetry: () => void };

export function InterruptionBanner({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      style={{
        padding: "12px 16px",
        border: `1px solid var(--warning)`,
        borderRadius: 8,
        background: "#fffbf0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 14,
      }}
    >
      <span style={{ color: "var(--warning)" }}>{message}</span>
      <button
        onClick={onRetry}
        style={{
          padding: "6px 14px",
          border: `1px solid var(--warning)`,
          borderRadius: 6,
          background: "transparent",
          color: "var(--warning)",
          fontSize: 13,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        Retry
      </button>
    </div>
  );
}
