// tests/lib/chat/history.test.ts
import { describe, it, expect } from "vitest";
import { toAgentInput, type ConversationMessage } from "../../../lib/chat/history";

describe("toAgentInput", () => {
  it("converts a single user message into a user-role item with string content", () => {
    const msgs: ConversationMessage[] = [{ role: "user", content: "hi" }];
    expect(toAgentInput(msgs)).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("converts an assistant message into output_text content array (status completed)", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello", thinking: "internal scratch" },
    ];
    expect(toAgentInput(msgs)).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "hello" }],
      },
    ]);
  });

  it("does NOT include the thinking field in the assistant input — UI-only", () => {
    const msgs: ConversationMessage[] = [
      { role: "assistant", content: "answer", thinking: "secret reasoning" },
    ];
    const out = toAgentInput(msgs);
    expect(JSON.stringify(out)).not.toContain("secret reasoning");
  });

  it("preserves order across multiple turns", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ];
    const out = toAgentInput(msgs);
    expect(out.map((m) => (m as { role: string }).role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("skips assistant messages with empty content (e.g. mid-stream placeholder)", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "q" },
      { role: "assistant", content: "" },
    ];
    expect(toAgentInput(msgs)).toEqual([{ role: "user", content: "q" }]);
  });
});
