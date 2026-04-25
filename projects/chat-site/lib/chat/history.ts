// lib/chat/history.ts
import type { AgentInputItem } from "@openai/agents";

export type Role = "user" | "assistant";

export type ConversationMessage = {
  role: Role;
  content: string;
  thinking?: string;
};

const userItem = (text: string): AgentInputItem => ({ role: "user", content: text });

const assistantItem = (text: string): AgentInputItem => ({
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text }],
});

export const toAgentInput = (messages: ConversationMessage[]): AgentInputItem[] =>
  messages.flatMap((m) => {
    if (m.role === "user") return [userItem(m.content)];
    if (m.content.length === 0) return [];
    return [assistantItem(m.content)];
  });
