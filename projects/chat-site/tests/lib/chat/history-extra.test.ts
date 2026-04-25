// tests/lib/chat/history-extra.test.ts
// Extra coverage for toAgentInput edge cases.
import { describe, it, expect } from "vitest";
import { toAgentInput } from "../../../lib/chat/history";

describe("toAgentInput (extra branches)", () => {
  it("empty messages array returns empty array", () => {
    expect(toAgentInput([])).toEqual([]);
  });

  it("assistant-only messages with content are converted correctly", () => {
    const result = toAgentInput([{ role: "assistant", content: "reply" }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "reply" }],
    });
  });

  it("alternating roles maintain correct mapping to SDK item shapes", () => {
    const msgs = [
      { role: "user" as const, content: "a" },
      { role: "assistant" as const, content: "b" },
      { role: "user" as const, content: "c" },
    ];
    const result = toAgentInput(msgs);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "user", content: "a" });
    expect(result[1]).toMatchObject({ role: "assistant", status: "completed" });
    expect(result[2]).toEqual({ role: "user", content: "c" });
  });
});
