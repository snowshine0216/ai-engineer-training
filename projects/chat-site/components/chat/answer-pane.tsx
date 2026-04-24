import type { AttemptText } from "@/lib/chat/stream-event";

type Status = "idle" | "running" | "done" | "failed" | "interrupted";

type Props = {
  attempts: Record<number, AttemptText>;
  winningAttemptId: number | null;
  status: Status;
};

export function AnswerPane({ attempts, winningAttemptId, status }: Props) {
  const winner = winningAttemptId !== null ? attempts[winningAttemptId] : null;
  const otherAttempts = Object.entries(attempts).filter(
    ([id]) => Number(id) !== winningAttemptId,
  );

  if (!winner && status === "idle") {
    return (
      <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
        Your answer appears here.
      </p>
    );
  }

  return (
    <div>
      {winner && (
        <div
          aria-live="polite"
          style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 16 }}
        >
          {winner.text}
          {!winner.isDone && (
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
      {otherAttempts.map(([id, attempt]) => (
        <details key={id} style={{ marginTop: 16 }}>
          <summary
            style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }}
          >
            Attempt {id} partial output
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              background: "var(--bg)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              color: "var(--muted)",
            }}
          >
            {attempt.text || "(no output before retry)"}
          </pre>
        </details>
      ))}
    </div>
  );
}
