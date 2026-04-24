import { type FormEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (prompt: string) => void;
  disabled: boolean;
};

export function Composer({ value, onChange, onSubmit, disabled }: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="prompt-input" style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
        Your prompt
      </label>
      <textarea
        id="prompt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder="Ask anything — a messy ops prompt works best."
        style={{
          width: "100%",
          padding: "12px 14px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 15,
          fontFamily: "inherit",
          resize: "vertical",
          color: "var(--ink)",
          background: "var(--panel)",
          opacity: disabled ? 0.7 : 1,
        }}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        style={{
          alignSelf: "flex-end",
          padding: "10px 20px",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          opacity: disabled || !value.trim() ? 0.5 : 1,
        }}
        aria-label="Send prompt"
      >
        {disabled ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
