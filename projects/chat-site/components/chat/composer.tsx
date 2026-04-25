"use client";
import { type FormEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (prompt: string) => void;
  disabled: boolean;
  placeholder?: string;
};

export function Composer({ value, onChange, onSubmit, disabled, placeholder }: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        gap: 8,
        padding: "12px 24px",
        borderTop: "1px solid var(--line)",
        background: "var(--panel)",
      }}
    >
      <textarea
        id="prompt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const trimmed = value.trim();
            if (trimmed && !disabled) onSubmit(trimmed);
          }
        }}
        disabled={disabled}
        rows={2}
        maxLength={4000}
        aria-label="Message"
        placeholder={placeholder ?? "Ask anything…"}
        style={{
          flex: 1,
          padding: "10px 12px",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 15,
          fontFamily: "inherit",
          resize: "vertical",
          color: "var(--ink)",
          background: "var(--bg)",
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
          cursor: disabled || !value.trim() ? "default" : "pointer",
        }}
        aria-label="Send prompt"
      >
        {disabled ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
