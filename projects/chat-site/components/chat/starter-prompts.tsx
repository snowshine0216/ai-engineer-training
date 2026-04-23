const PROMPTS = [
  "Explain why distributed systems are hard in one paragraph.",
  "What's the tradeoff between consistency and availability?",
  "Give me a messy ops prompt: we're seeing 5xx spikes every 10 minutes on /checkout.",
];

type Props = { onSelect: (prompt: string) => void; disabled: boolean };

export function StarterPrompts({ onSelect, disabled }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {PROMPTS.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          disabled={disabled}
          style={{
            textAlign: "left",
            padding: "10px 14px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--panel)",
            color: "var(--ink)",
            fontSize: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
