type AttemptText = { text: string; isDone: boolean };

type Props = {
  attempts: Record<number, AttemptText>;
  winningAttemptId: number | null;
  status: string;
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
      {otherAttempts.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary
            style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }}
          >
            Attempt {otherAttempts[0][0]} partial output
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
            {otherAttempts[0][1].text || "(no output before retry)"}
          </pre>
        </details>
      )}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}
